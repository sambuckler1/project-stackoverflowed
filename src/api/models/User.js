const mongoose = require('mongoose');

// Define what a user document looks like in MongoDB
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },

  savedProducts: [
    {
      asin: String,
      amazonTitle: String,
      amazonPrice: Number,
      amazonThumbnail: String,
      amazonURL: String,
      matchTitle: String,
      matchPrice: Number,
      matchThumbnail: String,
      matchURL: String
    }
  ],


  amazon: {
    accessToken: String,
    refreshToken: String,
    tokenExpiry: Date,
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);