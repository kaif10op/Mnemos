/**
 * Validation Utility Tests
 */

const { validate, schemas } = require('../utils/validation');

describe('Validation Schemas', () => {
  describe('Register Schema', () => {
    it('should validate correct registration data', () => {
      const data = {
        email: 'test@example.com',
        password: 'SecurePass123'
      };
      const { error } = schemas.register.validate(data);
      expect(error).toBeUndefined();
    });

    it('should reject invalid email', () => {
      const data = {
        email: 'not-an-email',
        password: 'SecurePass123'
      };
      const { error } = schemas.register.validate(data);
      expect(error).toBeDefined();
    });

    it('should reject weak password', () => {
      const data = {
        email: 'test@example.com',
        password: 'weak'
      };
      const { error } = schemas.register.validate(data);
      expect(error).toBeDefined();
    });

    it('should reject password without uppercase', () => {
      const data = {
        email: 'test@example.com',
        password: 'lowercase123'
      };
      const { error } = schemas.register.validate(data);
      expect(error).toBeDefined();
    });
  });

  describe('Sync Data Schema', () => {
    it('should validate correct sync data', () => {
      const data = {
        notes: [
          {
            id: 'note1',
            title: 'Test Note',
            content: 'Content',
            folderId: null,
            tags: ['tag1'],
            pinned: false,
            updatedAt: new Date()
          }
        ],
        folders: [
          {
            id: 'folder1',
            name: 'Test Folder',
            icon: 'folder'
          }
        ]
      };
      const { error } = schemas.syncData.validate(data);
      expect(error).toBeUndefined();
    });

    it('should reject oversized content', () => {
      const data = {
        notes: [
          {
            id: 'note1',
            title: 'Test',
            content: 'a'.repeat(60000),
            folderId: null,
            tags: [],
            pinned: false,
            updatedAt: new Date()
          }
        ]
      };
      const { error } = schemas.syncData.validate(data);
      expect(error).toBeDefined();
    });
  });

  describe('Share Note Schema', () => {
    it('should validate correct share data', () => {
      const data = {
        title: 'Shared Note',
        content: 'Share content',
        tags: ['public']
      };
      const { error } = schemas.shareNote.validate(data);
      expect(error).toBeUndefined();
    });

    it('should allow empty optional fields', () => {
      const data = {};
      const { error } = schemas.shareNote.validate(data);
      expect(error).toBeUndefined();
    });
  });
});

describe('Validation Middleware', () => {
  it('should strip unknown fields', () => {
    const req = { body: { email: 'test@example.com', password: 'SecurePass123', unknown: 'field' } };
    const res = {};
    const next = jest.fn();

    const middleware = validate('register');
    middleware(req, res, next);

    expect(req.body.unknown).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should return error for invalid data', () => {
    const req = { body: { email: 'invalid', password: 'weak' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    const middleware = validate('register');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
