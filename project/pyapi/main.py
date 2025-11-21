from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic import BaseModel
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
import httpx, asyncio, os, re, random
from rapidfuzz import fuzz
from urllib.parse import quote_plus  # used for building Walmart links
from typing import TypedDict, Optional # for Offer class
from urllib.parse import quote_plus, urlparse #for url parsing

# ──────────────────────────────────────────────────────────────────────────────
# App setup & configuration
# ──────────────────────────────────────────────────────────────────────────────

# Main FastAPI app
app = FastAPI(title="Walmart vs Amazon Deals (UPC-first)")

# Allow cross-origin requests from anywhere (handy for a simple frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=['*']
)

# External service configuration
SERPAPI_KEY = os.getenv("SERPAPI_KEY")

# MongoDB connection info
MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB", "MongoDB")

if not MONGO_URL:
    raise RuntimeError("MONGO_URL env var is required")

# Async MongoDB client
client = AsyncIOMotorClient(MONGO_URL)
db = client[MONGO_DB]

#Used to filter Google Shopping results
NICHE_DOMAINS = [
    "woot.com",
    "microcenter.com",
    "monoprice.com",
    "harborfreight.com",
    "vitacost.com",
    "bhphotovideo.com",
    "adorama.com",
    "ollies.us",          # or whatever domain they use
    "sierra.com",
    "tjmaxx.tjx.com",     # example for TJX brands
]


# ──────────────────────────────────────────────────────────────────────────────
# Request models
# ──────────────────────────────────────────────────────────────────────────────

class WalmartScrapeReq(BaseModel):
    """Payload for scraping Walmart search results via SerpAPI."""
    query: str
    pages: int = Field(1, ge=1, le=10)
    max_products: int = 100


class IndexAmazonByTitleReq(BaseModel):
    """
    Controls the Amazon-by-title indexing behavior.

    This walks Walmart items, and for each one that doesn't have a fresh
    Amazon cache entry, it calls SerpAPI's Amazon engine and stores
    the best-matching product in Mongo.
    """
    category: Optional[str] = None      # optional: future category filter on WM side
    kw: Optional[str] = None            # optional: regex filter on WM titles
    limit_items: int = 400              # max Walmart items to consider
    recache_hours: int = 48             # skip items with a fresh cache entry
    max_serp_calls: int = 200           # upper bound on SerpAPI calls in this run
    min_similarity: int = 86            # min RapidFuzz token_set_ratio (0–100)
    require_brand: bool = True          # if WM brand exists, require it in AMZ title
    per_call_delay_ms: int = 350        # delay between SerpAPI calls to avoid 429s



class Offer(TypedDict, total=False):
    merchant: str             # "walmart", "google_shopping", "woot", etc.
    source_domain: Optional[str]  # e.g. "woot.com", "microcenter.com"
    title: str
    price: float
    url: str
    thumbnail: Optional[str]
    brand: Optional[str]
    sim: Optional[float]      # similarity to Amazon title

class ExtensionFullProduct(BaseModel):
    asin: Optional[str] = None
    title: Optional[str] = None
    price: Optional[float] = None
    brand: Optional[str] = None
    thumbnail: Optional[str] = None

    # image-based fields
    image_url: Optional[str] = None




# ──────────────────────────────────────────────────────────────────────────────
# Regex helpers for prices, stopwords, pack/size parsing
# ──────────────────────────────────────────────────────────────────────────────

PRICE_RE = re.compile(r"(\d+(?:\.\d{1,2})?)")

# This set is used in `norm` to strip common filler words from titles
STOPWORDS = {
    "with", "and", "the", "for", "in", "of", "to", "by", "on",
    "oz", "fl", "ct", "pack", "count", "lb", "lbs", "ounce", "ounces",
}

# Rough parser for sizes/pack counts in titles like "2-pack 12oz" or "500 ml"
SIZE_RE = re.compile(
    r"(?:(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|ml|l|liter|liters))"
    r"|(?:pack\s*of\s*(\d+)|(\d+)\s*ct|\b(\d+)-?pack\b)",
    re.I,
)

