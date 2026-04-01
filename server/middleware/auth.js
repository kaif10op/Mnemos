const jwt = require('jsonwebtoken');

// Ensure JWT_SECRET is configured (fail fast on startup)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is not set. This is required for production.');
}

module.exports = function (req, res, next) {
  // Get token from header
  const token = req.header('Authorization')?.split(' ')[1];

  // Check if not token
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
