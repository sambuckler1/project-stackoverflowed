// routes/amazonRoutes.js

const express = require("express"); // Import express so we can create a router object
const aws4 = require("aws4");       // For signing Amazon API requests
const axios = require("axios");     // HTTP client for making API requests
const https = require("https");     // Node's native HTTPS module (used with Axios)

const router = express.Router();

// LWA/SP-API state (in-memory for now; should be persisted per user/session later)
let currentAccessToken = null; // LWA access token (short-lived)
let refreshToken = null;       // Used to refresh Access Token. Should be saved in DB later
let sellerId = null;           // The user's Amazon account ID
let marketplaceId = null;      // Defines which geographical marketplace we're working in


/*  ---------- LWA STEP 1 ----------
    Route: GET /auth/login

    Sends the user to Amazon Seller Central to log in and authorize our app.

    ARGS:
        req = The request from Express. '_' means we're not using it
        res = The response, used to redirect the browser
*/
router.get("/auth/login", async (_req, res) => {
  try {
    // Generates a random "state" string for security reasons. Prevents CSRF attacks (store & verify in production)
    const state = Math.random().toString(36).slice(2);

    // Creates a set of query params that Amazon expects in the auth URL
    const params = new URLSearchParams({
      application_id: process.env.SP_APP_ID || "",      // Identifies our app in Seller Central
      state,                                            // The random string generated above
      redirect_uri: process.env.AMAZON_REDIRECT_URI || "",
      version: "beta",                                  // LWA/SP-API app version flag
    });

    // Sends the user's browser to Amazon's consent page with our params
    return res.redirect(
      `https://sellercentral.amazon.com/apps/authorize/consent?${params.toString()}`
    );
  } catch (err) {
    console.error("Login redirect failed:", err.message);
    return res.status(500).send("Error initiating Amazon login");
  }
});


/*  ---------- LWA STEP 2 ----------
    Route: GET /auth/callback

    Handles the redirect back from Amazon after the user authorizes our app.
    Exchanges the temporary auth code for an access token + refresh token.

    ARGS:
        req = Contains query params from Amazon
        res = Used to redirect back to the frontend
*/
router.get("/auth/callback", async (req, res) => {
  const { spapi_oauth_code, error } = req.query;

  // Basic validation of Amazon's response
  if (error) return res.status(400).send(`Amazon error: ${error}`);
  if (!spapi_oauth_code)
    return res.status(400).send("No spapi_oauth_code provided");

  try {
    // Build POST body for Amazon's token endpoint
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: spapi_oauth_code,                          // Code from Amazon redirect
      client_id: process.env.AMAZON_CLIENT_ID || "",
      client_secret: process.env.AMAZON_CLIENT_SECRET || "",
      redirect_uri: process.env.AMAZON_REDIRECT_URI || "",
    });

    // Exchange the code for tokens
    const tokenRes = await axios.post(
      "https://api.amazon.com/auth/o2/token",
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // Save tokens in memory for now
    currentAccessToken = tokenRes.data.access_token;
    refreshToken = tokenRes.data.refresh_token;

    // Redirect user back to the frontend after successful auth
    const frontend = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(frontend);
  } catch (err) {
    console.error(
      "Token exchange failed:",
      err.response?.status,
      err.response?.data || err.message
    );
    return res.status(500).send("Error exchanging auth code");
  }
});


/*
    Helper function:
    Signs and sends a GET request to an SP-API sandbox endpoint.
*/
async function signedGetSandbox(path, accessToken) {
  const host = "sandbox.sellingpartnerapi-na.amazon.com"; // Sandbox host (NA)
  const region = "us-east-1";

  const reqOpts = {
    host,
    path,
    method: "GET",
    service: "execute-api",
    region,
    headers: {
      "x-amz-access-token": accessToken,
      "user-agent": "FBAlgo-App/0.1 (Language=Node)",
    },
  };

  // Sign the request using AWS credentials from environment variables
  aws4.sign(reqOpts);

  const url = `https://${host}${path}`;
  const httpsAgent = new https.Agent({ keepAlive: true });

  const { data } = await axios.get(url, {
    headers: reqOpts.headers,
    httpsAgent,
  });

  return data;
}


/*
    Route: GET /spapi/sandbox-check

    Quick sandbox check to:
    - Call a test SP-API endpoint
    - Grab sellerId and marketplaceId for later calls
*/
router.get("/spapi/sandbox-check", async (_req, res) => {
  if (!currentAccessToken) {
    return res.status(401).json({ error: "Login first via /auth/login" });
  }

  try {
    const data = await signedGetSandbox(
      "/sellers/v1/marketplaceParticipations",
      currentAccessToken
    );

    // Pull sellerId and marketplaceId from the first participation (sandbox structure may differ)
    const first = data?.payload?.[0];
    if (first) {
      sellerId = first.sellerId || sellerId;
      marketplaceId =
        (first.marketplace &&
          (first.marketplace.id || first.marketplace.marketplaceId)) ||
        marketplaceId;
    }

    return res.json({ ok: true, data, sellerId, marketplaceId });
  } catch (err) {
    console.error(
      "Sandbox check failed:",
      err.response?.status,
      err.response?.data || err.message
    );
    return res
      .status(500)
      .json({ error: "Sandbox call failed", detail: err.response?.data || err.message });
  }
});


/*
    Route: GET /spapi/products

    Example sandbox route:
    - Uses Listings Items API
    - Requires sellerId and marketplaceId (from /spapi/sandbox-check)
    - Mainly used to verify signing + headers and end-to-end flow
*/
router.get("/spapi/products", async (_req, res) => {
  if (!currentAccessToken) {
    return res.status(401).json({ error: "Login first via /auth/login" });
  }
  if (!sellerId || !marketplaceId) {
    return res.status(400).json({
      error:
        "Missing sellerId/marketplaceId. Run /spapi/sandbox-check first.",
    });
  }

  try {
    const path = `/listings/2021-08-01/items/${encodeURIComponent(
      sellerId
    )}?marketplaceIds=${encodeURIComponent(marketplaceId)}`;

    const data = await signedGetSandbox(path, currentAccessToken);
    return res.json(data);
  } catch (err) {
    console.error(
      "Listings sandbox failed:",
      err.response?.status,
      err.response?.data || err.message
    );
    return res.status(500).json({
      error: "Failed to fetch products (sandbox)",
      detail: err.response?.data || err.message,
    });
  }
});

// Exports the router so it can be imported and mounted in app.js
module.exports = router;
