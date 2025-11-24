from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio, os, re, random
# Internal imports
from models import AmazonScrapeReq, ExtensionFullProduct
from services import amazon_search_page, provider_google_shopping, provider_google_search
from utils import now_utc, parse_price, _score_offers_for_extension

# App + Environment Setup
SERPAPI_KEY = os.getenv("SERPAPI_KEY")
app = FastAPI(title="Amazon Deals")
# Allow frontend to communicate freely (Chrome extension + dashboard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# MongoDB Setup
MONGO_URL = os.getenv("MONGO_URL")
MONGO_DB = os.getenv("MONGO_DB", "MongoDB")
if not MONGO_URL:
    raise RuntimeError("MONGO_URL env var is required")
client = AsyncIOMotorClient(MONGO_URL)
db = client[MONGO_DB]

# Chrome Extension: Find Deals (core deal-finding logic)
@app.post("/extension/find-deals")
async def extension_find_deals(payload: ExtensionFullProduct):
    """
    Chrome extension calls this to fetch the top 5 deals
    for a given Amazon product.

    Flow:
    1. Build a Google Shopping query ("brand title")
    2. Fetch Google Shopping results
    3. Run our full scoring engine (text similarity, image similarity, units)
    4. Return best 5 deals
    """

    if not SERPAPI_KEY:
        raise HTTPException(500, "SERPAPI_KEY not set")

    if not payload.title or not payload.price:
        raise HTTPException(400, "Missing title or price")

    query = f"{payload.brand} {payload.title}" if payload.brand else payload.title

    # Fetch Google Shopping offers
    try:
        gshop_offers = await provider_google_shopping(query)
    except Exception as e:
        print("Google Shopping ERROR:", e)
        gshop_offers = []

    return await _score_offers_for_extension(payload, gshop_offers)

# Chrome Extension: Resolve merchant URL (used when saving a product)
@app.post("/extension/resolve-merchant-url")
async def resolve_merchant_url(data: dict):
    """
    The Chrome extension calls this when the user presses SAVE.
    The goal: find a *direct product URL* on the merchant’s site.

    Input example:
    {
        "source_domain": "microcenter.com",
        "title": "Logitech G502 Mouse",
        "expected_price": 49.99
    }

    Strategy:
    - Make a Google Search query: "<domain> <title>"
    - Look through shopping_results first (price-aware)
    - If no strong match, look in organic_results
    """

    source_domain = data.get("source_domain")
    title = data.get("title")

    if not source_domain or not title:
        raise HTTPException(400, "source_domain and title required")

    expected_price = data.get("expected_price")
    query = f"{source_domain} {title}"

    url = await provider_google_search(
        query,
        expected_title=title,
        expected_price=expected_price,
    )

    return {"resolved_url": url}

# Amazon Scraping (SERP to get Amazon organic results)
@app.post("/amazon/scrape-category")
async def amazon_scrape_category(req: AmazonScrapeReq, amz_coll: Optional[str] = Query(None)):
    """
    Scrape up to `max_products` Amazon organic results for a given query.

    Notes:
    - Skips multipacks, bundles, bulk sizes
    - Inserts/updates into `amz_coll`
    - Does NOT return deals — just builds our Amazon product database
    """

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

            # Skip multipacks/bulk, quality control
            t = title.lower()

            if "pack of" in t:
                continue

            if re.search(r"\b\d+\s*(pack|packet|bundle|variety|ct|count)\b", t):
                continue

            if re.search(r"\b\d+\s*pk\b", t):
                continue

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

            # Upsert Amazon product
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
        "total": total,
    }

