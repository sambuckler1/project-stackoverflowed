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
# pHash image comparison
from PIL import Image
import imagehash
from io import BytesIO

# ──────────────────────────────────────────────────────────────────────────────
# App setup & configuration
# ──────────────────────────────────────────────────────────────────────────────

# Main FastAPI app
app = FastAPI(title="Amazon Deals")

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

# ──────────────────────────────────────────────────────────────────────────────
# Request models
# ──────────────────────────────────────────────────────────────────────────────

class AmazonScrapeReq(BaseModel):
    query: str                      # keyword search (e.g. "hair clippers")
    pages: int = Field(1, ge=1, le=10)
    max_products: int = 100

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

def extract_domain(url: str) -> Optional[str]:
    """Return the hostname (domain) for a URL, or None."""
    if not url:
        return None
    try:
        return urlparse(url).netloc.lower() or None
    except Exception:
        return None

async def fetch_image_bytes(url: str) -> Optional[bytes]:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(url)
            if r.status_code == 200:
                return r.content
    except Exception:
        return None
    return None

async def compute_phash(url: str) -> Optional[imagehash.ImageHash]:
    """
    Download image → compute pHash.
    Returns ImageHash object or None.
    """
    data = await fetch_image_bytes(url)
    if not data:
        return None

    try:
        img = Image.open(BytesIO(data)).convert("RGB")
        return imagehash.phash(img)
    except Exception:
        return None


def phash_similarity(hash1, hash2) -> float:
    """
    Returns similarity percentage between two pHash values.
    Lower hamming distance = more similar.
    """
    if not hash1 or not hash2:
        return 0.0

    # hamming distance ranges 0–64
    dist = hash1 - hash2
    sim = 1 - (dist / 64)
    return max(0.0, min(1.0, sim)) * 100.0

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

import difflib

async def provider_google_search(
    query: str,
    expected_title: str = "",
    expected_price: float = None
) -> Optional[str]:
    """
    High-accuracy merchant URL resolver using SerpAPI Google Search:
    1. Check shopping_results first (best for product URLs + prices)
    2. Fallback to organic_results
    """

    data = await serp_get(
        "https://serpapi.com/search.json",
        {
            "engine": "google",
            "q": query,
            "hl": "en",
            "gl": "us",
        }
    )

    domain = query.split(" ")[0].lower()
    expected_title_norm = expected_title.lower().strip()

    # --------------------------------------------------------
    # 1. Try SHOPPING RESULTS first (best quality matches)
    # --------------------------------------------------------
    shopping = data.get("shopping_results") or []

    best_score = -1
    best_link = None

    for r in shopping:
        link = r.get("link")
        title = (r.get("title") or "").lower()
        price = parse_price(r.get("extracted_price") or r.get("price"))
        source = (r.get("source") or "").lower()

        if not link:
            continue

        # Require domain match in source (stronger than organic)
        if domain not in source:
            continue

        # Title similarity
        title_sim = difflib.SequenceMatcher(None, title, expected_title_norm).ratio()

        # Price similarity
        price_sim = 0
        if expected_price and price:
            diff_pct = abs(price - expected_price) / max(expected_price, 1)
            price_sim = max(0, 1 - diff_pct)

        score = (title_sim * 0.75) + (price_sim * 0.25)

        if score > best_score:
            best_score = score
            best_link = link

    # If high-confidence shopping result found → return it
    if best_link and best_score >= 0.40:
        return best_link

    # --------------------------------------------------------
    # 2. FALLBACK: Organic Results (secondary quality)
    # --------------------------------------------------------
    organic = data.get("organic_results") or []

    for r in organic:
        link = r.get("link")
        title = (r.get("title") or "").lower()
        snippet = r.get("snippet", "")

        if not link:
            continue

        if domain not in link.lower():
            continue

        # Title similarity
        title_sim = difflib.SequenceMatcher(None, title, expected_title_norm).ratio()

        # Price extraction from snippet
        price_sim = 0
        found_price = extract_price_from_text(title + " " + snippet)
        if expected_price and found_price:
            diff_pct = abs(found_price - expected_price) / max(expected_price, 1)
            price_sim = max(0, 1 - diff_pct)

        score = (title_sim * 0.70) + (price_sim * 0.30)

        if score > best_score:
            best_score = score
            best_link = link

    return best_link if best_score >= 0.40 else None



# ──────────────────────────────────────────────────────────────────────────────
# Walmart ingest (via SerpAPI)
# ──────────────────────────────────────────────────────────────────────────────

