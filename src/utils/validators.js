import Joi from 'joi';

export const schemas = {
  createPost: Joi.object({
    collection: Joi.string().alphanum().min(2).max(30).required(),
    title: Joi.string().min(1).max(200).required(),
    body: Joi.string().required(),
    summary: Joi.string().max(500).allow('').optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
  }),

  updatePost: Joi.object({
    title: Joi.string().min(1).max(200).optional(),
    body: Joi.string().optional(),
    summary: Joi.string().max(500).allow('').optional(),
    slug: Joi.string().max(200).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
  }),

  login: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required()
  }),

  setup: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
    displayName: Joi.string().max(100).optional(),
    workspacePath: Joi.string().optional(),
    collections: Joi.array().items(Joi.string().alphanum().max(30)).optional(),
    webhook: Joi.object({
      enabled: Joi.boolean().optional(),
      url: Joi.string().uri().allow('').optional()
    }).optional()
  }),

  createTag: Joi.object({
    name: Joi.string().min(1).max(50).required()
  }),

  createUser: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
    displayName: Joi.string().max(100).optional(),
    email: Joi.string().email().optional(),
    // Explicit and constrained: an unrecognised role would be rejected by
    // authorize() at every route, creating an account that can do nothing.
    role: Joi.string().valid('admin', 'author').default('author')
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required()
  }),

  recover: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    // Format is RELAY-XXXX-XXXX-XXXX. Not pattern-matched here: a rejection
    // shaped differently from "wrong code" would tell an attacker when they had
    // the format right, and the check costs nothing at redemption time.
    recoveryCode: Joi.string().max(64).required(),
    newPassword: Joi.string().min(8).required()
  })
};

export function validate(schema, data) {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    const err = new Error(`Validation failed: ${error.details.map(d => d.message).join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return value;
}
