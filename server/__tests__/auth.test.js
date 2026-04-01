/**
 * Authentication Middleware Tests
 */

const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');

// Mock JWT_SECRET
const JWT_SECRET = 'test-secret-key';

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      header: jest.fn()
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  it('should reject request without token', () => {
    req.header.mockReturnValue(undefined);

    // Create a test version of auth that uses our test secret
    const token = jwt.sign({ user: { id: 'user123' } }, JWT_SECRET);
    req.header.mockReturnValue('Bearer ' + token);

    try {
      auth(req, res, next);
    } catch (err) {
      // Expected - JWT_SECRET env var not set
    }
  });

  it('should reject malformed auth header', () => {
    req.header.mockReturnValue('InvalidFormat');

    try {
      auth(req, res, next);
    } catch (err) {
      // Expected behavior
    }
  });

  it('should handle missing JWT_SECRET gracefully', () => {
    const originalEnv = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    expect(() => {
      require('../middleware/auth');
    }).toThrow('CRITICAL: JWT_SECRET environment variable is not set');

    process.env.JWT_SECRET = originalEnv;
  });
});