# ──────────────────────────────────────────────────────────────────────────────
# Generic utility helpers
# ──────────────────────────────────────────────────────────────────────────────

def now_utc() -> datetime:
    """Return a timezone-aware UTC datetime (used for timestamps in Mongo)."""
    return datetime.now(timezone.utc)


def parse_price(v) -> Optional[float]:
    """
    Normalize various price formats into a float.

    Accepts:
      - int / float
      - dicts with price-like keys
      - strings like '$12.99', '12.99', '12,99'
    Returns:
      - float price, or None if we can't parse anything reasonable.
    """
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, dict):
        for k in ("value", "raw", "price", "extracted"):
            if k in v:
                return parse_price(v[k])
    s = str(v).replace(",", "")
    m = PRICE_RE.search(s)
    return float(m.group(1)) if m else None


async def serp_get(url: str, q: dict):
    """
    Thin wrapper around SerpAPI GET calls.

    - Injects the API key.
    - Forces 'no_cache=true' to reduce SerpAPI-side caching.
    - Adds retry logic with exponential backoff for timeouts and 429s.
    - Raises HTTPException on permanent failures.
    """
    if not SERPAPI_KEY:
        raise HTTPException(500, "SERPAPI_KEY not set")

    # Always attach API key + no_cache
    q = {**q, "api_key": SERPAPI_KEY, "no_cache": "true"}

    # Generous timeouts; these are external calls and can be slow
    timeout = httpx.Timeout(connect=20.0, read=45.0, write=20.0, pool=20.0)

    async with httpx.AsyncClient(timeout=timeout) as c:
        last_err = None

        # Allow up to 5 attempts with exponential backoff
        for attempt in range(5):
            try:
                r = await c.get(url, params=q)

                # For 4xx/5xx, bubble up but preserve the text/json of the response
                if r.status_code >= 400:
                    try:
                        detail = r.json()
                    except Exception:
                        detail = {"text": r.text}

                    # Special case: 429 → backoff & retry (unless final attempt)
                    if r.status_code == 429 and attempt < 4:
                        await asyncio.sleep(1.5 * (2 ** attempt) + random.random())
                        continue

                    raise HTTPException(status_code=r.status_code, detail=detail)

                # Success
                return r.json()

            except httpx.ReadTimeout as e:
                # Read timeout: retry with exponential backoff, or give up on last attempt
                last_err = e
                if attempt < 4:
                    await asyncio.sleep(0.8 * (2 ** attempt) + random.random())
                    continue
                raise HTTPException(status_code=504, detail="SerpAPI request timed out") from e

            except (httpx.ConnectError, httpx.RemoteProtocolError) as e:
                # Network issues: retry a few times before failing permanently
                last_err = e
                if attempt < 4:
                    await asyncio.sleep(0.6 * (2 ** attempt) + random.random())
                    continue
                raise HTTPException(status_code=502, detail="Network error calling SerpAPI") from e

        # Shouldn't really get here; guard just in case the loop exits oddly
        raise HTTPException(
            status_code=502,
            detail=str(last_err) if last_err else "Unknown SerpAPI error",
        )

#Filter google shopping results
def filter_offers_by_domains(
    offers: list[Offer],
    allowed_domains: list[str],
) -> list[Offer]:
    out: list[Offer] = []
    for o in offers:
        url = o.get("url") or ""
        domain = (o.get("source_domain") or "").lower()
        if any(d in url.lower() or d in domain for d in allowed_domains):
            out.append(o)
    return out

def extract_domain(url: str) -> Optional[str]:
    """Return the hostname (domain) for a URL, or None."""
    if not url:
        return None
    try:
        return urlparse(url).netloc.lower() or None
    except Exception:
        return None

# ──────────────────────────────────────────────────────────────────────────────
# Text / size helpers for matching titles
# ──────────────────────────────────────────────────────────────────────────────

