import os, httpx, asyncio, random, difflib
from typing import Optional, List
from fastapi import HTTPException
from utils import parse_price, extract_price_from_text
from models import Offer

# Load API key from environment
SERPAPI_KEY = os.getenv("SERPAPI_KEY")

# Core SerpAPI Request Helper
async def serp_get(url: str, q: dict):
    """
    Wrapper around SerpAPI HTTP GET.

    Features:
      - Adds API key + disables caching
      - Retries on 429 with exponential backoff
      - Retries on network errors/timeouts
      - Raises HTTPException on fatal errors
    """
    if not SERPAPI_KEY:
        raise HTTPException(500, "SERPAPI_KEY not set")

    # Inject API key + no cache
    q = {**q, "api_key": SERPAPI_KEY, "no_cache": "true"}

    # API calls can be slow, increase timeout
    timeout = httpx.Timeout(connect=20.0, read=45.0, write=20.0, pool=20.0)

    async with httpx.AsyncClient(timeout=timeout) as c:
        last_err = None

        # Up to 5 retry attempts
        for attempt in range(5):
            try:
                r = await c.get(url, params=q)

                # Error handling
                if r.status_code >= 400:
                    # Try decoding JSON detail
                    try:
                        detail = r.json()
                    except:
                        detail = {"text": r.text}

                    # Handle rate limit with retry
                    if r.status_code == 429 and attempt < 4:
                        await asyncio.sleep(1.5 * (2 ** attempt) + random.random())
                        continue

                    raise HTTPException(r.status_code, detail)

                return r.json()

            except httpx.ReadTimeout as e:
                last_err = e
                if attempt < 4:
                    await asyncio.sleep(0.8 * (2 ** attempt) + random.random())
                    continue
                raise HTTPException(504, "SerpAPI request timed out")

            except (httpx.ConnectError, httpx.RemoteProtocolError) as e:
                last_err = e
                if attempt < 4:
                    await asyncio.sleep(0.6 * (2 ** attempt) + random.random())
                    continue
                raise HTTPException(502, "Network error calling SerpAPI")

        raise HTTPException(502, str(last_err) or "Unknown SerpAPI error")

# Google Shopping Provider
async def provider_google_shopping(query: str) -> List[Offer]:
    """
    Fetch Google Shopping results for a given query.
    Returns a list of Offer dicts with:
      - title
      - price
      - thumbnail
      - source_domain
      - url
    """
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
    offers: List[Offer] = []

    print("Google Shopping results:", len(results))

    for r in results:
        price = parse_price(r.get("extracted_price") or r.get("price"))
        if price is None:
            continue

        # Source can be a string or object
        src = r.get("source")
        if isinstance(src, dict):
            source_domain = src.get("link") or src.get("name")
        else:
            source_domain = src

        offers.append(
            Offer(
                merchant="google_shopping",
                source_domain=source_domain,
                title=r.get("title") or "",
                price=float(price),
                thumbnail=r.get("thumbnail"),
                brand=r.get("brand"),
                url=r.get("link"),
            )
        )

    return offers

# Google Search Provider (for link resolution)
async def provider_google_search(
    query: str,
    expected_title: str = "",
    expected_price: float = None
) -> Optional[str]:
    """
    Resolve the REAL merchant URL by:
      1. Checking Google Shopping results (best quality)
      2. Falling back to organic Google Search results
      3. Scoring based on title similarity & price distance
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

    shopping = data.get("shopping_results") or []

    best_score = -1
    best_link = None

    # Pass 1: Google Shopping
    for r in shopping:
        link = r.get("link")
        title = (r.get("title") or "").lower()
        price = parse_price(r.get("extracted_price") or r.get("price"))
        source = (r.get("source") or "").lower()

        if not link:
            continue

        # Stronger domain requirement
        if domain not in source:
            continue

        title_sim = difflib.SequenceMatcher(None, title, expected_title_norm).ratio()

        price_sim = 0
        if expected_price and price:
            diff_pct = abs(price - expected_price) / max(expected_price, 1)
            price_sim = max(0, 1 - diff_pct)

        score = (title_sim * 0.75) + (price_sim * 0.25)

        if score > best_score:
            best_score = score
            best_link = link

    if best_link and best_score >= 0.40:
        return best_link

    # Pass 2: Organic results fallback
    organic = data.get("organic_results") or []

    for r in organic:
        link = r.get("link")
        title = (r.get("title") or "").lower()
        snippet = r.get("snippet", "")

        if not link:
            continue

        if domain not in link.lower():
            continue

        title_sim = difflib.SequenceMatcher(None, title, expected_title_norm).ratio()

        found_price = extract_price_from_text(title + " " + snippet)
        price_sim = 0

        if expected_price and found_price:
            diff_pct = abs(found_price - expected_price) / max(expected_price, 1)
            price_sim = max(0, 1 - diff_pct)

        score = (title_sim * 0.70) + (price_sim * 0.30)

        if score > best_score:
            best_score = score
            best_link = link

    return best_link if best_score >= 0.40 else None


# Amazon SERP Provider
async def amazon_search_page(query: str, page: int = 1):
    """
    Fetch 1 page of Amazon search results via SerpAPI.
    """

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