# Google Shopping Indexing (where the real deal matching happens)
@app.post("/google-shopping/index-by-title")
async def google_index_by_title(
    amz_coll: str = Query(...),
    match_coll: str = Query(...),
    limit_items: int = 300,
    per_call_delay_ms: int = 400
):
    """
    This builds the MATCH collection.
    Flow:
    - Iterate through Amazon products
    - Query Google Shopping using "<merchant> <title>"
    - Score all offers using the SAME pipeline as the Chrome extension
    - Store top 5 offers + best_match in match_coll
    """
    if not SERPAPI_KEY:
        raise HTTPException(500, "SERPAPI_KEY not set")

    AMZ = db[amz_coll]
    MATCH = db[match_coll]

    # Fetch Amazon items
    amz_items = await AMZ.find(
        {},
        {
            "_id": 0,
            "asin": 1,
            "title": 1,
            "brand": 1,
            "price": 1,
            "thumbnail": 1,
            "image_url": 1,
        }
    ).limit(limit_items).to_list(length=limit_items)

    processed = 0
    misses = 0

    for item in amz_items:
        asin = item.get("asin")
        if not asin:
            continue

        # Skip items already indexed once
        cached = await MATCH.find_one({"key_val": asin})
        if cached:
            continue

        brand = item.get("brand") or ""
        title = item.get("title") or ""
        query = f"{brand} {title}".strip()

        # Pull Google Shopping offers
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
                        "miss": True,
                    }
                },
                upsert=True
            )

            misses += 1
            continue

        # Score offers using the extension's logic
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

        # Save match info
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
            "best_match": top_match,
            "best_deals": best_deals,
            "offers": best_deals,    # Used by frontend dashboard
        }

        await MATCH.update_one(
            {"key_val": asin},
            {"$set": doc},
            upsert=True
        )

        processed += 1
        await asyncio.sleep(per_call_delay_ms / 1000.0)

    return {
        "processed": processed,
        "misses": misses,
        "total_in_amazon_collection": len(amz_items),
    }

# Deals Endpoint (dashboard uses this)
@app.get("/deals/google")
async def deals_google(
    match_coll: Optional[str] = Query(None),
    limit: int = 100
):
    """
    Frontend dashboard calls this to load deals.

    It:
    - Reads the MATCH collection
    - Applies final savings filters
    - Sorts by strongest absolute savings
    """

    MATCH = db[match_coll]

    matches = await MATCH.find(
        {"match_found": True},
        {"_id": 0},
    ).to_list(limit * 5)

    deals = []

    for m in matches:
        amz = m.get("amazon")
        offers = m.get("offers") or m.get("best_deals") or []

        if not amz or not offers:
            continue

        top = offers[0]
        amz_price = float(amz["price"])
        other_price = float(top["price"])

        # Require meaningful savings
        savings_abs = amz_price - other_price
        if savings_abs < 2:
            continue

        pct = savings_abs / amz_price
        if pct < 0.05:
            continue

        deals.append({
            "amazon": amz,
            "offers": offers,
        })

        if len(deals) >= limit:
            break

    # Sort by absolute savings DESC
    deals.sort(
        key=lambda d: float(d["amazon"]["price"]) - float(d["offers"][0]["price"]),
        reverse=True
    )

    return {"count": len(deals), "deals": deals[:limit]}

# Full Ingest (Amazon scrape, then Google index)
@app.post("/amazon/full-ingest")
async def amazon_full_ingest(
    query: str = Query(...),
    amz_coll: str = Query(...),
    match_coll: str = Query(...),
    pages: int = 2
):
    """
    Convenience endpoint:
    Step 1: Scrape Amazon items
    Step 2: Index them with Google Shopping
    """

    await amazon_scrape_category(
        AmazonScrapeReq(query=query, pages=pages),
        amz_coll=amz_coll
    )

    await google_index_by_title(
        amz_coll=amz_coll,
        match_coll=match_coll
    )

    return {"status": "complete"}

# Debugging utility, Clears category collections
@app.delete("/debug/clear-category")
async def clear_category(
    amz_coll: Optional[str] = Query(None),
    match_coll: Optional[str] = Query(None),
):
    """
    Clear one or more collections.
    """
    result = {}

    if amz_coll:
        res = await db[amz_coll].delete_many({})
        result["amazon_deleted"] = res.deleted_count

    if match_coll:
        res = await db[match_coll].delete_many({})
        result["match_deleted"] = res.deleted_count

    return result