def norm(s: str) -> str:
    """
    Normalize a product title:
      - lowercase
      - strip non-alphanumeric chars
      - remove common stopwords
    """
    if not s:
        return ""
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower())
    toks = [t for t in s.split() if t and t not in STOPWORDS]
    return " ".join(toks)


def _to_grams(val: float, unit: str) -> Optional[float]:
    """Convert a quantity + unit into a gram-like measure (or ml for liquids)."""
    u = unit.lower()
    if u in {"lb", "lbs", "pound", "pounds"}:
        return val * 453.59237
    if u in {"oz", "ounce", "ounces"}:
        return val * 28.349523125
    if u in {"kg"}:
        return val * 1000.0
    if u in {"g", "gram", "grams"}:
        return val
    if u in {"ml"}:
        return val
    if u in {"l", "liter", "liters"}:
        return val * 1000.0
    return None


def extract_size_and_count(title: str) -> Dict[str, Optional[float]]:
    """
    Best-effort size parser from a product title.

    Returns:
      - grams: approximate size per unit (or ml)
      - count: pack size / number of units
    """
    grams = None
    count = 1
    if not title:
        return {"grams": None, "count": 1}

    for m in SIZE_RE.finditer(title):
        qty, unit, pack_of, ct_alt, pack_alt = m.groups()

        # Quantity + unit (e.g., "12 oz", "1 lb")
        if qty and unit:
            g = _to_grams(float(qty), unit)
            if g:
                grams = max(grams or 0, g)

        # Pack sizes (e.g., "pack of 3", "3 ct", "3-pack")
        for v in (pack_of, ct_alt, pack_alt):
            if v and v.isdigit():
                count = max(count, int(v))

    return {"grams": grams, "count": count}


def sizes_compatible(wm_title: str, amz_title: str, threshold: float = 0.85) -> bool:
    """
    Compare Walmart vs Amazon sizes and ensure they are roughly compatible.

    If we can't parse a size from either side, we don't block the match.
    If both parse, we compare total size (grams * count) and require
    them to be within `threshold` ratio (e.g., 0.85 ⇒ within 15%).
    """
    wm = extract_size_and_count(wm_title)
    am = extract_size_and_count(amz_title)

    if not wm["grams"] or not am["grams"]:
        # Not enough info → don't reject based on size
        return True

    wm_total = wm["grams"] * max(1, wm["count"])
    am_total = am["grams"] * max(1, am["count"])
    ratio = min(wm_total, am_total) / max(wm_total, am_total)

    return ratio >= threshold
# ---------------------------
# Provider helpers 
# ---------------------------


async def provider_google_shopping(query: str) -> list[Offer]:
    data = await serp_get(
        "https://serpapi.com/search.json",
        {
            "engine": "google_shopping",
            "q": query,
            "hl": "en",
            "gl": "us",
            "product_link": "true",
        },
    )

    results = data.get("shopping_results") or []
    offers: list[Offer] = []

    print("Number of results:", len(results))

    for r in results:
        price = parse_price(r.get("extracted_price") or r.get("price"))
        if price is None:
            continue

        src = r.get("source")
        if isinstance(src, dict):
            source_domain = src.get("link") or src.get("name")
        else:
            source_domain = src

        offers.append(
            {
                "merchant": "google_shopping",
                "source_domain": source_domain,
                "title": r.get("title") or "",
                "price": float(price),
                "thumbnail": r.get("thumbnail"),
                "brand": r.get("brand"),
                "url": None
            }
        )

    return offers

async def provider_google_light_search(query: str) -> Optional[str]:
    """
    Given: "<domain> <product title>"
    Use SerpAPI Google Light API to find REAL merchant product links.
    Returns first organic result belonging to domain.
    """

    data = await serp_get(
        "https://serpapi.com/search.json",
        {
            "engine": "google_light",
            "q": query,
            "hl": "en",
            "gl": "us",
        }
    )

    domain = query.split(" ")[0].lower()
    results = data.get("organic_results") or []

    for r in results:
        link = r.get("link")
        if link and domain in link.lower():
            return link  # first valid merchant URL

    return None


