/**
 * Async Error Handler Wrapper
 *
 * Wraps async route handlers to automatically catch errors and pass them
 * to Express's error handling middleware. This prevents unhandled promise
 * rejections from crashing the server.
 *
 * Usage:
 *   router.post('/notes', asyncHandler(async (req, res) => {
 *     const note = await Note.findById(req.params.id);
 *     res.json(note);
 *   }));
 *
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped Express middleware
 */
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
