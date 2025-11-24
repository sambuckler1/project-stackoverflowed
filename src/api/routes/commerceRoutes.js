// routes/commerceRoutes.js
const express = require("express");
const { fetch } = require("undici");
const router = express.Router();


// Category to Collection mapping
const slugify = (label) =>
  label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const mapLabelToCollections = (label) => {
  const slug = slugify(label || "");
  return {
    wm_coll: `wm_${slug}`,
    amz_coll: `amz_${slug}`,
  };
};

// Helper: Parse JSON OR fallback to readable error text
async function forwardJsonOrText(upstreamRes) {
  const ct = upstreamRes.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) return await upstreamRes.json();
    const text = await upstreamRes.text();
    return { error: text };
  } catch (e) {
    return { error: "Failed to parse upstream response" };
  }
}

// Deals Route (Amazon to Google Shopping)
router.post("/deals", async (req, res) => {
  try {
    const { category = "", limit } = req.body || {};
    if (!category) {
      return res.status(400).json({ error: "category is required" });
    }

    const slug = slugify(category);
    const match_coll = `match_${slug}`;

    const qs = new URLSearchParams({ match_coll });
    if (limit != null) qs.set("limit", String(limit));

    const url = `${process.env.PYAPI_URL}/deals/google?${qs.toString()}`;

    const upstream = await fetch(url);
    const payload = await forwardJsonOrText(upstream);

    return res.status(upstream.status).json(payload);

  } catch (err) {
    console.error("Proxy error (deals/google):", err);
    return res.status(500).json({ error: "Failed to fetch Google deals" });
  }
});

module.exports = router;


