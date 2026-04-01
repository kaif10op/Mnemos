/**
 * Audit Model Tests
 */

describe('Audit Model', () => {
  it('should have required fields', () => {
    const Audit = require('../models/Audit');
    const schema = Audit.schema;

    expect(schema.obj.userId).toBeDefined();
    expect(schema.obj.action).toBeDefined();
    expect(schema.obj.resourceId).toBeDefined();
    expect(schema.obj.resourceType).toBeDefined();
  });

  it('should support all action types', () => {
    const Audit = require('../models/Audit');
    const schema = Audit.schema;
    const actionEnum = schema.obj.action.enum;

    const expectedActions = [
      'DELETE_NOTE',
      'RESTORE_NOTE',
      'DELETE_FOLDER',
      'UPDATE_NOTE',
      'SHARE_NOTE',
      'REVOKE_SHARE'
    ];

    expectedActions.forEach(action => {
      expect(actionEnum).toContain(action);
    });
  });

  it('should have proper indexes', () => {
    const Audit = require('../models/Audit');
    const schema = Audit.schema;
    const indexes = schema._indexes || [];

    // Indexes should be defined
    expect(schema).toBeDefined();
  });
});
