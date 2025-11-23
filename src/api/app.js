// app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// Amazon auth + SP-API routes
const amazonRoutes = require("./routes/amazonRoutes");
app.use("/", amazonRoutes); // /auth/* and /spapi/*

// All commerce data scraping + deals
const commerceRoutes = require("./routes/commerceRoutes");
app.use("/api/commerce", commerceRoutes);

// Debug tools (DB + users debug)
const debugRoutes = require("./routes/debugRoutes");
app.use("/api", debugRoutes); // /api/db/debug, /api/users/debug, /api/users/exists

// User auth routes
const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

// const ExtensionPanel = require("./routes/extensionRoutes")
// app.use("/api/extension-panel", ExtensionPanel);

// Health check
app.get("/", (_req, res) => res.send("Backend running"));

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global Error:", err.stack);
  res.status(500).json({ error: "Server Error" });
});

const port = process.env.PORT || 8080;
connectDB().then(() => {
  app.listen(port, "0.0.0.0", () =>
    console.log(`Server live on ${port}`)
  );
});
