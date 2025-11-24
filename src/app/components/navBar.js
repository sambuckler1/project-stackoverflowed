import { useRouter } from "next/router";

export default function NavBar({ onSignOut }) {
  const router = useRouter();

  const items = [
    { label: "Product Finder", path: "/dashboard" },
    { label: "Amazon Dashboard", path: "/amazon-dashboard" },
    { label: "Chat Bot", path: "/chat-bot" },
    { label: "Saved Products", path: "/saved-products" },
  ];

  return (
    <>
      <nav className="nav">
        {items.map((item) => (
          <button
            key={item.path}
            className={`navBtn ${
              router.pathname === item.path ? "active" : ""
            }`}
            onClick={() => router.push(item.path)}
          >
            {item.label}
          </button>
        ))}

        <button className="signOutBtn" onClick={onSignOut}>
          Sign Out
        </button>
      </nav>

      <style jsx>{`
        .nav {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.2rem;
          flex-wrap: wrap;
          align-items: center;
        }

        .navBtn {
          padding: 8px 18px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.45);
          cursor: pointer;
          color: rgba(248, 250, 252, 0.8);
          font-size: 0.85rem;
          text-transform: uppercase;
          transition: all 0.18s ease-out;
        }

        .navBtn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
        }

        .active {
          background: radial-gradient(circle at top left, #a855f7, #4c1d95);
          border-color: rgba(216, 180, 254, 0.8);
          color: #fff;
        }

        .signOutBtn {
          margin-left: auto;
          padding: 8px 18px;
          border-radius: 999px;
          background: rgba(239, 68, 68, 0.18);
          border: 1px solid rgba(248, 113, 113, 0.45);
          color: #fecaca;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 700;
          text-transform: uppercase;
          transition: all 0.18s ease-out;
        }

        .signOutBtn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
        }
      `}</style>
    </>
  );
}
