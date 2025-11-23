(function () {

  // --------------------------
  // Extract ASIN
  // --------------------------
  function getASIN() {
    const url = window.location.href;
    const match =
      url.match(/\/dp\/([A-Z0-9]{10})/) ||
      url.match(/\/product\/([A-Z0-9]{10})/);

    return match ? match[1] : null;
  }

  // --------------------------
  // Extract BEST possible Amazon image
  // --------------------------
  function extractAmazonMainImage() {
    const landing = document.querySelector("#landingImage");
    if (landing) {
      const hires = landing.getAttribute("data-old-hires");
      if (hires && hires.length > 5) return hires;
      if (landing.src && landing.src.length > 5) return landing.src;
    }

    const dynImg = document.querySelector("img[data-a-dynamic-image]");
    if (dynImg) {
      try {
        const json = JSON.parse(dynImg.getAttribute("data-a-dynamic-image") || "{}");
        const bestUrl = Object.keys(json)[0];
        if (bestUrl && bestUrl.length > 5) return bestUrl;
      } catch (e) {}
    }

    const imgEl =
      document.getElementById("landingImage") ||
      document.querySelector("#imgTagWrapperId img") ||
      document.querySelector("img[src*='images/I']");
    if (imgEl && imgEl.src) return imgEl.src;

    return "";
  }

  // --------------------------
  // Scrape info
  // --------------------------
  function scrapeProductInfo() {
    const titleEl = document.getElementById("productTitle");
    const title = titleEl ? titleEl.textContent.trim() : "";

    let priceText = "";
    const priceEl =
      document.querySelector("#corePrice_feature_div span.a-offscreen") ||
      document.querySelector("#corePrice_desktop span.a-offscreen") ||
      document.querySelector("span.a-offscreen");
    if (priceEl) priceText = priceEl.textContent.trim();

    const price = priceText
      ? parseFloat(priceText.replace(/[^0-9.]/g, ""))
      : null;

    const brandEl =
      document.querySelector("#bylineInfo") ||
      document.querySelector("tr.po-brand td.a-span9 span");
    const brand = brandEl ? brandEl.textContent.trim() : "";

    const thumbEl =
      document.getElementById("landingImage") ||
      document.querySelector("#imgTagWrapperId img") ||
      document.querySelector("img[src*='images/I']");
    const thumbnail = thumbEl ? thumbEl.src : "";

    const image_url = extractAmazonMainImage();

    return { title, price, brand, thumbnail, image_url };
  }

  // --------------------------
  // Build iframe URL
  // --------------------------
  function buildPanelSrc(asin, info) {
    const url = new URL(chrome.runtime.getURL("panel.html"));
    url.searchParams.set("asin", asin);

    if (info) {
      if (info.title) url.searchParams.set("title", info.title);
      if (info.price != null) url.searchParams.set("price", String(info.price));
      if (info.brand) url.searchParams.set("brand", info.brand);
      if (info.thumbnail) url.searchParams.set("thumb", info.thumbnail);
      if (info.image_url) url.searchParams.set("image_url", info.image_url);
    }

    url.searchParams.set("amazonURL", window.location.href);
    
    return url.toString();
  }

  // --------------------------
  // Inject sidebar iframe
  // --------------------------
  function injectSidebar(asin, info) {
    if (!asin) return;

    const src = buildPanelSrc(asin, info);

    const existing = document.getElementById("fbalgo-extension-sidebar");
    if (existing) {
      existing.src = src;
      return;
    }

    const container = document.createElement("div");
    container.id = "fbalgo-sidebar-container";
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.right = "0";
    container.style.height = "100vh";
    container.style.width = "380px";
    container.style.background = "transparent";
    container.style.display = "flex";
    container.style.zIndex = "999999999";
    container.style.flexDirection = "row";
    container.style.transition = "width 0.15s ease";

    // Toggle button
    const toggleBtn = document.createElement("div");
    toggleBtn.textContent = "‹";
    toggleBtn.style.position = "absolute";
    toggleBtn.style.left = "-20px";
    toggleBtn.style.top = "10px";
    toggleBtn.style.width = "18px";
    toggleBtn.style.height = "28px";
    toggleBtn.style.borderRadius = "4px 0 0 4px";
    toggleBtn.style.background = "#4b1d7a";
    toggleBtn.style.color = "white";
    toggleBtn.style.fontSize = "14px";
    toggleBtn.style.fontWeight = "bold";
    toggleBtn.style.display = "flex";
    toggleBtn.style.justifyContent = "center";
    toggleBtn.style.alignItems = "center";
    toggleBtn.style.cursor = "pointer";
    toggleBtn.style.zIndex = "1000000000";

    let isCollapsed = false;

    toggleBtn.addEventListener("click", () => {
      if (!isCollapsed) {
        container.style.width = "0px";
        toggleBtn.textContent = "›";
        isCollapsed = true;
      } else {
        container.style.width = "380px";
        toggleBtn.textContent = "‹";
        isCollapsed = false;
      }
    });

    // Resize dragger
    const dragger = document.createElement("div");
    dragger.style.width = "6px";
    dragger.style.cursor = "ew-resize";
    dragger.style.background = "rgba(255, 255, 255, 0.15)";
    dragger.style.height = "100%";
    dragger.style.position = "absolute";
    dragger.style.left = "0";
    dragger.style.top = "0";

    let isResizing = false;

    dragger.addEventListener("mousedown", () => {
      isResizing = true;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 700) {
        container.style.width = `${newWidth}px`;
      }
    });

    document.addEventListener("mouseup", () => {
      isResizing = false;
      document.body.style.userSelect = "auto";
    });

    const iframe = document.createElement("iframe");
    iframe.id = "fbalgo-extension-sidebar";
    iframe.src = src;
    iframe.style.border = "none";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.boxShadow = "0 0 12px rgba(0,0,0,0.25)";

    container.appendChild(dragger);
    container.appendChild(iframe);
    container.appendChild(toggleBtn);
    document.body.appendChild(container);
  }

  // --------------------------
  // Init on load + SPA changes
  // --------------------------
  function init() {
    const asin = getASIN();
    if (!asin) return;
    const info = scrapeProductInfo();
    injectSidebar(asin, info);
  }

  window.addEventListener("load", init);

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      init();
    }
  }, 800);

  // --------------------------
  // NEW: extension token → website
  // --------------------------
  chrome.runtime.sendMessage({ type: "REQUEST_TOKEN" }, (token) => {
    if (token) {
      window.postMessage({ type: "EXTENSION_LOGIN", token }, "*");
    }
  });

})();
