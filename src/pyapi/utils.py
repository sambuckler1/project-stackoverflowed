import re
from datetime import datetime, timezone
from typing import Optional, Dict
import httpx
from PIL import Image
import imagehash
from io import BytesIO
from .models import ExtensionFullProduct, Offer
from rapidfuzz import fuzz

# Regex Helpers

# Price pattern: captures floats or ints like "12.99", "$19.00", "$19"
PRICE_RE = re.compile(r"(\d+(?:\.\d{1,2})?)")

# Words to remove when normalizing product titles
STOPWORDS = {
    "with", "and", "the", "for", "in", "of", "to", "by", "on",
    "oz", "fl", "ct", "pack", "count", "lb", "lbs", "ounce", "ounces",
}

# Size / quantity parser:
# Matches things like "12 oz", "1 lb", "pack of 3", "3 ct", "3-pack"
SIZE_RE = re.compile(
    r"(?:(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams|ml|l|liter|liters))"
    r"|(?:pack\s*of\s*(\d+)|(\d+)\s*ct|\b(\d+)-?pack\b)",
    re.I,
)

# Time / Date Helpers
def now_utc() -> datetime:
    """Return current UTC timestamp (timezone-aware)."""
    return datetime.now(timezone.utc)

# Price Parsing
def parse_price(v) -> Optional[float]:
    """
    Convert various raw price formats into a float.

    Accepts:
      - int / float
      - dicts like {"price": "12.99", ...}
      - strings like "$12.99", "12,99"

    Returns:
      float or None
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

# Image Downloading + pHash (perceptual hash)
async def fetch_image_bytes(url: str) -> Optional[bytes]:
    """Download image bytes with a 10s timeout. Returns None on failure."""
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
    Compute perceptual hash for an image.
    Used for comparing Amazon vs Google Shopping images.
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
    Compute similarity (0–100%) from two pHash values.

    pHash difference is measured via hamming distance (0–64).
    """
    if not hash1 or not hash2:
        return 0.0
    dist = hash1 - hash2
    sim = 1 - (dist / 64)
    return max(0.0, min(1.0, sim)) * 100.0

# Title Normalization
def norm(s: str) -> str:
    """
    Normalize product title:
      - Lowercase
      - Strip non-alphanumeric chars
      - Remove STOPWORDS
    """
    if not s:
        return ""
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower())
    toks = [t for t in s.split() if t and t not in STOPWORDS]
    return " ".join(toks)

# Size + Count Parsing (detect ounces, lbs, packs, ct, etc.)
def _to_grams(val: float, unit: str) -> Optional[float]:
    """Convert various units to grams (or ml equivalently for liquids)."""
    u = unit.lower()
    if u in {"lb", "lbs", "pound", "pounds"}:
        return val * 453.59237
    if u in {"oz", "ounce", "ounces"}:
        return val * 28.349523125
    if u == "kg":
        return val * 1000.0
    if u in {"g", "gram", "grams"}:
        return val
    if u == "ml":
        return val
    if u in {"l", "liter", "liters"}:
        return val * 1000.0
    return None

def extract_size_and_count(title: str) -> Dict[str, Optional[float]]:
    """
    Parse sizes & pack counts from a product title.

    Returns dict:
      {
        "grams": grams per unit (or ml),
        "count": how many units (e.g., 2-pack)
      }
    """
    grams = None
    count = 1
    if not title:
        return {"grams": None, "count": 1}

    for m in SIZE_RE.finditer(title):
        qty, unit, pack_of, ct_alt, pack_alt = m.groups()

        # Quantity+unit (e.g., "12 oz")
        if qty and unit:
            g = _to_grams(float(qty), unit)
            if g:
                grams = max(grams or 0, g)

        # Handle pack sizes
        for v in (pack_of, ct_alt, pack_alt):
            if v and v.isdigit():
                count = max(count, int(v))

    return {"grams": grams, "count": count}

def sizes_compatible(wm_title: str, amz_title: str, threshold: float = 0.85) -> bool:
    """
    Check if Amazon and Google/Walmart product sizes are roughly similar.

    - If either side lacks size info → allow match
    - If both have info → compare total grams
    """
    wm = extract_size_and_count(wm_title)
    am = extract_size_and_count(amz_title)

    if not wm["grams"] or not am["grams"]:
        return True

    wm_total = wm["grams"] * max(1, wm["count"])
    am_total = am["grams"] * max(1, am["count"])
    ratio = min(wm_total, am_total) / max(wm_total, am_total)

    return ratio >= threshold

# Price extraction from arbitrary text
def extract_price_from_text(text: str) -> float:
    """Extract first $X.xx price from a text blob."""
    matches = re.findall(r"\$\s?(\d+(?:\.\d+)?)", text)
    if not matches:
        return None
    try:
        return float(matches[0])
    except:
        return None

# Deal Scoring Engine (shared by dashboard + Chrome extension)
async def _score_offers_for_extension(payload: ExtensionFullProduct, all_offers: list[Offer]):
    """
    Core scoring algorithm for Google Shopping offers:
    - Normalize Amazon title
    - Compare text similarity (RapidFuzz)
    - Compare images via pHash
    - Adjust price using unit normalization where logical
    - Filter out weak matches
    - Compute savings
    - Return top 5 matches
    """

    best_deals = []

    amz_title_norm = norm(payload.title)
    amz_price = float(payload.price)

    # Parse Amazon size (for unit-normalized price matching)
    amz_size = extract_size_and_count(payload.title)
    amz_grams = amz_size.get("grams")
    amz_count = amz_size.get("count") or 1

    amz_units: Optional[float] = None
    amz_unit_mode: Optional[str] = None

    if amz_grams:
        amz_units = amz_grams * max(1, amz_count)
        amz_unit_mode = "weight"
    elif amz_count:
        amz_units = max(1, amz_count)
        amz_unit_mode = "count"

    amazon_hash = await compute_phash(payload.thumbnail or payload.image_url)

    for o in all_offers:

        # TEXT SIMILARITY
        text_sim = fuzz.token_set_ratio(amz_title_norm, norm(o["title"]))
        o["sim"] = text_sim

        if text_sim < 60:  # reject weak matches early
            continue

        # IMAGE SIMILARITY
        offer_hash = await compute_phash(o.get("thumbnail"))

        if amazon_hash and offer_hash:
            img_sim = phash_similarity(amazon_hash, offer_hash)
        else:
            img_sim = 0.0

        combined_sim = (text_sim * 0.6) + (img_sim * 0.4)

        if combined_sim < 55:
            continue

        price = o["price"]

        # SAVINGS CALCULATION
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
                ratio = min(amz_units, offer_units) / max(amz_units, offer_units)
                if ratio >= 0.6:   # avoid mismatched sizes
                    use_unit_normalization = True

        if use_unit_normalization and amz_units and offer_units:
            amz_unit_price = amz_price / amz_units
            offer_unit_price = price / offer_units
            unit_savings = amz_unit_price - offer_unit_price

            if unit_savings <= 0:
                continue

            savings_abs = unit_savings * amz_units
            savings_pct = (unit_savings / amz_unit_price) * 100 if amz_unit_price > 0 else 0
        else:
            savings_abs = amz_price - price
            if savings_abs <= 0:
                continue
            savings_pct = (savings_abs / amz_price) * 100 if amz_price > 0 else 0

        # Require meaningful savings
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

    # Sort by strongest match + best savings
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
        "best_deals": best_deals[:5],
    }