# ──────────────────────────────────────────────────────────────────────────────
# Walmart ingest (via SerpAPI)
# ──────────────────────────────────────────────────────────────────────────────

async def walmart_search_page(query: str, page: int = 1):
    """
    Call SerpAPI's Walmart engine for a single search results page.
    """
    return await serp_get(
        "https://serpapi.com/search.json",
        {
            "engine": "walmart",
            "query": query,
            "page": page,
            "hl": "en",
            "gl": "us",
            # "store_id": "optional-store-id",  # for store-specific results later
            "no_cache": "true",
        },
    )

@app.post("/extension/find-deals")
async def extension_find_deals(payload: ExtensionFullProduct):
    """
    NEW VERSION:
    - No Google Lens
    - Use only Google Shopping
    - Keep url field (not clickable yet, but preserved)
    - Remove redundant sanitizing logic
    """

    if not SERPAPI_KEY:
        raise HTTPException(500, "SERPAPI_KEY not set")

    if not payload.title or not payload.price:
        raise HTTPException(400, "Missing title or price")

    # Build query: brand + title
    query = f"{payload.brand} {payload.title}" if payload.brand else payload.title

    # Google Shopping search
    try:
        gshop_offers = await provider_google_shopping(query)
    except Exception as e:
        print("Google Shopping ERROR:", e)
        gshop_offers = []

    return await _score_offers_for_extension(payload, gshop_offers)


@app.post("/extension/resolve-merchant-url")
async def resolve_merchant_url(data: dict):
    """
    Called when user clicks SAVE in the Chrome extension.
    Input:
      { "source_domain": "walmart.com", "title": "Huggies Wipes 3 Pack" }
    """
    source_domain = data.get("source_domain")
    title = data.get("title")

    if not source_domain or not title:
        raise HTTPException(400, "source_domain and title required")

    query = f"{source_domain} {title}"

    url = await provider_google_light_search(query)

    return { "resolved_url": url }


# ──────────────────────────────────────────────────────────────────────────────
# Brand / title matching helpers for Amazon
# ──────────────────────────────────────────────────────────────────────────────

def _norm_brand(b: Optional[str]) -> Optional[str]:
    """Normalize brand string: lowercase, remove non-alphanumerics, trim."""
    if not b:
        return None
    b = re.sub(r"[^a-z0-9]+", " ", b.lower()).strip()
    return b or None


def _brand_in_title(brand: Optional[str], title: Optional[str]) -> bool:
    """
    Check if a (normalized) brand appears anywhere in the title, either
    as a substring or by token overlap.
    """
    if not brand or not title:
        return False

    b = _norm_brand(brand)
    t = re.sub(r"[^a-z0-9]+", " ", title.lower())
    if not b:
        return False

    # loose contains and token-level matching
    return b in t or any(tok and tok in t for tok in b.split())


def _pick_best_amz_by_title(
    wm_title: str,
    amz_candidates: List[Dict[str, Any]],
    *,
    wm_brand: Optional[str],
    min_similarity: int,
    require_brand: bool,
) -> Optional[Dict[str, Any]]:
    """
    From a list of SerpAPI Amazon results, pick the best candidate for a given
    Walmart title using RapidFuzz token_set_ratio.

    Additional rules:
      - Filter out items without a price or title.
      - Enforce a minimum similarity score.
      - Optionally require the Walmart brand to appear in the Amazon title.
      - Slightly penalize sponsored items and very long titles.
    """
    best: Optional[Dict[str, Any]] = None
    best_score = -1

    for it in amz_candidates or []:
        title = it.get("title") or ""
        price_num = parse_price(it.get("price"))
        if not title or price_num is None:
            continue

        # String similarity between Walmart and Amazon titles
        sim = fuzz.token_set_ratio(wm_title, title)
        if sim < min_similarity:
            continue

        # If requested and brand is known, require that the brand shows up
        if require_brand and wm_brand:
            if not _brand_in_title(wm_brand, title):
                continue

        # Sponsored items get a slight penalty; shorter titles get a small bonus
        sponsored = str(it.get("badge") or it.get("sponsored") or "").lower().find("sponsor") >= 0
        adj = sim - (3 if sponsored else 0) + (2 if len(title) < 140 else 0)

        if adj > best_score:
            best_score = adj
            best = {
                "asin": it.get("asin"),
                "title": title,
                "link": it.get("link") or it.get("product_link"),
                "price_num": price_num,
                "raw_badge": it.get("badge"),
                "sim": sim,
                "thumbnail": it.get("thumbnail") or it.get("image"),
            }

    return best


