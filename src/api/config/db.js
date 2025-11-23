const mongoose = require("mongoose");

const MONGO_URL = process.env.MONGO_URL;
const MONGO_DB  = "MongoDB"; // <- keep this aligned with pyapi

const connectDB = async () => {
  try {
    if (!MONGO_URL) throw new Error("MONGO_URL not set");
    await mongoose.connect(MONGO_URL, { dbName: MONGO_DB });
    console.log("Connected to MongoDB", { db: mongoose.connection.db.databaseName });
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

module.exports = connectDB;