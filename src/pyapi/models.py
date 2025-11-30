from pydantic import BaseModel, Field
from typing import Optional, TypedDict

# AmazonScrapeReq
# Used by: /amazon/scrape-category
class AmazonScrapeReq(BaseModel):
    query: str                       # Keyword search (e.g. "hair clippers")
    pages: int = Field(1, ge=1, le=10)
    max_products: int = 100

# Offer structure returned from Google Shopping / Google Search providers
# TypedDict is correct because this is NOT persisted and allows extra keys.
class Offer(TypedDict, total=False):
    merchant: str                       # e.g. "google_shopping"
    source_domain: Optional[str]        # e.g. "mudwtr.com"
    title: str
    price: float
    url: str
    thumbnail: Optional[str]
    brand: Optional[str]
    sim: Optional[float]                # similarity score from scoring engine

# Sent by Chrome extension into /extension/find-deals
# Also used internally inside scoring pipeline (_score_offers_for_extension)
class ExtensionFullProduct(BaseModel):
    asin: Optional[str] = None
    title: Optional[str] = None
    price: Optional[float] = None
    brand: Optional[str] = None
    thumbnail: Optional[str] = None

    # Can come from extension OR Amazon scraper
    image_url: Optional[str] = None
