// Base URL of your backend API
// The extension will send login requests here
const API_BASE = "https://feisty-renewal-production.up.railway.app";

// When the login button is clicked, run the login flow
document.getElementById("login-btn").addEventListener("click", async () => {

  // Get the entered username and password from input fields
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  // Status element used to show feedback to the user
  const status = document.getElementById("status");
  status.textContent = "Logging in…";

  try {
    // Send login request to backend
    const res = await fetch(`${API_BASE}/api/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }) // Backend expects JSON payload
    });

    // Parse JSON response (even if request failed)
    const data = await res.json();

    // If backend returns an error (wrong password, no user, etc.)
    if (!res.ok) {
      status.textContent = data.message || "Login failed";
      return;
    }

    // Login success
    // Store the auth token in Chrome's synced storage
    // so all extension pages can access it
    chrome.storage.sync.set({ authToken: data.token }, () => {
      status.textContent = "Success! You may close this window.";
    });

  } catch (err) {
    // Network failure (backend down, no internet, CORS issue, etc.)
    status.textContent = "Network error";
  }
});