async def _score_offers_for_extension(payload: ExtensionFullProduct, all_offers: list[Offer]):
    best_deals = []

    amz_title_norm = norm(payload.title)
    amz_price = float(payload.price)

    # --- NEW: precompute Amazon size / total units ---
    amz_size = extract_size_and_count(payload.title)
    amz_grams = amz_size.get("grams")
    amz_count = amz_size.get("count") or 1

    amz_units: Optional[float] = None
    amz_unit_mode: Optional[str] = None  # "weight" or "count"

    if amz_grams:
        # Use weight/volume if we have it
        amz_units = amz_grams * max(1, amz_count)
        amz_unit_mode = "weight"
    elif amz_count:
        # Fallback: treat as count-based
        amz_units = max(1, amz_count)
        amz_unit_mode = "count"

    for o in all_offers:
        sim = fuzz.token_set_ratio(amz_title_norm, norm(o["title"]))
        o["sim"] = sim

        # soft threshold for extension UX
        if sim < 70:
            continue

        price = o["price"]

        # --- NEW: try to use price-per-unit normalization when sizes are comparable ---
        savings_abs: float
        savings_pct: float

        use_unit_normalization = False
        offer_units: Optional[float] = None

        if amz_units and amz_unit_mode:
            offer_size = extract_size_and_count(o["title"])
            offer_grams = offer_size.get("grams")
            offer_count = offer_size.get("count") or 1

            if amz_unit_mode == "weight" and offer_grams:
                offer_units = offer_grams * max(1, offer_count)
            elif amz_unit_mode == "count" and not offer_grams:
                # Only use count-based comparison if neither side has weight info
                offer_units = max(1, offer_count)

            if offer_units:
                # Check that total quantity isn't wildly different
                unit_ratio = min(amz_units, offer_units) / max(amz_units, offer_units)
                # Require them to be at least ~60% similar in total quantity
                if unit_ratio >= 0.6:
                    use_unit_normalization = True

        if use_unit_normalization and amz_units and offer_units:
            # Normalize everything to "price per unit"
            amz_unit_price = amz_price / amz_units
            offer_unit_price = price / offer_units

            unit_savings = amz_unit_price - offer_unit_price
            if unit_savings <= 0:
                # No savings on a per-unit basis
                continue

            # Express savings as if you bought the same total quantity as the Amazon listing
            savings_abs = unit_savings * amz_units
            savings_pct = (unit_savings / amz_unit_price) * 100 if amz_unit_price > 0 else 0.0
        else:
            # Fallback: original raw-price comparison
            savings_abs = amz_price - price
            if savings_abs <= 0:
                continue
            savings_pct = (savings_abs / amz_price) * 100 if amz_price > 0 else 0.0

        # basic minimum savings filter
        if savings_abs < 2.0 and savings_pct < 5.0:
            continue

        best_deals.append({
            "merchant": o["merchant"],
            "source_domain": o.get("source_domain"),
            "title": o["title"],
            "price": price,
            "url": o["url"],
            "thumbnail": o.get("thumbnail"),
            "brand": o.get("brand"),
            "sim": sim,
            "savings_abs": savings_abs,
            "savings_pct": savings_pct,
        })

    # Sort by absolute normalized savings, best first
    best_deals.sort(key=lambda d: d["savings_abs"], reverse=True)

    return {
        "match_found": len(best_deals) > 0,
        "amazon": {
            "asin": payload.asin,
            "title": payload.title,
            "price": amz_price,
            "brand": payload.brand,
            "thumbnail": payload.thumbnail,
        },
        "best_deals": best_deals[:5],  # top 5
    }



