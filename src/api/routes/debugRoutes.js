// routes/debugRoutes.js

const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

/*
    GET /api/db/debug
    Returns:
    - The name of the currently connected MongoDB database
    - A list of all collection names in that database
*/
router.get("/db/debug", async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    const dbName = db?.databaseName;
    const cols = (await db.listCollections().toArray()).map((c) => c.name);

    res.json({ node_db_name: dbName, collections: cols });
  } catch (err) {
    console.error("DB debug error:", err.message);
    res.status(500).json({ error: "Failed to fetch DB info" });
  }
});

/*
    Lightweight User model for debug-only purposes.
    Uses strict: false to handle any schema shape in the "users" collection.
*/
const UserSchema = new mongoose.Schema({}, { strict: false });
const User =
  mongoose.models.__DbgUser ||
  mongoose.model("__DbgUser", UserSchema, "users");

/*
    GET /api/users/debug
    Returns:
    - DB name
    - Total count of documents in "users"
    - A sample user with username + email fields (if present)
*/
router.get("/users/debug", async (_req, res) => {
  try {
    const dbName = mongoose.connection.db?.databaseName;
    const count = await User.countDocuments();
    const sample = await User.findOne(
      {},
      { _id: 0, username: 1, email: 1 }
    ).lean();

    res.json({ node_db_name: dbName, users_count: count, sample });
  } catch (err) {
    console.error("Users debug error:", err.message);
    res.status(500).json({ error: "Failed to fetch users debug info" });
  }
});

/*
    GET /api/users/exists?username=...
    Checks if a user with the given username exists in the "users" collection.
*/
router.get("/users/exists", async (req, res) => {
  try {
    const { username } = req.query;
    if (!username)
      return res.status(400).json({ error: "username required" });

    const exists = !!(await User.findOne({ username }).lean());
    res.json({ username, exists });
  } catch (err) {
    console.error("Users exists debug error:", err.message);
    res.status(500).json({ error: "Failed to check user existence" });
  }
});

module.exports = router;