async def amazon_search_page(query: str, page: int = 1):
    return await serp_get(
        "https://serpapi.com/search.json",
        {
            "engine": "amazon",
            "amazon_domain": "amazon.com",
            "k": query,
            "page": page,
            "gl": "us",
            "hl": "en",
        }
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
    expected_price = data.get("expected_price")

    url = await provider_google_search(
    query,
    expected_title=title,
    expected_price=expected_price
)

    return { "resolved_url": url }


# ──────────────────────────────────────────────────────────────────────────────
# Brand / title matching helpers for Amazon
# ─────────────────────────────────────────────────────────────────────────────

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

    amazon_hash = await compute_phash(payload.thumbnail or payload.image_url)

    for o in all_offers:
        # ----- TEXT SIMILARITY -----
        text_sim = fuzz.token_set_ratio(amz_title_norm, norm(o["title"]))
        o["sim"] = text_sim

        if text_sim < 60:
            continue

        # ----- IMAGE SIMILARITY -----
        offer_hash = await compute_phash(o.get("thumbnail"))

        if amazon_hash and offer_hash:
            img_sim = phash_similarity(amazon_hash, offer_hash)
        else:
            img_sim = 0.0

        # Combined similarity (60% text, 40% image)
        combined_sim = (text_sim * 0.6) + (img_sim * 0.4)

        # Reject weak overall matches
        if combined_sim < 55:
            continue

        price = o["price"]

        # ----- PRICE SAVINGS LOGIC (unchanged) -----
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
                offer_units = max(1, offer_count)

            if offer_units:
                unit_ratio = min(amz_units, offer_units) / max(amz_units, offer_units)
                if unit_ratio >= 0.6:
                    use_unit_normalization = True

        if use_unit_normalization and amz_units and offer_units:
            amz_unit_price = amz_price / amz_units
            offer_unit_price = price / offer_units

            unit_savings = amz_unit_price - offer_unit_price
            if unit_savings <= 0:
                continue

            savings_abs = unit_savings * amz_units
            savings_pct = (unit_savings / amz_unit_price) * 100 if amz_unit_price > 0 else 0.0
        else:
            savings_abs = amz_price - price
            if savings_abs <= 0:
                continue
            savings_pct = (savings_abs / amz_price) * 100 if amz_price > 0 else 0.0

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
            "sim": text_sim,
            "img_sim": img_sim,
            "combined_sim": combined_sim,
            "savings_abs": savings_abs,
            "savings_pct": savings_pct,
        })


    # Sort 
    best_deals.sort(key=lambda d: (d["combined_sim"], d["savings_abs"]), reverse=True)

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

def extract_price_from_text(text: str) -> float:
    matches = re.findall(r"\$\s?(\d+(?:\.\d+)?)", text)
    if not matches:
        return None
    try:
        return float(matches[0])
    except:
        return None



# ──────────────────────────────────────────────────────────────────────────────
# Product Finder Amazon Scraping Endpoint
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/amazon/scrape-category")
async def amazon_scrape_category(req: AmazonScrapeReq, amz_coll: Optional[str] = Query(None)):
    if not SERPAPI_KEY:
        raise HTTPException(500, "SERPAPI_KEY not set")

    AMZ = db[amz_coll]
    total = 0
    pages_fetched = 0
    page_errors = 0

    for pg in range(1, req.pages + 1):
        if total >= req.max_products:
            break

        try:
            data = await amazon_search_page(req.query, page=pg)
            items = data.get("organic_results") or []
            pages_fetched += 1
        except Exception as e:
            print("SERPAPI ERROR during amazon_search_page:", e)
            page_errors += 1
            await asyncio.sleep(1.0 + random.random())
            continue

        for it in items:
            if total >= req.max_products:
                break

            asin = it.get("asin")
            title = it.get("title")
            price = parse_price(it.get("price"))
            brand = it.get("brand")
            link = it.get("link") or it.get("product_link")
            thumbnail = it.get("thumbnail") or it.get("image")

            if not asin or not title or not price:
                continue

            # ---------------------------------------------------
            # SKIP MULTI-PACK, COUNT, OR BULK LISTINGS
            # ---------------------------------------------------
            t = title.lower()

            # skip “pack of X”
            if "pack of" in t:
                continue

            # skip "X pack", "X-pack", "X ct", "X count"
            if re.search(r"\b\d+\s*(pack|ct|count)\b", t):
                continue

            # skip things like “3-in-1”, “4pk”, “2pk”, etc.
            if re.search(r"\b\d+\s*pk\b", t):
                continue

            # Optional: skip size bundles like “2 x 16oz”
            if re.search(r"\b\d+\s*x\s*\d+", t):
                continue

            doc = {
                "asin": asin,
                "title": title,
                "brand": brand,
                "price": price,
                "thumbnail": thumbnail,
                "image_url": thumbnail,
                "link": link,
                "updatedAt": now_utc(),
            }

            await AMZ.update_one(
                {"asin": asin},
                {"$set": doc, "$setOnInsert": {"createdAt": now_utc()}},
                upsert=True,
            )
            total += 1

        await asyncio.sleep(0.4 + random.random() * 0.3)

    return {
        "query": req.query,
        "pages_requested": req.pages,
        "pages_fetched": pages_fetched,
        "page_errors": page_errors,
        "total": total
    }




# ──────────────────────────────────────────────────────────────────────────────
# Amazon indexing by title (SerpAPI → cache in Mongo)
# ──────────────────────────────────────────────────────────────────────────────


