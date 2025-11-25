import { useRouter } from "next/router";

export default function NavBar() {
  const router = useRouter();

  const handleSignOut = () => {
    localStorage.removeItem("authToken");
    router.push("/login");
  };

  const go = (path) => router.push(path);

  return (
    <nav className="nav-row">
      <div className="nav-left">
        <button
          className={router.pathname === "/dashboard" ? "nav-btn active" : "nav-btn"}
          onClick={() => go("/dashboard")}
        >
          Deal Finder
        </button>

        <button
          className={
            router.pathname === "/amazon-dashboard" ? "nav-btn active" : "nav-btn"
          }
          onClick={() => go("/amazon-dashboard")}
        >
          Amazon Dashboard
        </button>

        <button
          className={router.pathname === "/ai-assistant" ? "nav-btn active" : "nav-btn"}
          onClick={() => go("/ai-assistant")}
        >
          Ai Assistant
        </button>

        <button
          className={
            router.pathname === "/saved-products" ? "nav-btn active" : "nav-btn"
          }
          onClick={() => go("/saved-products")}
        >
          Saved Products
        </button>
      </div>

      <div className="nav-right">
        <button className="signout-btn" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>

      <style jsx>{`
        .nav-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.2rem;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .nav-left {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .nav-right {
          display: flex;
          align-items: center;
        }

        .nav-btn,
        .signout-btn {
          padding: 8px 18px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.45);
          background: rgba(15, 23, 42, 0.85);
          color: rgba(248, 250, 252, 0.8);
          text-transform: uppercase;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: 0.2s ease;
        }

        .nav-btn.active {
          background: radial-gradient(circle at top left, #a855f7, #4c1d95);
          color: #fff;
          border-color: rgba(216, 180, 254, 0.8);
        }

        .nav-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
        }

        .signout-btn {
          background: rgba(239, 68, 68, 0.18);
          border-color: rgba(248, 113, 113, 0.45);
          color: #fecaca;
        }

        .signout-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
        }
      `}</style>
    </nav>
  );
}
