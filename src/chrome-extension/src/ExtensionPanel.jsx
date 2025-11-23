import { useEffect, useState } from "react";
import axios from "axios";

const API_BASE = "https://feisty-renewal-production.up.railway.app";

export default function ExtensionPanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const asin = new URLSearchParams(window.location.search).get("asin");

  async function findDeals() {
    if (!asin) return;
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/api/commerce/deals`, {
        asin: asin,
      });

      setData(res.data);
    } catch (err) {
      setData({ error: err.message });
    }
    setLoading(false);
  }

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>FBAlgo Deal Finder</h2>
      <p style={{ opacity: 0.7 }}>ASIN: {asin}</p>

      {/* FIND DEALS BUTTON */}
      <button
        onClick={findDeals}
        style={{
          width: "100%",
          padding: "12px",
          background: "linear-gradient(135deg, #a855f7, #4c1d95)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: "8px",
          color: "white",
          fontWeight: "700",
          cursor: "pointer",
          marginTop: "8px",
        }}
      >
        Find Deals
      </button>

      {loading && <p>Loading...</p>}

      {/* SHOW RESULTS */}
      {data && (
        <div style={{ marginTop: 18 }}>
          {data.error && <p style={{ color: "red" }}>Error: {data.error}</p>}

          {data.amazon_price && (
            <>
              <p>Amazon Price: ${data.amazon_price}</p>
              <p>Walmart Price: ${data.walmart_price}</p>

              <a
                href={data.walmart_link}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#a78bfa" }}
              >
                View Walmart Listing
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