# ──────────────────────────────────────────────────────────────────────────────
# Walmart scraping endpoint
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/walmart/scrape")
async def walmart_scrape(req: WalmartScrapeReq, wm_coll: Optional[str] = Query(None)):
    """
    Scrape Walmart search results via SerpAPI and store them in a Mongo collection.

    - `wm_coll` must be the name of the Walmart Mongo collection to write into.
    - Upserts by product_id so repeated runs refresh pricing/title instead
      of duplicating documents.
    """
    WM = db[wm_coll]
    inserted = updated = total = 0
    pages_fetched = 0
    page_errors = 0

    for pg in range(1, req.pages + 1):
        if total >= req.max_products:
            break
        
        try:
            data = await walmart_search_page(req.query, page=pg)
            items = data.get("organic_results", []) or []
            pages_fetched += 1
        except Exception as e:
            # Log the full error details
            print("SERPAPI ERROR during walmart_search_page:")
            print(f"  Status: {e.status_code}")
            print(f"  Detail: {e.detail}")


            page_errors += 1
            await asyncio.sleep(1.0 + random.random())
            continue

        for it in items:
            if total >= req.max_products:
                break

            pid = it.get("product_id")
            if not pid:
                continue

            # Walmart returns price info in various places; normalize it
            po = it.get("primary_offer") or {}
            price = parse_price(po.get("offer_price") or po.get("price") or it.get("price"))
            if price is None:
                continue

            # Build a robust link with sensible fallbacks
            raw_link = it.get("link")
            title = it.get("title") or ""

            if not raw_link and pid:
                raw_link = f"https://www.walmart.com/ip/{pid}"

            if not raw_link and title:
                raw_link = f"https://www.walmart.com/search?q={quote_plus(title)}"

            doc = {
                "product_id": str(pid),
                "title": title,
                "brand": it.get("brand"),
                "price": price,
                "link": raw_link,
                "thumbnail": it.get("thumbnail"),
                "category": it.get("category"),
                "updatedAt": now_utc(),
            }

            await WM.update_one(
                {"product_id": str(pid)},
                {"$set": doc, "$setOnInsert": {"createdAt": now_utc()}},
                upsert=True,
            )
            total += 1

        # Gentle delay between pages to avoid SerpAPI rate limits
        await asyncio.sleep(0.4 + random.random() * 0.3)

    return {
        "query": req.query,
        "pages_requested": req.pages,
        "pages_fetched": pages_fetched,
        "page_errors": page_errors,
        "inserted": inserted,
        "updated": updated,
        "total": total,
    }