@app.post("/google-shopping/index-by-title")
async def google_index_by_title(
    amz_coll: str = Query(...),
    match_coll: str = Query(...),
    limit_items: int = 300,
    per_call_delay_ms: int = 400
):
    """
    Loop through Amazon items in amz_coll, search on Google Shopping,
    score using the extension's matcher, and store the TOP MATCH ONLY
    into match_coll.
    
    - No domain filtering
    - No requerying misses
    - No caching rules
    """

    if not SERPAPI_KEY:
        raise HTTPException(500, "SERPAPI_KEY not set")

    AMZ = db[amz_coll]
    MATCH = db[match_coll]

    # Fetch Amazon items to process
    amz_items = await AMZ.find(
        {},
        {
            "_id": 0,
            "asin": 1,
            "title": 1,
            "brand": 1,
            "price": 1,
            "thumbnail": 1,
            "image_url": 1
        }
    ).limit(limit_items).to_list(length=limit_items)

    processed = 0
    misses = 0

    for item in amz_items:
        asin = item.get("asin")
        if not asin:
            continue

        # Skip if we already attempted this item (no re-querying misses or hits)
        cached = await MATCH.find_one({"key_val": asin})
        if cached:
            continue

        # Build search query for Google Shopping
        brand = item.get("brand") or ""
        title = item.get("title") or ""
        query = f"{brand} {title}".strip()

        # Call Google Shopping provider
        try:
            offers = await provider_google_shopping(query)
        except Exception as e:
            print("Google Shopping ERROR:", e)

            await MATCH.update_one(
                {"key_val": asin},
                {
                    "$set": {
                        "key_type": "asin",
                        "key_val": asin,
                        "checked_at": now_utc(),
                        "miss": True
                    }
                },
                upsert=True
            )

            misses += 1
            continue

        # Score using extension’s scoring logic
        payload = ExtensionFullProduct(
            asin=asin,
            title=title,
            price=float(item["price"]),
            brand=item.get("brand"),
            thumbnail=item.get("thumbnail"),
            image_url=item.get("image_url"),
        )

        scored = await _score_offers_for_extension(payload, offers)

        best_deals = scored.get("best_deals") or []
        top_match = best_deals[0] if best_deals else None

        doc = {
            "key_type": "asin",
            "key_val": asin,
            "checked_at": now_utc(),
            "match_found": len(best_deals) > 0,
            "amazon": {
                "asin": asin,
                "title": item.get("title"),
                "price": item.get("price"),
                "brand": item.get("brand"),
                "thumbnail": item.get("thumbnail"),
                "image_url": item.get("image_url"),
            },
            "best_match": top_match,      # keep for extension (unchanged)
            "best_deals": best_deals,     # keep for extension (unchanged)
            "offers": best_deals,         # NEW for dashboard
        }


        # Save result
        await MATCH.update_one(
            {"key_val": asin},
            {"$set": doc},
            upsert=True
        )

        processed += 1

        # Throttle to avoid 429s
        await asyncio.sleep(per_call_delay_ms / 1000.0)

    return {
        "processed": processed,
        "misses": misses,
        "total_in_amazon_collection": len(amz_items)
    }



# ──────────────────────────────────────────────────────────────────────────────
# Deals endpoint (joins WM items with cached Amazon matches)
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/deals/google")
async def deals_google(
    match_coll: Optional[str] = Query(None),
    limit: int = 100
):
    MATCH = db[match_coll]

    matches = await MATCH.find(
        {"match_found": True},
        {"_id": 0}
    ).to_list(limit * 5)

    deals = []

    for m in matches:
        amz = m.get("amazon")
        offers = m.get("offers") or m.get("best_deals") or []

        if not amz or not offers:
            continue

        # compute savings from BEST OFFER
        top = offers[0]
        amz_price = float(amz["price"])
        other_price = float(top["price"])

        savings_abs = amz_price - other_price
        if savings_abs < 2:
            continue

        pct = savings_abs / amz_price
        if pct < 0.05:
            continue

        deals.append({
            "amazon": amz,
            "offers": offers,   # top-5 offers
        })

        if len(deals) >= limit:
            break


    deals.sort(
    key=lambda d: float(d["amazon"]["price"]) - float(d["offers"][0]["price"]),
    reverse=True
    )

    return {"count": len(deals), "deals": deals[:limit]}

@app.post("/amazon/full-ingest")
async def amazon_full_ingest(
    query: str = Query(...),
    amz_coll: str = Query(...),
    match_coll: str = Query(...),
    pages: int = 2
):
    # Step 1: Ingest Amazon
    await amazon_scrape_category(
        AmazonScrapeReq(query=query, pages=pages),
        amz_coll=amz_coll
    )

    # Step 2: Google Shopping match
    await google_index_by_title(
        amz_coll=amz_coll,
        match_coll=match_coll
    )

    return {"status": "complete"}

# ──────────────────────────────────────────────────────────────────────────────
# Clear Category endpoint (used for debugging and clearing category collections)
# ──────────────────────────────────────────────────────────────────────────────
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

