const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); 
const router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-this";


// Registers a new user and stores in DB with hashed password
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check for existing user
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }

    // Hash password and save user
    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ username, email, passwordHash });

    return res.status(201).json({ message: 'Account created successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error during signup', error: err.message });
  }
});

// Logs in an existing user by validating credentials and returning a JWT
// Toekn is used by website and Chrome extension
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Missing credentials' });

    const user = await User.findOne({ username });
    if (!user)
      return res.status(400).json({ message: 'Invalid username or password' });

    // Compare input password with stored hash
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return res.status(400).json({ message: 'Invalid username or password' });

    // Create token for extension and website
    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: 'Login successful',
      userId: user._id,
      token,
    });
  } catch (err) {
    return res.status(500).json({
      message: 'Server error during login',
      error: err.message,
    });
  }
});

// Returns a fresh JWT for the Chrome extension
router.get("/extension-session", async (req, res) => {
  try {
    // If using cookie-session:
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ loggedIn: false });
    }

    const token = jwt.sign(
      { userId: req.session.userId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ loggedIn: true, token });
  } catch (err) {
    res.status(500).json({ loggedIn: false });
  }
});

// Adds a saved deal to the user account, used by Chrome extension and website Deal Finder
router.post("/save-product", authMiddleware, async (req, res) => {
  try {
    const {asin, amazonTitle, amazonPrice, amazonThumbnail, amazonURL, matchTitle, matchPrice, matchThumbnail, matchURL} = req.body;
    if (!asin) return res.status(400).json({ message: "ASIN required" });

    const user = await User.findById(req.userId);

    user.savedProducts.push({ asin, amazonTitle, amazonPrice, amazonThumbnail, amazonURL, matchTitle, matchPrice, matchThumbnail, matchURL });
    await user.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Error saving product" });
  }
});

router.get("/saved-products", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json({ products: user.savedProducts });
});

// Returns all saved deals for the logged in user
router.post("/remove-saved-products", authMiddleware, async (req, res) => {
  const { asins } = req.body;

  await User.updateOne(
    { _id: req.userId },
    { $pull: { savedProducts: { asin: { $in: asins } } } }
  );

  res.json({ success: true });
});

// Validates JWT attached to protected routes
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = router;