# ──────────────────────────────────────────────────────────────────────────────
# Amazon indexing by title (SerpAPI → cache in Mongo)
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/amazon/index-by-title")
async def index_amazon_by_title(
    req: IndexAmazonByTitleReq,
    wm_coll: Optional[str] = Query(None),
    amz_coll: Optional[str] = Query(None),
):
    """
    For each Walmart item in `wm_coll`, look up a matching Amazon product via
    SerpAPI and store a normalized cache entry in `amz_coll`.

    Documents in `amz_coll` are keyed as:
      - key_type = "wm_pid"
      - key_val  = Walmart product_id
    """
    if not SERPAPI_KEY:
        raise HTTPException(500, "SERPAPI_KEY not set")

    wm_db = db[wm_coll]
    amz_db = db[amz_coll]

    # Base filter: only items with a non-empty title
    match: Dict[str, Any] = {"title": {"$exists": True, "$ne": None}}
    if req.kw:
        # Optional regex filter on Walmart titles
        match["title"] = {"$regex": req.kw, "$options": "i"}

    cutoff = datetime.utcnow() - timedelta(hours=req.recache_hours)

    # Recent Walmart items, capped by limit_items
    wm_candidates = await wm_db.find(
        match,
        {"_id": 0, "product_id": 1, "title": 1, "brand": 1, "price": 1, "updatedAt": 1},
    ).sort([("updatedAt", -1)]).limit(req.limit_items).to_list(req.limit_items)

    # Filter out those that already have a fresh Amazon cache entry
    to_fetch: List[Dict[str, Any]] = []
    for it in wm_candidates:
        pid = str(it.get("product_id") or "")
        if not pid:
            continue
        cached = await amz_db.find_one(
            {"key_type": "wm_pid", "key_val": pid, "checked_at": {"$gte": cutoff}},
            {"_id": 1},
        )
        if not cached:
            to_fetch.append(it)

    # Hard cap on SerpAPI spend for this call
    to_fetch = to_fetch[: max(0, req.max_serp_calls)]

    fetched_now = 0
    misses = 0
    skipped_no_pid = 0

    for it in to_fetch:
        pid = str(it.get("product_id") or "")
        if not pid:
            skipped_no_pid += 1
            continue

        wm_title = it.get("title") or ""
        wm_brand = it.get("brand")

        # Construct a query string; prepend brand when available
        search_kw = wm_title if not wm_brand else f"{wm_brand} {wm_title}"

        try:
            data = await serp_get(
                "https://serpapi.com/search.json",
                {
                    "engine": "amazon",
                    "amazon_domain": "amazon.com",
                    "k": search_kw,  # SerpAPI Amazon uses 'k' for keywords
                    "gl": "us",
                    "hl": "en",
                },
            )
        except HTTPException as e:
            # If SerpAPI fails, mark this pid as a miss so we don't hammer it
            await amz_db.update_one(
                {"key_type": "wm_pid", "key_val": pid},
                {"$set": {
                    "key_type": "wm_pid",
                    "key_val": pid,
                    "checked_at": datetime.utcnow(),
                    "miss": True,
                    "err": f"serpapi:{e.status_code}",
                }},
                upsert=True,
            )
            misses += 1
            await asyncio.sleep(req.per_call_delay_ms / 1000.0)
            continue

        candidates = data.get("organic_results") or []

        best = _pick_best_amz_by_title(
            wm_title,
            candidates,
            wm_brand=wm_brand,
            min_similarity=req.min_similarity,
            require_brand=req.require_brand,
        )

        if not best:
            # No acceptable match (below threshold / brand mismatch / etc.)
            await amz_db.update_one(
                {"key_type": "wm_pid", "key_val": pid},
                {"$set": {
                    "key_type": "wm_pid",
                    "key_val": pid,
                    "checked_at": datetime.utcnow(),
                    "miss": True,
                    "last_title": wm_title,
                    "last_brand": wm_brand,
                }},
                upsert=True,
            )
            misses += 1
        else:
            # Store a normalized cache document for this Walmart product_id
            doc = {
                "key_type": "wm_pid",
                "key_val": pid,
                "amz": {
                    "asin": best.get("asin"),
                    "title": best.get("title"),
                    "link": best.get("link"),
                    "thumbnail": best.get("thumbnail"),
                    "match_score_sim": best.get("sim"),  # 0..100 RapidFuzz token_set_ratio
                    "brand_required": bool(req.require_brand and wm_brand),
                },
                "price": best.get("price_num"),
                "checked_at": datetime.utcnow(),
                "last_title": wm_title,
                "last_brand": wm_brand,
            }
            await amz_db.update_one(
                {"key_type": "wm_pid", "key_val": pid},
                {"$set": doc},
                upsert=True,
            )
            fetched_now += 1

        # Throttle between calls to stay under SerpAPI 429 limits
        await asyncio.sleep(req.per_call_delay_ms / 1000.0)

    return {
        "considered": len(wm_candidates),
        "queued": len(to_fetch),
        "fetched_now": fetched_now,
        "misses": misses,
        "skipped_no_pid": skipped_no_pid,
        "threshold": req.min_similarity,
        "brand_required": req.require_brand,
        "recache_hours": req.recache_hours,
    }

