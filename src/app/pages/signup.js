import { useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { Space_Grotesk } from "next/font/google";

// Backend API base (Node server)
const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://feisty-renewal-production.up.railway.app";

// Load animated star background (disabled during SSR)
const StarsBackground = dynamic(() => import("../components/StarsBackground"), {
  ssr: false,
});

// Page font
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
});

export default function Signup() {
  const router = useRouter();

  // Form state
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // UI message (errors / success)
  const [message, setMessage] = useState("");

  // Handle input changes in form
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Submit signup form
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic password strength requirement
    const passwordValid =
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/.test(
      formData.password
    );

    if (!passwordValid) {
      setMessage(
        "Password must be at least 8 characters and include a number and special character."
      );
      return;
    }

    // Check for matching passwords
    if (formData.password !== formData.confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    // Attempt account creation
    try {
      const response = await fetch(
        `${API_BASE}/api/users/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: formData.username,
            email: formData.email,
            password: formData.password,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        // Success, redirect to login
        setMessage("Account created! Redirecting...");
        setTimeout(() => router.push("/login"), 1500);
      } else {
        // Failure, display backend error message  
        setMessage(data.message || "Something went wrong.");
      }
    } catch (err) {
      console.error(err);
      setMessage("Server error. Try again later.");
    }
  };

  return (
    <div className="signup-wrap">
      <StarsBackground count={240} />

      <main className="content">
        <div className="card">
          <h2 className={`${spaceGrotesk.className} title`}>
            Create FBAlgo Account
          </h2>

          <form onSubmit={handleSubmit} className="form">
            <input
              type="text"
              name="username"
              placeholder="Username"
              required
              value={formData.username}
              onChange={handleChange}
              className="input"
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              required
              value={formData.email}
              onChange={handleChange}
              className="input"
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              value={formData.password}
              onChange={handleChange}
              className="input"
            />
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
              className="input"
            />
            <button type="submit" className="submit">
              Sign Up
            </button>
          </form>

          {message && <p className="msg">{message}</p>}
        </div>
      </main>

      <style jsx>{`
        .signup-wrap {
          position: relative;
          min-height: 100vh;
          background: linear-gradient(135deg, #360f5a, #1c0333);
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: 2rem;
        }
        .content {
          position: relative;
          z-index: 1; /* above canvas */
          width: min(520px, 100%);
        }
        .card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
          color: #fff;
          padding: 28px;
        }
        .title {
          font-weight: 700;
          font-size: clamp(1.75rem, 3.5vw, 2.25rem);
          margin: 0 0 1rem;
          letter-spacing: 0.5px;
          text-shadow: 0 0 24px rgba(255, 255, 255, 0.2),
            0 2px 12px rgba(0, 0, 0, 0.6);
          text-align: center;
        }
        .form {
          display: grid;
          gap: 12px;
        }
        .input {
          width: 100%;
          padding: 12px 15px;
          border: none;
          border-radius: 10px;
          outline: none;
          font-size: 16px;
          background: rgba(255, 255, 255, 0.9);
          color: #111;
        }
        .submit {
          width: 100%;
          padding: 12px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(90deg, #8a2be2, #4b0082);
          color: white;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }
        .msg {
          margin-top: 12px;
          text-align: center;
          font-size: 0.95rem;
          opacity: 0.95;
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
