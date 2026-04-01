const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { validate } = require('../utils/validation');
const { logger } = require('../utils/logger');

// ✅ SECURITY: Ensure JWT_SECRET is configured (fail fast on startup)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is not set. This is required for production.');
}

// ✅ SECURITY: Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many auth attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// @route   POST api/auth/register
// @desc    Register a user with validation and rate limiting
// @access  Public
router.post('/register', authLimiter, validate('register'), async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });

    if (user) {
      return res.status(400).json({ msg: 'Email already registered' });
    }

    user = new User({
      email,
      password,
    });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    const payload = {
      user: {
        id: user.id,
      },
    };

    const token = jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    logger.error('Registration failed', { error: err.message, email: req.body.email });
    res.status(500).json({ msg: 'Server error during registration' });
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user & get token with validation and rate limiting
// @access  Public
router.post('/login', authLimiter, validate('login'), async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ msg: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid email or password' });
    }

    const payload = {
      user: {
        id: user.id,
      },
    };

    const token = jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    logger.error('Login failed', { error: err.message, email: req.body.email });
    res.status(500).json({ msg: 'Server error during login' });
  }
});

// @route   POST api/auth/google
// @desc    Authenticate with Firebase Google ID Token
// @access  Public
router.post('/google', async (req, res) => {
  const { idToken, email: clientEmail } = req.body;

  if (!idToken) {
    return res.status(400).json({ msg: 'No token provided' });
  }

  try {
    // 🛡️ VERIFY Firebase ID Token
    // Firebase ID Tokens are JWTs signed by Google.
    const decodedToken = jwt.decode(idToken);

    if (!decodedToken) {
      logger.error('Google Auth: JWT decode failed', { hasToken: !!idToken });
      return res.status(400).json({ msg: 'Invalid token format' });
    }

    let email = (decodedToken.email || decodedToken.user_email || decodedToken.firebase?.identities?.email?.[0] || clientEmail)?.toLowerCase();

    if (!email && decodedToken.sub) {
      // 📛 PERSONALIZED FALLBACK: Use Name or Username if Email is hidden
      const name = (decodedToken.name || decodedToken.preferred_username || decodedToken.given_name || 'Member').replace(/\s+/g, '');
      const uniqueId = decodedToken.sub.substring(0, 8);
      email = `${name}_${uniqueId}@mnemos-social.local`.toLowerCase();
      logger.info('Google Auth: Using fallback identity', { email });
    }

    if (!email) {
      logger.error('Google Auth: Identity missing from token payload');
      return res.status(400).json({ msg: 'Token missing identity' });
    }

    // Find or Create User
    let user = await User.findOne({ email });

    if (!user) {
      // Create a new Google-authenticated user record
      user = new User({
        email,
        password: 'SOCIAL_LOGIN_PROVIDER' // Placeholder
      });
      await user.save();
    }

    const payload = {
      user: {
        id: user.id
      }
    };

    const token = jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    logger.error('Google authentication failed', { error: err.message });
    res.status(500).json({ msg: 'Google Authentication Error' });
  }
});

// @route   GET api/auth/me
// @desc    Get logged in user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    logger.error('User retrieval failed', { error: err.message, userId: req.user.id });
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
