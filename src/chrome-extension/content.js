(function () {

  // EXTRACT ASIN FROM AMAZON PRODUCT URL
  function getASIN() {
    const url = window.location.href;

    // Match patterns like:
    // - /dp/B000123456
    // - /product/B000123456
    const match =
      url.match(/\/dp\/([A-Z0-9]{10})/) ||
      url.match(/\/product\/([A-Z0-9]{10})/);

    return match ? match[1] : null;
  }

  // EXTRACT MAIN AMAZON PRODUCT IMAGE
  // Attempts multiple fallbacks for reliability
  function extractAmazonMainImage() {
    // Primary landing image element
    const landing = document.querySelector("#landingImage");
    if (landing) {
      const hires = landing.getAttribute("data-old-hires");
      if (hires && hires.length > 5) return hires;

      if (landing.src && landing.src.length > 5) return landing.src;
    }

    // Dynamic image container (used on many listings)
    const dynImg = document.querySelector("img[data-a-dynamic-image]");
    if (dynImg) {
      try {
        const json = JSON.parse(dynImg.getAttribute("data-a-dynamic-image") || "{}");
        const bestUrl = Object.keys(json)[0];
        if (bestUrl && bestUrl.length > 5) return bestUrl;
      } catch (e) {}
    }

    // Additional fallback selectors
    const imgEl =
      document.getElementById("landingImage") ||
      document.querySelector("#imgTagWrapperId img") ||
      document.querySelector("img[src*='images/I']");

    if (imgEl && imgEl.src) return imgEl.src;

    return "";
  }

  // SCRAPE PRODUCT DETAILS FROM AMAZON PAGE
  // title, price, brand, thumbnail, high-res image
  function scrapeProductInfo() {
    // Product title
    const titleEl = document.getElementById("productTitle");
    const title = titleEl ? titleEl.textContent.trim() : "";

    // Price text extraction
    let priceText = "";
    const priceEl =
      document.querySelector("#corePrice_feature_div span.a-offscreen") ||
      document.querySelector("#corePrice_desktop span.a-offscreen") ||
      document.querySelector("span.a-offscreen");

    if (priceEl) priceText = priceEl.textContent.trim();

    // Convert price string into a float
    const price = priceText
      ? parseFloat(priceText.replace(/[^0-9.]/g, ""))
      : null;

    // Brand extraction (works across multiple Amazon layouts)
    const brandEl =
      document.querySelector("#bylineInfo") ||
      document.querySelector("tr.po-brand td.a-span9 span");

    const brand = brandEl ? brandEl.textContent.trim() : "";

    // Thumbnail fallback
    const thumbEl =
      document.getElementById("landingImage") ||
      document.querySelector("#imgTagWrapperId img") ||
      document.querySelector("img[src*='images/I']");

    const thumbnail = thumbEl ? thumbEl.src : "";

    const image_url = extractAmazonMainImage();

    return { title, price, brand, thumbnail, image_url };
  }

  // BUILD THE PANEL IFRAME URL WITH QUERY PARAMS
  // panel.html receives ASIN + product details
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

    // Used later for saving products
    url.searchParams.set("amazonURL", window.location.href);

    return url.toString();
  }

  // INJECT THE SIDEBAR PANEL INTO AMAZON PAGE
  // Includes: iframe, collapse toggle, draggable width resize
  function injectSidebar(asin, info) {
    if (!asin) return;

    const src = buildPanelSrc(asin, info);

    // If sidebar already exists, update iframe instead of recreating it
    const existing = document.getElementById("fbalgo-extension-sidebar");
    if (existing) {
      existing.src = src;
      return;
    }

    // Sidebar container
    const container = document.createElement("div");
    container.id = "fbalgo-sidebar-container";
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.right = "0";
    container.style.height = "100vh";
    container.style.width = "380px";
    container.style.background = "transparent";
    container.style.display = "flex";
    container.style.flexDirection = "row";
    container.style.zIndex = "999999999";
    container.style.transition = "width 0.15s ease";

    // Collapse toggle button
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

    // Sidebar resize handle
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

    // Panel iframe
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

  //INITIALIZE ON PAGE LOAD AND SPA URL CHANGES
  function init() {
    const asin = getASIN();
    if (!asin) return;

    const info = scrapeProductInfo();
    injectSidebar(asin, info);
  }

  // Run on initial full page load
  window.addEventListener("load", init);

  // Detect URL changes on Amazon's single-page app transitions
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      init();
    }
  }, 800);

  // SEND EXTENSION AUTH TOKEN TO AMAZON PAGE
  // Used for auto-login sync with web app
  chrome.runtime.sendMessage({ type: "REQUEST_TOKEN" }, (token) => {
    if (token) {
      window.postMessage({ type: "EXTENSION_LOGIN", token }, "*");
    }
  });

})();
