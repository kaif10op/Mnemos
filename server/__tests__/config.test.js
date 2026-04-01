/**
 * Configuration Constants Tests
 */

const config = require('../config/constants');

describe('Configuration Constants', () => {
  describe('API Configuration', () => {
    it('should have valid API settings', () => {
      expect(config.API).toBeDefined();
      expect(config.API.ENVIRONMENT).toBeDefined();
      expect(config.API.IS_PRODUCTION).toEqual(false);
      expect(Array.isArray(config.API.ALLOWED_ORIGINS)).toBe(true);
    });

    it('should include required origins', () => {
      const origins = config.API.ALLOWED_ORIGINS;
      expect(origins).toContain('http://localhost:3000');
      expect(origins).toContain('https://mnemos-sigma.vercel.app');
    });
  });

  describe('AUTH Configuration', () => {
    it('should have valid auth settings', () => {
      expect(config.AUTH).toBeDefined();
      expect(config.AUTH.JWT_EXPIRY).toBe('7d');
      expect(config.AUTH.BCRYPT_ROUNDS).toBe(10);
    });

    it('should have rate limiting configured', () => {
      expect(config.AUTH.RATE_LIMIT).toBeDefined();
      expect(config.AUTH.RATE_LIMIT.MAX_REQUESTS).toBe(5);
      expect(config.AUTH.RATE_LIMIT.WINDOW_MS).toBeGreaterThan(0);
    });
  });

  describe('DATABASE Configuration', () => {
    it('should have connection pooling params', () => {
      expect(config.DATABASE).toBeDefined();
      expect(config.DATABASE.MAX_POOL_SIZE_SERVERLESS).toBeLessThan(
        config.DATABASE.MAX_POOL_SIZE_TRADITIONAL
      );
      expect(config.DATABASE.SERVER_SELECTION_TIMEOUT_MS).toBe(5000);
    });
  });

  describe('RATE_LIMITS Configuration', () => {
    it('should have all endpoint limits configured', () => {
      expect(config.RATE_LIMITS.AUTH).toBeDefined();
      expect(config.RATE_LIMITS.SYNC).toBeDefined();
      expect(config.RATE_LIMITS.SHARE).toBeDefined();
      expect(config.RATE_LIMITS.AI).toBeDefined();
    });

    it('should have reasonable rate limits', () => {
      expect(config.RATE_LIMITS.AUTH.max).toBeLessThanOrEqual(config.RATE_LIMITS.SYNC.max);
      expect(config.RATE_LIMITS.AI.max).toBeGreaterThan(0);
    });
  });

  describe('VALIDATION Configuration', () => {
    it('should have reasonable validation limits', () => {
      expect(config.VALIDATION.PASSWORD_MIN_LENGTH).toBe(8);
      expect(config.VALIDATION.PASSWORD_MAX_LENGTH).toBeGreaterThan(config.VALIDATION.PASSWORD_MIN_LENGTH);
      expect(config.VALIDATION.CONTENT_MAX_LENGTH).toBeGreaterThan(config.VALIDATION.TITLE_MAX_LENGTH);
    });
  });
});