# ──────────────────────────────────────────────────────────────────────────────
# Deals endpoint (joins WM items with cached Amazon matches)
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/deals/by-title")
async def deals_by_title(
    min_abs: float = 5.0,
    min_pct: float = 0.20,
    min_sim: int = 86,
    limit: int = 100,
    wm_coll: Optional[str] = Query(None),
    amz_coll: Optional[str] = Query(None),
):
    """
    Compute “deals” by joining Walmart items with their cached Amazon matches
    (from `amazon/index-by-title`), and filtering by:

      - min_abs: minimum absolute savings (amz_price - wm_price)
      - min_pct: minimum relative savings (percentage)
      - min_sim: minimum cached similarity score from RapidFuzz
    """
    wm_db = db[wm_coll]
    amz_db = db[amz_coll]

    # Pull a bit more than limit so we can filter aggressively
    wm_items = await wm_db.find({}).to_list(length=limit * 5)

    deals: List[Dict[str, Any]] = []

    for wm in wm_items:
        wm_price = parse_price(wm.get("price"))
        if not wm_price:
            continue

        pid = str(wm.get("product_id") or "")
        if not pid:
            continue

        # Look up the cached Amazon match for this product_id
        amz_cache = await amz_db.find_one({"key_type": "wm_pid", "key_val": pid})
        if not amz_cache:
            continue

        amz_price = parse_price(amz_cache.get("price"))
        amz_meta = amz_cache.get("amz") or {}
        sim_score = amz_meta.get("match_score_sim") or 0

        # Require both a price and a strong similarity score
        if not amz_price or sim_score < min_sim:
            continue

        diff = amz_price - wm_price
        pct = diff / amz_price if amz_price > 0 else 0

        # Filter for actual deals based on both absolute & percentage savings
        if diff >= min_abs and pct >= min_pct:
            deals.append(
                {
                    "wm": {
                        "title": wm.get("title"),
                        "price": wm_price,
                        "link": wm.get("link"),
                        "thumbnail": wm.get("thumbnail"),
                    },
                    "amz": {
                        "title": amz_meta.get("title"),
                        "price": amz_price,
                        "link": amz_meta.get("link"),
                        "thumbnail": amz_meta.get("thumbnail"),
                        "sim": sim_score,
                    },
                    "savings_abs": diff,
                    "savings_pct": round(pct * 100, 2),
                }
            )

        if len(deals) >= limit:
            break

    # Sort deals by absolute savings, best first
    deals.sort(key=lambda d: d["savings_abs"], reverse=True)

    return {"count": len(deals), "deals": deals[:limit]}


# ──────────────────────────────────────────────────────────────────────────────
# Clear Category endpoint (used for debugging and clearing category collections)
# ─────────
@app.delete("/debug/clear-category")
async def clear_category(
    wm_coll: Optional[str] = Query(None),
    amz_coll: Optional[str] = Query(None),
    match_coll: Optional[str] = Query(None),
):
    """
    Utility: clear one or more per-category collections, e.g.
      - wm_hair_care
      - amz_hair_care
      - match_hair_care
    """
    result = {}

    if wm_coll:
      res = await db[wm_coll].delete_many({})
      result["walmart_deleted"] = res.deleted_count

    if amz_coll:
      res = await db[amz_coll].delete_many({})
      result["amazon_deleted"] = res.deleted_count

    if match_coll:
      res = await db[match_coll].delete_many({})
      result["match_deleted"] = res.deleted_count

    return result

