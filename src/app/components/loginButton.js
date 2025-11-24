import { useState } from "react";

const LOGIN_URL =
  "https://project-stackoverflowed-production.up.railway.app/login";

export default function LoginButton() {
  const [launching, setLaunching] = useState(false);

  const handleClick = () => {
    if (launching) return;
    setLaunching(true);
    setTimeout(() => {
      window.location.href = LOGIN_URL;
    }, 1000); // match takeoff duration
  };

  return (
    <>
      <div className="rocket-wrap">
        <button
          className={`login-btn ${launching ? "launch" : ""}`}
          onClick={handleClick}
          aria-label="Log in with Amazon"
          title="Click to log in with Amazon"
          disabled={launching}
        >
          🚀
        </button>
        <p className="rocket-label">Click me to get started</p>
      </div>

      <style jsx>{`
        .rocket-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          position: relative;
        }

        /* Rocket button */
        .login-btn {
          background: transparent; /* keep native emoji colors */
          border: none;
          cursor: pointer;
          font-size: 56px; /* size of emoji */
          line-height: 1;
          transition: transform 0.12s ease, filter 0.12s ease,
            opacity 0.12s ease;
          animation: pulse 1.6s ease-in-out infinite; /* attract attention */
          will-change: transform, opacity;
        }

        /* hover lift */
        .login-btn:hover {
          transform: translateY(-2px);
        }

        /* click press (before launch) */
        .login-btn:active {
          transform: scale(0.95);
        }

        /* takeoff animation on click */
        .login-btn.launch {
          animation: takeoff 1s ease-in forwards;
          pointer-events: none;
          filter: drop-shadow(0 12px 24px rgba(255, 255, 255, 0.2));
        }

        /* subtle pulse to say "click me" */
        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.12);
          }
          100% {
            transform: scale(1);
          }
        }

        /* rocket flies up and fades */
        @keyframes takeoff {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          40% {
            transform: translateY(-60px) scale(1.08);
          }
          70% {
            transform: translateY(-140px) scale(0.9);
          }
          100% {
            transform: translateY(-320px) scale(0.55);
            opacity: 0;
          }
        }

        /* label under rocket */
        .rocket-label {
          color: #fff;
          font-size: 0.95rem;
          opacity: 0.9;
          user-select: none;
        }

        /* accessibility: respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .login-btn {
            animation: none;
          }
          .login-btn.launch {
            animation: none;
            opacity: 0.85;
          }
        }
      `}</style>
    </>
  );
}
