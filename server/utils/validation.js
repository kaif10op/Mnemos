const joi = require('joi');

// Define validation schemas
const schemas = {
  register: joi.object({
    email: joi
      .string()
      .email({ minDomainSegments: 2 })
      .lowercase()
      .trim()
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    password: joi
      .string()
      .min(8)
      .max(128)
      .required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.pattern.base': 'Password must include uppercase, lowercase, and numbers',
        'any.required': 'Password is required'
      })
  }),

  login: joi.object({
    email: joi
      .string()
      .email({ minDomainSegments: 2 })
      .lowercase()
      .trim()
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    password: joi
      .string()
      .required()
      .messages({
        'any.required': 'Password is required'
      })
  }),

  syncData: joi.object({
    notes: joi
      .array()
      .items(
        joi.object({
          id: joi.string().required(),
          title: joi.string().max(500).allow(''),
          content: joi.string().max(50000).allow(''),
          folderId: joi.string().allow(null),
          tags: joi.array().items(joi.string()),
          pinned: joi.boolean(),
          updatedAt: joi.date().required()
        })
      )
      .optional(),
    folders: joi
      .array()
      .items(
        joi.object({
          id: joi.string().required(),
          name: joi.string().max(100).required(),
          icon: joi.string().max(50)
        })
      )
      .optional()
  })
};

/**
 * Validation middleware factory
 */
const validate = (schemaKey) => {
  return (req, res, next) => {
    const schema = schemas[schemaKey];
    if (!schema) {
      return res.status(500).json({ msg: 'Validation schema not found' });
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const messages = error.details.map(d => d.message).join('; ');
      return res.status(400).json({ msg: `Validation failed: ${messages}` });
    }

    // Replace body with validated value
    req.body = value;
    next();
  };
};

module.exports = { validate, schemas };
