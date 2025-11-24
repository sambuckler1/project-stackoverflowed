// pages/amazon-dashboard.js
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Products from "./products";
import { Space_Grotesk } from "next/font/google";
import NavBar from "../components/navBar";

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://feisty-renewal-production.up.railway.app";

const StarsBackground = dynamic(() => import("../components/StarsBackground"), {
  ssr: false,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
});

export default function AmazonDashboard() {
  const [status, setStatus] = useState("Not linked");
  const [error, setError] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  const runSandboxCheck = async () => {
    setChecking(true);
    setError(null);
    setStatus("Contacting Amazon sandbox…");
    try {
      const res = await fetch(`${API_BASE}/spapi/sandbox-check`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sandbox check failed");
      setCheckResult(data);
      setStatus("Sandbox linked ✅");
    } catch (e) {
      setError(e.message);
      setStatus("Failed to link sandbox ❌");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window.location.search || window.location.hash)
    ) {
      runSandboxCheck();
    }
  }, []);

  const handleLinkFBA = () => {
    window.location.href = `${API_BASE}/auth/login`;
  };

  return (
    <div className="dash-wrap">
      <StarsBackground count={240} />

      <main className="content">
        <div className="card">
          <NavBar />
          <h1 className={`${spaceGrotesk.className} title`}>Amazon Dashboard</h1>
          <p className="subtitle">
            Welcome back — link your Amazon Seller (FBA) account to continue.
          </p>

          <div className="actions">
            <button className="primary" onClick={handleLinkFBA}>
              Link FBA Account
            </button>
            <button
              className="secondary"
              onClick={runSandboxCheck}
              disabled={checking}
            >
              {checking ? "Checking…" : "Refresh Sandbox Check"}
            </button>
          </div>

          <div className="status">
            <strong>Status:</strong> {status}
          </div>
          {error && <pre className="error">{error}</pre>}

          {checkResult && (
            <details className="details">
              <summary>Sandbox check payload</summary>
              <pre>{JSON.stringify(checkResult, null, 2)}</pre>
            </details>
          )}
        </div>

        {checkResult && (
          <div className="card products-card">
            <h2 className={`${spaceGrotesk.className} products-title`}>
              Your Products (Sandbox)
            </h2>
            <Products apiBase={API_BASE} />
          </div>
        )}
      </main>

      <style jsx>{`
        :root {
          --card-bg: rgba(22, 16, 34, 0.78);
          --panel-bg: rgba(13, 15, 26, 0.95);
          --panel-border: rgba(255, 255, 255, 0.08);
          --muted: rgba(255, 255, 255, 0.75);
          --accent: #a78bfa;
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
          display: grid;
          gap: 1.25rem;
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

        /* Tab pills (same style as dashboard tabs) */
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
          margin: 0.25rem 0 1rem;
          opacity: 0.9;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin: 1rem 0;
        }
        .primary,
        .secondary {
          border: none;
          border-radius: 12px;
          padding: 12px 16px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
        }
        .primary {
          background: linear-gradient(90deg, #8a2be2, #5b21b6);
          color: #fff;
        }
        .secondary {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }
        .primary:hover,
        .secondary:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.35);
        }
        .secondary:disabled,
        .primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .status {
          margin-top: 0.5rem;
        }
        .error {
          color: #ffb4b4;
          white-space: pre-wrap;
          margin-top: 0.5rem;
        }
        .details {
          margin-top: 1rem;
        }
        .details pre {
          white-space: pre-wrap;
        }

        .products-card {
          background: var(--card-bg);
          backdrop-filter: blur(8px);
          border: 1px solid var(--panel-border);
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          color: #fff;
          padding: 24px;
        }
        .products-title {
          font-weight: 700;
          margin: 0 0 0.5rem;
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
