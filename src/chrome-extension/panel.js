// Base URLs for backend services
// PY_API_BASE → FastAPI service (deal finding + URL resolving)
// NODE_API_BASE → Node service (user accounts + saving products)
const PY_API_BASE = "https://diligent-spontaneity-production-d286.up.railway.app";
const NODE_API_BASE = "https://feisty-renewal-production.up.railway.app";

// Checks if user is logged in and updates the UI accordingly
async function refreshAuthUI() {
  const { authToken } = await chrome.storage.sync.get("authToken");

  const signInBtn = document.getElementById("btn-open-login");
  const logoutBar = document.getElementById("logout-bar");
  // If authenticated, hide login button and show logout bar
  if (authToken) {
    signInBtn.style.display = "none";
    logoutBar.style.display = "block";
  } else {
    // If not logged in, show login button
    signInBtn.style.display = "inline-block";
    logoutBar.style.display = "none";
  }
}

//Auth Event Listeners

function initAuthListeners() {
  const loginModal = document.getElementById("login-modal");
  const btnOpen = document.getElementById("btn-open-login");
  const btnCancel = document.getElementById("btn-cancel-login");
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");

  // Open login modal
  btnOpen.addEventListener("click", () => {
    loginModal.style.display = "flex";
  });

  // Close login modal
  btnCancel.addEventListener("click", () => {
    loginModal.style.display = "none";
  });

  // Handle login request
  btnLogin.addEventListener("click", async () => {
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value.trim();

    if (!username || !password) {
      alert("Enter username and password");
      return;
    }

    try {
      const res = await fetch(`${NODE_API_BASE}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Login failed");
        return;
      }
      // Store token so extension can authenticate future requests
      await chrome.storage.sync.set({ authToken: data.token });
      alert("Logged in!");
      loginModal.style.display = "none";
      refreshAuthUI();
    } catch (err) {
      alert("Network error");
    }
  });

  // Handle Logout  
  btnLogout.addEventListener("click", async () => {
    await chrome.storage.sync.remove("authToken");
    alert("Signed out");
    refreshAuthUI();
  });

  refreshAuthUI();
}

// Panel Initialization
function initPanel() {
  // Pull query params passed from content script
  const params = new URLSearchParams(window.location.search);

  const asin = params.get("asin") || "";
  const title = params.get("title") || "";
  const brand = params.get("brand") || "";
  const thumb = params.get("thumb") || "";
  const priceStr = params.get("price");
  const price = priceStr ? parseFloat(priceStr) : NaN;
  const amazonURL = params.get("amazonURL") || null;

  const app = document.getElementById("app");

  // Truncate long titles for cleaner UI
  const safeTitle =
    title.length > 80 ? title.slice(0, 77).trimEnd() + "…" : title;

  app.innerHTML = `
    <div style="
      position: relative;
      padding: 16px 14px 18px;
      color: #fff;
      font-family: system-ui, sans-serif;
      background: radial-gradient(1200px 800px at 20% -10%, #4b1d7a 0%, transparent 60%),
                  radial-gradient(1200px 800px at 80% -10%, #2a0c52 0%, transparent 60%),
                  #1c0333;
      height: 100vh;
      box-sizing: border-box;
    ">
      <h2 style="margin: 0 0 4px; font-size: 18px; letter-spacing: .03em; text-transform: uppercase;">
        FBALGO SAVINGS
      </h2>
      <p style="margin: 0 0 10px; opacity: 0.8; font-size: 12px;">
        Live deal check across the internet.
      </p>

      <div style="display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px;">
        ${
          thumb
            ? `<div style="flex:0 0 60px;">
                 <div style="width:60px;height:60px;border-radius:12px;background:#111;
                   display:flex;align-items:center;justify-content:center;overflow:hidden;">
                   <img src="${thumb}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                 </div>
               </div>`
            : ""
        }
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${safeTitle}</div>
          ${brand ? `<div style="font-size:11px;opacity:0.8;">Brand: ${brand}</div>` : ""}
          ${
            !isNaN(price)
              ? `<div style="font-size:13px;margin-top:4px;">Amazon price: <strong>$${price.toFixed(2)}</strong></div>`
              : `<div style="font-size:12px;margin-top:4px;opacity:.8;">Amazon price: <em>not detected</em></div>`
          }
        </div>
      </div>

      <button id="fb-find-deals" style="
        width: 100%;padding: 10px 12px;border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.25);
        background: linear-gradient(135deg, #a855f7, #4c1d95);
        color: #fff;font-weight: 600;cursor: pointer;font-size: 13px;
      ">Find Savings</button>

      <div id="fb-results" style="margin-top:12px;font-size:13px;"></div>
    </div>
  `;

  const button = document.getElementById("fb-find-deals");
  const results = document.getElementById("fb-results");

  button.addEventListener("click", async () => {
    if (!title || isNaN(price)) {
      results.innerHTML =
        "<span style='color:#f97373;'>Missing title or price; refresh and try again.</span>";
      return;
    }

    results.textContent = "Searching for deals…";

    try {
      // Call FastAPI deal matcher
      const res = await fetch(`${PY_API_BASE}/extension/find-deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin,
          title,
          price,
          brand,
          thumbnail: thumb
        }),
      });

      const data = await res.json();

      if (!data.match_found || !data.best_deals || data.best_deals.length === 0) {
        results.innerHTML = "<span>No cheaper offers found for this item.</span>";
        return;
      }

      const amazonPrice = price;
      const sortedDeals = [...data.best_deals].sort((a, b) => a.price - b.price);

      const cardsHtml = sortedDeals.map((deal) => {
        const rawDomain = deal.source_domain || "store";
        const storeLabel = rawDomain.replace(/^https?:\/\/(www\.)?/i, "");
        const dealPrice = deal.price;
        const savingsAbs = deal.savings_abs;
        const savingsPct = deal.savings_pct;
        const titleText = deal.title;
        const thumbDeal = deal.thumbnail || thumb;

        return `
          <div style="margin-top:8px;padding:9px 10px;border-radius:12px;
            background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.45);">
            <div style="display:flex;gap:8px;align-items:flex-start;">
              ${
                thumbDeal
                  ? `<div style="flex:0 0 48px;">
                       <div style="width:48px;height:48px;border-radius:10px;background:#020617;
                         display:flex;align-items:center;justify-content:center;overflow:hidden;">
                         <img src="${thumbDeal}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                       </div>
                     </div>`
                  : ""
              }
              <div style="flex:1;">
                <div style="font-size:11px;opacity:.8;margin-bottom:2px;">${storeLabel}</div>
                <div style="font-size:13px;margin-bottom:2px;font-weight:600;">${titleText}</div>
                <div style="font-size:12px;margin-top:2px;">
                  <strong>$${dealPrice.toFixed(2)}</strong>
                  <span style="opacity:.8;"> · Save $${savingsAbs.toFixed(2)} (${savingsPct.toFixed(1)}%)</span>
                </div>

                <button 
                  class="save-btn"
                  data-asin="${asin}"
                  data-amazonTitle="${safeTitle}"
                  data-amazonPrice="${price}"
                  data-amazonThumbnail="${thumb}"
                  data-amazonurl="${encodeURIComponent(amazonURL)}"
                  data-matchTitle="${titleText}"
                  data-matchPrice="${dealPrice}"
                  data-matchThumbnail="${thumbDeal}"
                  data-matchsourcedomain="${rawDomain}"
                  style="margin-top: 6px; padding:5px 10px; border-radius:6px; 
                    background:#8b5cf6; color:white; border:none; cursor:pointer;">
                  ❤️ Save
                </button>
              </div>
            </div>
          </div>
        `;
      }).join("");

      results.innerHTML = `
        <div style="margin-bottom:6px;padding:6px 8px;border-radius:8px;
          background:rgba(148,163,184,0.18);border:1px dashed rgba(148,163,184,0.5);
          font-size:12px;">
          Found <strong>${sortedDeals.length}</strong> cheaper offer${sortedDeals.length > 1 ? "s" : ""}.
        </div>
        ${cardsHtml}
      `;

      // SAVE BUTTON LOGIC
      document.querySelectorAll(".save-btn").forEach(btn => {
        btn.addEventListener("click", async () => {

          const { authToken } = await chrome.storage.sync.get("authToken");

          if (!authToken) {
            chrome.runtime.sendMessage({ type: "OPEN_LOGIN" });
            return;
          }

          btn.textContent = "⏳ Saving...";
          btn.disabled = true;

          // Step 1: Resolve REAL merchant URL via Light Search
          const resolveRes = await fetch(`${PY_API_BASE}/extension/resolve-merchant-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source_domain: btn.dataset.matchsourcedomain,
              title: btn.dataset.matchtitle,
              expected_price: parseFloat(btn.dataset.matchprice)
            }),
          });

          const resolveData = await resolveRes.json();
          const realURL = resolveData.resolved_url || null;

          // Step 2: Save to Node backend
          const body = {
            asin: btn.dataset.asin,

            amazonTitle: btn.dataset.amazontitle,
            amazonPrice: parseFloat(btn.dataset.amazonprice),
            amazonThumbnail: btn.dataset.amazonthumbnail,
            amazonURL: decodeURIComponent(btn.dataset.amazonurl),

            matchTitle: btn.dataset.matchtitle,
            matchPrice: parseFloat(btn.dataset.matchprice),
            matchThumbnail: btn.dataset.matchthumbnail,
            matchURL: realURL,
          };

          await fetch(`${NODE_API_BASE}/api/users/save-product`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + authToken,
            },
            body: JSON.stringify(body),
          });

          btn.textContent = "❤️ Saved!";
        });
      });

    } catch (err) {
      console.error("find-deals error", err);
      results.innerHTML =
        "<span style='color:#f97373;'>Error: " +
        (err.message || "Unknown error") +
        "</span>";
    }
  });
}

initPanel();
initAuthListeners();
