const NodeCache = require('node-cache');

// Create an in-memory cache instance (simulating Redis behavior)
// stdTTL is in seconds (3600 = 1 hour)
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

console.log('Using in-memory caching (node-cache) as a Redis alternative.');

module.exports = myCache;
