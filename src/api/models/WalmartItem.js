const mongoose = require("mongoose");

const WalmartItemSchema = new mongoose.Schema({
  // key: { type: String, unique: true, index: true },   // ❌ remove legacy unique index
  product_id: { type: String, unique: true, index: true, sparse: true }, // ✅ align with FastAPI
  upc:        { type: String, index: true, sparse: true },               // helpful for joins
  source: String,
  query: String,
  title: String,
  price: Number,
  currency: String,
  rating: Number,
  reviews: Number,
  seller: String,
  link: String,
  thumbnail: String,
  availability: String,
  brand: String,
  category: String,
  last_seen_at: String,
  created_at: String,
  raw: mongoose.Schema.Types.Mixed,
}, { timestamps: true });


// OPTIONAL: in prod you might prefer controlled index creation:
WalmartItemSchema.set('autoIndex', false);

module.exports = mongoose.model("WalmartItem", WalmartItemSchema, "walmart_items");
