// pages/dashboard.js  (or app/dashboard/page.js)
import { useState } from "react";
import dynamic from "next/dynamic";
import { Space_Grotesk } from "next/font/google";
import { useRouter } from "next/router";
import NavBar from "../components/navBar";

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://feisty-renewal-production.up.railway.app";

const PY_API_BASE =
    process.env.NEXT_PYAPI_URL ||
    "https://diligent-spontaneity-production-d286.up.railway.app";

const StarsBackground = dynamic(() => import("../components/StarsBackground"), {
  ssr: false,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
});

export default function Dashboard() {
  const router = useRouter();
  const CATEGORY_LABELS = [
    "Electronics",
    "Health & Wellness",
    "Home & Kitchen",
    "Toys & Games",
    "Beauty",
    "Grocery",
    "Sports & Outdoors",
    "Pet Supplies",
    "Cleaning Supplies",
    "Hair Care",
    "Spices",
    "Non Perishable Food",
    "Christmas",
  ];

  const [deals, setDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsMsg, setDealsMsg] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const FALLBACK_SVG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(`
      <svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'>
        <rect width='100%' height='100%' fill='#f4f5f7'/>
        <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
              font-family='Inter, Arial, sans-serif' font-size='14' fill='#8b8fa3'>
          No image
        </text>
      </svg>
    `);

  const fetchDealsByCategory = async (label) => {
    if (!label) return;
    setDealsLoading(true);
    setDealsMsg("");
    setDeals([]);

    try {
      const r = await fetch(`${API_BASE}/api/commerce/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: label }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || j?.detail || "Failed to load deals");

      const list = Array.isArray(j.deals) ? j.deals : [];
      setDeals(list);
      if (!list.length) setDealsMsg("No deals yet for this category.");
    } catch (e) {
      setDealsMsg(`Error: ${e.message}`);
    } finally {
      setDealsLoading(false);
    }
  };

  const onCategoryChange = (e) => {
    const cat = e.target.value;
    setSelectedCategory(cat);
    fetchDealsByCategory(cat);
  };

  const handleSave = async (payload) => {
    try {
      // 1. Get token
      const authToken = localStorage.getItem("authToken");
      if (!authToken) {
        alert("You must be logged in to save.");
        return;
      }
  
      // 2. Button feedback
      const btn = document.activeElement;
      btn.textContent = "Saving...";
      btn.disabled = true;
  
      // 3. Resolve merchant REAL URL
      const resolveRes = await fetch(
        `${PY_API_BASE}/extension/resolve-merchant-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_domain: payload.matchSourceDomain,
            title: payload.matchTitle,
            expected_price: payload.matchPrice,
            fallback_shopping_link: payload.matchShoppingLink
          }),
        }
      );
  
      const resolveData = await resolveRes.json();
      const finalMerchantURL = resolveData.resolved_url || null;
  
      // 4. Save to Node backend
      const saveRes = await fetch(`${API_BASE}/api/users/save-product`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + authToken,
        },
        body: JSON.stringify({
          asin: payload.asin,
  
          amazonTitle: payload.amazonTitle,
          amazonPrice: payload.amazonPrice,
          amazonThumbnail: payload.amazonThumbnail,
          amazonURL: payload.amazonURL,
  
          matchTitle: payload.matchTitle,
          matchPrice: payload.matchPrice,
          matchThumbnail: payload.matchThumbnail,
          matchURL: finalMerchantURL,
        }),
      });
  
      if (!saveRes.ok) {
        const err = await saveRes.json();
        throw new Error(err.message || "Could not save product");
      }
  
      btn.textContent = "Saved ❤️";
    } catch (err) {
      console.error(err);
      alert("Error saving product");
    }
  };
  
  return (
    <div className="dash-wrap">
      <StarsBackground count={240} />

      <main className="content">
        <div className="card">
          <NavBar />
          <h1 className={`${spaceGrotesk.className} title`}>Deal Finder</h1>
          <p className="subtitle">
            Find deals for Amazon products (by category).
          </p>

          {/* Category selector */}
          <div className="actions" style={{ alignItems: "center", marginTop: "0.5rem" }}>
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                color: "#fff",
              }}
            >
              Category:
              <select
                value={selectedCategory}
                onChange={onCategoryChange}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.3)",
                  background: "rgba(0, 0, 0, 0.45)",
                  color: "#fff",
                  minWidth: 220,
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                }}
              >
                <option
                  value=""
                  disabled
                  style={{ background: "#151020", color: "#fff" }}
                >
                  Select a category…
                </option>
                {CATEGORY_LABELS.map((label) => (
                  <option
                    key={label}
                    value={label}
                    style={{ background: "#151020", color: "#fff" }}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {dealsMsg && <div className="status">{dealsMsg}</div>}
          {dealsLoading && <div className="status">Loading deals…</div>}

          <div className="product-rows">
            {deals.map((d, i) => {
              const amazon = d.amazon || {};
              const offers = Array.isArray(d.offers) ? d.offers : [];

              const amzPrice = Number(amazon.price ?? 0);
              const amzThumb = amazon.thumbnail || FALLBACK_SVG;

              return (
                <div
                  className="product-row"
                  key={amazon.asin || i}
                >
                  {/* Header */}
                  <div className="row-header">
                    <div className="roi-pill neutral">Amazon Product</div>
                    <div className="row-header-meta">
                      Category:{" "}
                      <span className="strong">
                        {selectedCategory || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Amazon block */}
                  <div className="row-body">
                    <div className="product-media">
                      <div className="thumb-wrap small">
                        <img src={amzThumb} alt={amazon.title} />
                        <span className="thumb-label">Amazon</span>
                      </div>
                    </div>

                    <div className="product-info">
                      <div className="side-block">
                        <div className="side-header">AMAZON</div>
                        <div className="deal-title">
                          {amazon.title || "Untitled Amazon Product"}
                        </div>
                        <div className="row price-row">
                          <span className="label">Price</span>
                          <span className="price">${amzPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Offers Grid */}
                  <div className="offers-grid">
                    {offers.map((offer, j) => {
                      const gsPrice = Number(offer.price ?? 0);
                      const gsThumb = offer.thumbnail || FALLBACK_SVG;

                      return (
                        <div className="offer-card" key={j}>
                          <div className="offer-left">
                            <img src={gsThumb} alt={offer.title} className="offer-thumb" />
                          </div>

                          <div className="offer-right">
                            <div className="offer-header">
                              <span className="offer-index">MATCH #{j + 1}</span>
                              {offer.source_domain && (
                                <span className="offer-merchant">{offer.source_domain}</span>
                              )}
                            </div>

                            <div className="offer-title">{offer.title}</div>

                            <div className="offer-meta">
                              <div className="offer-price">
                                Price: <strong>${gsPrice.toFixed(2)}</strong>
                              </div>
                              {offer.sim != null && (
                                <div className="offer-sim">
                                  Similarity: <strong>{Math.round(offer.sim)}%</strong>
                                </div>
                              )}
                            </div>
                            <button
                              className="save-btn"
                              onClick={() =>
                                handleSave({
                                  asin: amazon.asin,
                                  amazonTitle: amazon.title,
                                  amazonPrice: amzPrice,
                                  amazonThumbnail: amazon.thumbnail,
                                  amazonURL: amazon.link || null,

                                  matchTitle: offer.title,
                                  matchPrice: gsPrice,
                                  matchThumbnail: gsThumb,
                                  matchSourceDomain: offer.source_domain,
                                  matchShoppingLink: offer.url
                                })
                              }
                              style={{
                                marginTop: "8px",
                                padding: "6px 12px",
                                borderRadius: "8px",
                                background: "#8b5cf6",
                                color: "white",
                                border: "none",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {deals.length === 0 && !dealsLoading && (
            <p className="subtitle">Nothing to show yet.</p>
          )}
        </div>
      </main>
      
      <style jsx>{`
        :root {
          --card-bg: rgba(22, 16, 34, 0.78);
          --panel-bg: rgba(13, 15, 26, 0.95);
          --panel-border: rgba(255, 255, 255, 0.08);
          --muted: rgba(255, 255, 255, 0.75);
          --accent: #a78bfa;
          --save-bg: rgba(34, 197, 94, 0.1);
          --save-brd: rgba(34, 197, 94, 0.22);
        }

        .dash-wrap {
          position: relative;
          min-height: 100vh;
          background: radial-gradient(1200px 800px at 20% -10%, #4b1d7a 0%, transparent 60%),
            radial-gradient(1200px 800px at 80% -10%, #2a0c52 0%, transparent 60%), #1c0333;
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: 2rem;
        }
        .content {
          position: relative;
          z-index: 1;
          width: min(1120px, 100%);
        }
        .card {
          background: var(--card-bg);
          backdrop-filter: blur(8px);
          border: 1px solid var(--panel-border);
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          color: #fff;
          padding: 24px;
        }

        /* Tab row – pill buttons with orbiting border */
        .tab-row {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.2rem;
          flex-wrap: wrap;
        }

        .tab-pill {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 18px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.45);
          cursor: pointer;
          text-decoration: none;
          color: rgba(248, 250, 252, 0.8);
          font-size: 0.85rem;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          overflow: hidden;
          transition:
            background 0.2s ease-out,
            color 0.2s ease-out,
            box-shadow 0.2s ease-out,
            transform 0.15s ease-out;
        }

        .tab-pill.active {
          background: radial-gradient(circle at top left, #a855f7, #4c1d95);
          color: #f9fafb;
          border-color: rgba(216, 180, 254, 0.8);
        }

        .tab-label {
          position: relative;
          z-index: 1;
        }

        .tab-pill::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: conic-gradient(
            from 0deg,
            #f9a8ff,
            #a5b4fc,
            #7dd3fc,
            #f97316,
            #f9a8ff
          );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transform: rotate(0deg);
          transition: opacity 0.2s ease-out;
          z-index: 0;
        }

        .tab-pill:hover::before,
        .tab-pill.active::before {
          opacity: 1;
          animation: snakeOrbit 1.6s linear infinite;
        }

        .tab-pill:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
        }

        @keyframes snakeOrbit {
          to {
            transform: rotate(360deg);
          }
        }

        .title {
          font-weight: 700;
          font-size: clamp(2rem, 4vw, 3rem);
          letter-spacing: 0.5px;
          margin: 0 0 0.25rem;
        }
        .subtitle {
          margin: 0.25rem 0 1rem;
          opacity: 0.9;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin: 1rem 0;
        }
        .status {
          margin-top: 0.5rem;
        }

        /* Product rows */
        .product-rows {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .product-row {
          position: relative; /* needed for pseudo-element borders */
          border-radius: 18px;
          background: linear-gradient(
              135deg,
              rgba(167, 139, 250, 0.09),
              rgba(15, 23, 42, 0.85)
            );
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
          padding: 12px 14px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
          overflow: hidden; /* clip animated border glow to rounded corners */
        }
        .product-row {
          position: relative;
          border-radius: 18px;
          background: linear-gradient(
              135deg,
              rgba(167, 139, 250, 0.09),
              rgba(15, 23, 42, 0.85)
            );
          border: 1px solid rgba(255, 255, 255, 0.1); /* subtle by default */
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
          padding: 12px 14px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition:
            border-color 0.18s ease-out,
            box-shadow 0.18s ease-out,
            transform 0.15s ease-out;
          overflow: hidden;
        }
        
        .product-row:hover {
          border-color: rgba(255, 255, 255, 0.95); /* solid white border on hover */
          transform: translateY(-3px);
          box-shadow: 0 14px 35px rgba(0, 0, 0, 0.55);
        }
        
       

        .row-header {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .row-header-meta {
          font-size: 0.85rem;
          opacity: 0.9;
        }
        .row-header-meta .strong {
          font-weight: 700;
        }

        .row-body {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
          gap: 16px;
          margin-top: 6px;
        }

        .roi-pill {
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 800;
          border: 1px solid transparent;
        }
        .roi-pill.positive {
          background: rgba(34, 197, 94, 0.14);
          border-color: rgba(34, 197, 94, 0.5);
          color: #bbf7d0;
        }
        .roi-pill.negative {
          background: rgba(239, 68, 68, 0.14);
          border-color: rgba(248, 113, 113, 0.5);
          color: #fecaca;
        }
        .roi-pill.neutral {
          background: rgba(148, 163, 184, 0.14);
          border-color: rgba(148, 163, 184, 0.5);
          color: #e5e7eb;
        }

        .product-media {
          display: flex;
          align-items: center;
        }
        .thumb-pair {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        .thumb-wrap.small {
          position: relative;
          background: radial-gradient(circle at top, #ffffff, #e5e7eb);
          border-radius: 14px;
          padding: 8px;
          display: grid;
          place-items: center;
          overflow: hidden;
        }
        .thumb-wrap.small img {
          max-width: 100%;
          max-height: 120px;
          object-fit: contain;
          display: block;
        }
        .thumb-label {
          position: absolute;
          bottom: 6px;
          left: 8px;
          font-size: 0.7rem;
          font-weight: 700;
          background: rgba(15, 23, 42, 0.8);
          padding: 2px 6px;
          border-radius: 999px;
        }

        .product-info {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .side-block {
          background: var(--panel-bg);
          border-radius: 12px;
          border: 1px solid var(--panel-border);
          padding: 8px 10px;
        }
        .side-header {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          opacity: 0.7;
          margin-bottom: 3px;
        }

        .deal-title {
          color: #fff;
          text-decoration: none;
          font-weight: 800;
          font-size: 0.95rem;
          line-height: 1.28;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          transition: color 0.15s ease-out, text-shadow 0.15s ease-out;
        }
        .deal-title:hover {
          color: #e9d5ff;
          text-shadow: 0 0 8px rgba(167, 139, 250, 0.45);
        }

        .row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          font-size: 0.9rem;
          margin-top: 4px;
        }
        .price-row .price {
          font-size: 1.02rem;
          color: #c7d2fe;
        }
        .label {
          opacity: 0.82;
          letter-spacing: 0.02em;
        }
        .price {
          font-weight: 900;
        }

        .meta-row {
          margin-top: 4px;
          font-size: 0.8rem;
          opacity: 0.85;
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }

        .offer-card {
          display: flex;
          gap: 16px;
          padding: 12px;
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          margin-top: 12px;
          align-items: center;
        }

        .offer-left {
          width: 120px;
          min-width: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .offer-thumb {
          max-width: 100%;
          max-height: 120px;   /* SAME HEIGHT AS AMAZON IMAGE */
          object-fit: contain;
          border-radius: 10px;
          background: #ffffff;
        }

        .offer-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .offer-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          font-weight: 700;
          opacity: 0.85;
          text-transform: uppercase;
        }

        .offer-title {
          font-size: 0.95rem;
          font-weight: 700;
          line-height: 1.28;
        }

        .offer-meta {
          display: flex;
          gap: 20px;
          font-size: 0.85rem;
          opacity: 0.85;
        }

        .offer-price strong {
          color: #c7d2fe;
        }


        @media (max-width: 860px) {
          .row-body {
            grid-template-columns: 1fr;
          }
          .product-media {
            justify-content: flex-start;
          }
          .thumb-pair {
            max-width: 260px;
          }
        }

        @media (max-width: 600px) {
          .product-row {
            padding: 10px 10px 12px;
          }
          .meta-row {
            flex-direction: column;
            gap: 2px;
          }
        }
      `}</style>


      <style jsx global>{`
        html,
        body,
        #__next {
          height: 100%;
          background: #1b0633;
        }
        body {
          margin: 0;
          overscroll-behavior: none;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
