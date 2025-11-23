"""
Fully working Debug Runner for the Walmart/Amazon API

- No MongoDB required
- No SerpAPI key required
- No external network calls
- Full endpoint coverage
"""

import os
import json
import asyncio
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------
# 1. Inject fake environment variables BEFORE importing main.py
# ---------------------------------------------------------------------
os.environ["MONGO_URL"] = "mongodb://debug-mock"
os.environ["MONGO_DB"] = "MongoDB"
os.environ["SERPAPI_KEY"] = "DEBUG_FAKE_KEY"


# ---------------------------------------------------------------------
# 2. Full Motor DB / Collection / Cursor mocks
# ---------------------------------------------------------------------

class MockMotorCursor:
    def __init__(self, docs):
        self.docs = list(docs)
        self._limit = None

    def sort(self, fields):
        # fields example: [("updatedAt", -1)]
        field, direction = fields[0]
        reverse = direction == -1
        self.docs.sort(key=lambda d: d.get(field), reverse=reverse)
        return self

    def limit(self, n):
        self._limit = n
        return self

    async def to_list(self, length):
        if self._limit is not None:
            return self.docs[: self._limit]
        return self.docs[: length]


class MockCollection:
    def __init__(self):
        self.docs = {}

    async def update_one(self, filter, update, upsert=False):
        key = filter.get("product_id") or filter.get("key_val")
        if key is None:
            return

        base = self.docs.get(key, {})

        if "$set" in update:
            base.update(update["$set"])

        if "$setOnInsert" in update and key not in self.docs:
            base.update(update["$setOnInsert"])

        self.docs[key] = base

    async def find_one(self, query, projection=None):
        key = query.get("product_id") or query.get("key_val")
        return self.docs.get(key)

    def find(self, match=None, projection=None):
        results = []

        for doc in self.docs.values():
            ok = True

            if match:
                for k, v in match.items():

                    if isinstance(v, dict) and "$exists" in v:
                        if v["$exists"] and k not in doc:
                            ok = False

                    elif isinstance(v, dict) and "$regex" in v:
                        import re
                        if not re.search(v["$regex"], doc.get(k, ""), re.I):
                            ok = False

                    elif isinstance(v, dict):
                        # other dict operators unsupported in mock
                        pass

                    else:
                        if doc.get(k) != v:
                            ok = False

            if ok:
                results.append(doc)

        return MockMotorCursor(results)

    async def delete_many(self, match):
        count = len(self.docs)
        self.docs = {}
        return MagicMock(deleted_count=count)


class MockDB:
    def __init__(self):
        self._collections = {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = MockCollection()
        return self._collections[name]


# ---------------------------------------------------------------------
# 3. Create mock DB BEFORE importing main.py
# ---------------------------------------------------------------------
mock_db = MockDB()


# ---------------------------------------------------------------------
# 4. Patch main.db BEFORE importing anything else from main
# ---------------------------------------------------------------------
# We will import the module, then override its `db` attribute.
import importlib
main = importlib.import_module("main")
main.db = mock_db
app = main.app


# ---------------------------------------------------------------------
# 5. Mock SerpAPI Responses
# ---------------------------------------------------------------------
MOCK_WALMART_SERP = {
    "organic_results": [
        {
            "product_id": "123",
            "title": "Logitech Wireless Mouse M510",
            "brand": "Logitech",
            "price": "24.99",
            "primary_offer": {"offer_price": "24.99"},
            "thumbnail": "https://mock_thumb",
            "link": "https://www.walmart.com/ip/123",
            "updatedAt": "2024-01-01T00:00:00Z"
        }
    ]
}

MOCK_GOOGLE_SHOPPING = {
    "shopping_results": [
        {
            "title": "Logitech Wireless Mouse",
            "extracted_price": "19.99",
            "product_link": "https://microcenter.com/item_logi",
            "brand": "Logitech",
            "thumbnail": "https://mock_gshop_thumb",
            "source": "microcenter.com",
        }
    ]
}

MOCK_GOOGLE_LENS = {
    "visual_matches": [
        {
            "title": "Logitech Mouse Lookalike",
            "price": "17.49",
            "product_link": "https://woot.com/logi_offer",
            "thumbnail": "https://mock_img_thumb",
            "source": "Logitech",
        }
    ]
}

MOCK_AMAZON_SERP = {
    "organic_results": [
        {
            "asin": "B00XYZ",
            "title": "Logitech M510 Wireless Mouse",
            "price": "$29.99",
            "thumbnail": "https://mock_amz_thumb",
            "link": "https://amazon.com/dp/B00XYZ",
        }
    ]
}


async def serp_mock(url, params):
    engine = params.get("engine")

    if engine == "walmart":
        return MOCK_WALMART_SERP

    if engine == "google_shopping":
        return MOCK_GOOGLE_SHOPPING

    if engine == "google_lens":
        return MOCK_GOOGLE_LENS

    if engine == "amazon":
        return MOCK_AMAZON_SERP

    return {}


# ---------------------------------------------------------------------
# 6. Pretty printer
# ---------------------------------------------------------------------
def dump(title, data):
    print("\n" + "=" * 60)
    print("🔍", title)
    print("=" * 60)
    print(json.dumps(data, indent=2))


# ---------------------------------------------------------------------
# 7. RUN ALL DEBUG TESTS
# ---------------------------------------------------------------------
client = TestClient(app)

async def run_tests():
    with patch("main.serp_get", side_effect=serp_mock):

        # ---- Test 1: extension/find-walmart-deal ----
        payload = {
            "asin": "B00XYZ",
            "title": "Logitech M510 Wireless Mouse",
            "price": 29.99,
            "brand": "Logitech",
            "thumbnail": "https://mock_thumb",
        }
        resp = client.post("/extension/find-walmart-deal", json=payload)
        dump("extension/find-walmart-deal", resp.json())

        # ---- Test 2: extension/find-deals-by-image ----
        payload2 = {
            "title": "Logitech Wireless Mouse",
            "price": 29.99,
            "brand": "Logitech",
            "image_url": "https://fake.com/image.png",
            "thumbnail": "https://mock_thumb",
        }
        resp = client.post("/extension/find-deals-by-image", json=payload2)
        dump("extension/find-deals-by-image", resp.json())

        # ---- Test 3: walmart/scrape ----
        scrape_body = {"query": "logitech mouse", "pages": 1, "max_products": 10}
        resp = client.post("/walmart/scrape?wm_coll=wm_test", json=scrape_body)
        dump("walmart/scrape", resp.json())

        # ---- Test 4: amazon/index-by-title ----
        index_req = {
            "limit_items": 10,
            "recache_hours": 48,
            "max_serp_calls": 10,
            "min_similarity": 80,
            "require_brand": True,
        }
        resp = client.post(
            "/amazon/index-by-title?wm_coll=wm_test&amz_coll=amz_test",
            json=index_req,
        )
        dump("amazon/index-by-title", resp.json())

        # ---- Test 5: deals/by-title ----
        resp = client.get("/deals/by-title?wm_coll=wm_test&amz_coll=amz_test")
        dump("deals/by-title", resp.json())

        # ---- Test 6: debug/clear-category ----
        resp = client.delete("/debug/clear-category?wm_coll=wm_test&amz_coll=amz_test")
        dump("debug/clear-category", resp.json())


# ---------------------------------------------------------------------
# MAIN ENTRY
# ---------------------------------------------------------------------
if __name__ == "__main__":
    asyncio.run(run_tests())
