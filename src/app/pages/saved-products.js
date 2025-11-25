import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Space_Grotesk } from "next/font/google";
import NavBar from "../components/navBar";

// Star background (client-only)
const StarsBackground = dynamic(() => import("../components/StarsBackground"), {
  ssr: false,
});
const MemoStars = React.memo(StarsBackground);

// Backend API URL
const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://feisty-renewal-production.up.railway.app";

// Page Font
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
});

export default function SavedProducts() {
  //List of saved items from backend
  const [items, setItems] = useState([]);
  //Tracks which items user clicked/selected
  const [selected, setSelected] = useState(new Set());

  // Fallback placeholder image for missing thumbnails
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

  // Load saved products for the logged-in user when the page loads
  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
    if (!token) return;

    fetch(`${API_BASE}/api/users/saved-products`, {
      headers: { Authorization: "Bearer " + token },
    })
      .then((r) => r.json())
      .then((d) => setItems(d.products || []))
      .catch((err) => console.error("Load saved products error", err));
  }, []);

  // Toggle checkbox selection for each saved item
  const toggleSelect = (asin) => {
    const next = new Set(selected);
    next.has(asin) ? next.delete(asin) : next.add(asin);
    setSelected(next);
  };

  // Remove selected saved item
  const removeSelected = async () => {
    if (selected.size === 0) return;

    const token = localStorage.getItem("authToken");
    if (!token) return;

    await fetch(`${API_BASE}/api/users/remove-saved-products`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ asins: Array.from(selected) }),
    }).catch((err) => console.error("Remove saved products error", err));

    setItems((prev) => prev.filter((p) => !selected.has(p.asin)));
    setSelected(new Set());
  };

  const anySelected = selected.size > 0;

  return (
    <div className="dash-wrap">
      <MemoStars count={240} />

      <main className="content">
        <div className="card">
          <NavBar />
          <h1 className={`${spaceGrotesk.className} title`}>Saved Products</h1>

          {/* Action buttons */}
          <div className="actions">
            <button
              className={`action-btn remove ${anySelected ? "enabled" : ""}`}
              disabled={!anySelected}
              onClick={removeSelected}
            >
              Remove Selected
            </button>

            <button
              className={`action-btn export ${anySelected ? "enabled" : ""}`}
              disabled={!anySelected}
            >
              Export Selected (Soon)
            </button>
          </div>

          <div className="product-rows">
            {items.map((p, i) => {
              const amzPrice = Number(p.amazonPrice ?? p.price ?? 0);
              const matchPrice = Number(p.matchPrice ?? 0);

              const diff = amzPrice - matchPrice;
              const roi =
                matchPrice > 0 ? ((amzPrice - matchPrice) / matchPrice) * 100 : 0;

              const amzThumb = p.amazonThumbnail || p.thumbnail || FALLBACK_SVG;
              const matchThumb = p.matchThumbnail || FALLBACK_SVG;

              const roiClass =
                roi > 0
                  ? "roi-pill positive"
                  : roi < 0
                  ? "roi-pill negative"
                  : "roi-pill neutral";

              return (
                <div
                  className="product-row"
                  key={p.asin || p.id || i}
                >
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={selected.has(p.asin)}
                      onChange={() => toggleSelect(p.asin)}
                    />
                  </label>

                  <div className="row-header">
                    <div className={roiClass}>{roi.toFixed(1)}% ROI</div>
                    <div className="row-header-meta">
                      Difference:{" "}
                      <span className="strong">${diff.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="row-body">
                    <div className="product-media">
                      <div className="thumb-pair">
                        <div className="thumb-wrap small">
                          <img
                            src={amzThumb}
                            alt={p.amazonTitle || p.title || "Amazon product"}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = FALLBACK_SVG;
                            }}
                          />
                          <span className="thumb-label">Amazon</span>
                        </div>

                        <div className="thumb-wrap small">
                          <img
                            src={matchThumb}
                            alt={p.matchTitle || "Match product"}
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.src = FALLBACK_SVG;
                            }}
                          />
                          <span className="thumb-label">Match</span>
                        </div>
                      </div>
                    </div>

                    <div className="product-info">
                      <div className="side-block">
                        <div className="side-header">AMAZON</div>
                        <a
                          className="deal-title"
                          href={p.amazonURL || p.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          title={p.amazonTitle || p.title}
                        >
                          {p.amazonTitle || p.title || "Amazon product"}
                        </a>
                        <div className="row price-row">
                          <span className="label">Price</span>
                          <span className="price">${amzPrice.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="side-block">
                        <div className="side-header">MATCH</div>
                        <a
                          className="deal-title"
                          href={p.matchURL || "#"}
                          target="_blank"
                          rel="noreferrer"
                          title={p.matchTitle}
                        >
                          {p.matchTitle || "Matched product"}
                        </a>
                        <div className="row price-row">
                          <span className="label">Price</span>
                          <span className="price">
                            ${matchPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="meta-row">
                        <span>ASIN: {p.asin || "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {items.length === 0 && (
              <p className="subtitle">You have no saved products yet.</p>
            )}
          </div>
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
            radial-gradient(1200px 800px at 80% -10%, #2a0c52 0%, transparent 60%),
            #1c0333;
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

        /* Tabs – identical to dashboard */
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

        .tab-label {
          position: relative;
          z-index: 1;
        }

        .tab-pill.active {
          background: radial-gradient(circle at top left, #a855f7, #4c1d95);
          color: #f9fafb;
          border-color: rgba(216, 180, 254, 0.8);
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
          margin-top: 0.75rem;
          opacity: 0.9;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin: 1rem 0;
        }

        .action-btn {
          border: none;
          border-radius: 12px;
          padding: 10px 16px;
          font-weight: 700;
          cursor: not-allowed;
          opacity: 0.5;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          transition: opacity 0.2s, transform 0.2s, box-shadow 0.2s;
        }

        .action-btn.enabled {
          cursor: pointer;
          opacity: 1;
        }

        .action-btn.enabled:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.35);
        }

        .remove.enabled {
          background: rgba(239, 68, 68, 0.25);
          border: 1px solid rgba(239, 68, 68, 0.45);
        }

        .export.enabled {
          background: rgba(167, 139, 250, 0.25);
          border: 1px solid rgba(167, 139, 250, 0.45);
        }

        /* Product rows – cloned from dashboard */
        .product-rows {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .checkbox-wrap {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 10;
        }

        .product-row {
          position: relative;
          border-radius: 18px;
          background: linear-gradient(
            135deg,
            rgba(167, 139, 250, 0.09),
            rgba(15, 23, 42, 0.85)
          );
          border: 1px solid rgba(255, 255, 255, 0.1);
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
          border-color: rgba(255, 255, 255, 0.95);
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

        .strong {
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

        .meta-row {
          margin-top: 4px;
          font-size: 0.8rem;
          opacity: 0.85;
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
            margin-top: 2px;
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
