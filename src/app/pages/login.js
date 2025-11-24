// pages/loginPage.js
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://feisty-renewal-production.up.railway.app";

// Load the canvas only in the browser (avoids SSR crashes)
const StarsBackground = dynamic(() => import("../components/StarsBackground"), {
  ssr: false,
});

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const popupRef = useRef(null);

  // Draggable popup
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseDown = (e) => {
      isDragging = true;
      offsetX = e.clientX - popup.offsetLeft;
      offsetY = e.clientY - popup.offsetTop;
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      popup.style.left = `${e.clientX - offsetX}px`;
      popup.style.top = `${e.clientY - offsetY}px`;
    };
    const onMouseUp = () => { isDragging = false; };

    popup.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      popup.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [error]);

  // Auto-dismiss
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(false), 5000);
    return () => clearTimeout(t);
  }, [error]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(false);
  
    try {
      const res = await fetch(`${API_BASE}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
  
      const data = await res.json();
  
      if (!res.ok) {
        setError(true);
        return;
      }
      localStorage.setItem("authToken", data.token);
      router.push("/dashboard");
  
    } catch (err) {
      console.error(err);
      setError(true);
    }
  };

  return (
    <div className="login-wrap">
      {/* starfield behind everything */}
      <StarsBackground count={240} />

      {/* content above the stars */}
      <main className="content">
        <div className="login-card">
          <h2>Login</h2>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 5px 15px rgba(0,0,0,0.3)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Login
            </button>
          </form>
          <button
            type="button"
            className="swap-btn"
            onClick={() => router.push("/signup-page")}
          >
            Create an Account
          </button>
        </div>

        {error && (
          <div className="error-popup" ref={popupRef}>
            <p>Login failed! You may not have an account.</p>
            <button onClick={() => router.push("/signup-page")}>
              Click here to sign up
            </button>
          </div>
        )}
      </main>

      {/* page styles */}
      <style jsx>{`
        .login-wrap {
          position: relative;
          min-height: 100vh;
          background: linear-gradient(135deg, #360f5a, #1c0333);
          overflow: hidden; /* keep canvas clipped */
          display: grid;
          place-items: center;
        }
        .content {
          position: relative;
          z-index: 1; /* float above the canvas */
          width: 100%;
          display: grid;
          place-items: center;
        }
        .login-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          padding: 40px;
          border-radius: 15px;
          box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
          width: 350px;
          text-align: center;
          color: white;
        }
        .login-card h2 {
          margin: 0 0 20px;
        }
        .login-card input {
          width: 100%;
          padding: 12px 15px;
          margin: 10px 0;
          border: none;
          border-radius: 10px;
          outline: none;
          font-size: 16px;
        }
        .login-card button[type="submit"] {
          width: 100%;
          padding: 12px;
          margin-top: 10px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(90deg, #8a2be2, #4b0082);
          color: white;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .error-popup {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 20px;
          background: rgba(255, 0, 0, 0.85);
          border-radius: 15px;
          text-align: center;
          color: white;
          animation: fadeIn 0.3s ease-in-out;
          max-width: 300px;
          cursor: move;
          z-index: 1000;
        }
        .error-popup button {
          margin-top: 10px;
          padding: 10px 20px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(90deg, #ff416c, #ff4b2b);
          color: white;
          font-weight: bold;
          cursor: pointer;
        }

        .swap-btn {
          width: 100%;
          padding: 10px;
          margin-top: 12px;
          border: none;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .swap-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0,0,0,0.3);
          background: rgba(255, 255, 255, 0.18);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* global fixes to avoid white border/flash */}
      <style jsx global>{`
        html, body, #__next {
          height: 100%;
          background: #1b0633;
        }
        body {
          margin: 0;
          overscroll-behavior: none;
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
