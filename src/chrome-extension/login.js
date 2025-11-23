const API_BASE = "https://feisty-renewal-production.up.railway.app";

document.getElementById("login-btn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const status = document.getElementById("status");

  status.textContent = "Logging in…";

  try {
    const res = await fetch(`${API_BASE}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      status.textContent = data.message || "Login failed";
      return;
    }

    // Save token for use everywhere in the extension
    chrome.storage.sync.set({ authToken: data.token }, () => {
      status.textContent = "Success! You may close this window.";
    });

  } catch (err) {
    status.textContent = "Network error";
  }
});
