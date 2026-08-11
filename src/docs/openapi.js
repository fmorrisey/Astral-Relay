import { schemas } from '../utils/validators.js';
import { joiToJsonSchema } from '../utils/joiToJsonSchema.js';

// Request bodies come from the Joi objects the routes actually validate with,
// so a change to validation changes the documentation. Everything else -- paths,
// responses, prose -- is declared here.
//
// @fastify/swagger is used in static mode rather than reading route schemas.
// Attaching `schema` to a route makes Fastify validate it, which would mean two
// validators disagreeing on the same request. Validation stays with Joi; this
// file only describes.
//
// The risk of a static document is a route that nobody documents. That is
// covered by a test asserting every registered route appears here, so adding a
// route without documenting it fails the build.

const body = name => ({
  required: true,
  content: { 'application/json': { schema: joiToJsonSchema(schemas[name]) } }
});

const json = (description, example) => ({
  description,
  ...(example ? { content: { 'application/json': { example } } } : {})
});

const ERRORS = {
  400: json('Validation failed', { error: 'Validation failed: ...', statusCode: 400 }),
  401: json('Not authenticated, or credentials rejected', { error: 'Not authenticated' }),
  403: json('Authenticated but not permitted', { error: 'Insufficient permissions' }),
  404: json('Not found', { error: 'Not found' }),
  409: json('Conflict with existing state', { error: 'Already exists' }),
  429: json('Rate limit exceeded')
};

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' }
};

export function buildOpenApiDocument({ version }) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Astral Relay',
      version,
      description:
        'Self-hosted publishing API for Astro sites.\n\n' +
        'Authentication is a `session` cookie set by `POST /api/auth/login`. ' +
        'Every route below requires it unless marked otherwise.\n\n' +
        'Roles: `admin` can do everything including managing users; `author` can ' +
        'read everything but only modify content they created.'
    },
    tags: [
      { name: 'auth', description: 'Sessions, passwords, and recovery' },
      { name: 'posts', description: 'Content, publishing, and version history' },
      { name: 'media', description: 'Image upload and management' },
      { name: 'tags', description: 'Tag vocabulary' },
      { name: 'users', description: 'Account management (admin only)' },
      { name: 'system', description: 'Health and setup' }
    ],
    components: {
      securitySchemes: {
        // Documented as apiKey-in-cookie, which is how OpenAPI 3.0 expresses a
        // session cookie. It is httpOnly, so a browser sends it automatically
        // and the "try it" button works without pasting anything.
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'session' }
      }
    },
    security: [{ cookieAuth: [] }],
    paths: {
      '/api/health': {
        get: {
          tags: ['system'],
          summary: 'Liveness and workspace status',
          security: [],
          responses: {
            200: json('Service status', {
              status: 'healthy', database: 'connected', workspace: 'mounted', uptime: 123
            })
          }
        }
      },
      '/api/openapi.json': {
        get: {
          tags: ['system'],
          summary: 'This document',
          description: 'Served only when API_DOCS is enabled. The browsable UI is at /docs.',
          security: [],
          responses: { 200: json('OpenAPI 3 document') }
        }
      },
      '/api/setup/status': {
        get: {
          tags: ['system'],
          summary: 'Whether first-time setup is complete',
          description: 'Public: the frontend calls this before any account exists.',
          security: [],
          responses: { 200: json('Setup state', { setupComplete: true, version: '1.0.0' }) }
        }
      },
      '/api/setup/collections': {
        get: {
          tags: ['system'],
          summary: 'Configured Astro content collections',
          responses: { 200: json('Collections', { collections: ['blog'] }), 401: ERRORS[401] }
        }
      },
      '/api/setup/validate': {
        post: {
          tags: ['system'],
          summary: 'Check a path looks like an Astro site',
          requestBody: {
            required: false,
            content: { 'application/json': { schema: {
              type: 'object',
              properties: { workspacePath: { type: 'string' } }
            } } }
          },
          responses: { 200: json('Valid workspace'), 400: json('Invalid workspace'), 401: ERRORS[401] }
        }
      },

      '/api/auth/login': {
        post: {
          tags: ['auth'],
          summary: 'Sign in and receive a session cookie',
          security: [],
          requestBody: body('login'),
          responses: {
            200: json('Signed in', { success: true, user: { id: 1, username: 'you', role: 'admin' } }),
            400: ERRORS[400], 401: ERRORS[401]
          }
        }
      },
      '/api/auth/logout': {
        post: { tags: ['auth'], summary: 'Destroy the current session', responses: { 200: json('Signed out') } }
      },
      '/api/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'The signed-in user',
          responses: { 200: json('Current user', { user: { id: 1, username: 'you', role: 'admin' } }), 401: ERRORS[401] }
        }
      },
      '/api/auth/change-password': {
        post: {
          tags: ['auth'],
          summary: 'Change your own password',
          description: 'Signs out every other session; the calling session survives.',
          requestBody: body('changePassword'),
          responses: {
            200: json('Changed', { success: true, sessionsRevoked: 2 }),
            400: ERRORS[400], 401: ERRORS[401], 429: ERRORS[429]
          }
        }
      },
      '/api/auth/recovery-code': {
        post: {
          tags: ['auth'],
          summary: 'Issue a recovery code',
          description:
            'Returned once and stored only as a hash, so it cannot be shown again. ' +
            'Issuing a new code invalidates the previous one.',
          responses: {
            200: json('New code', { success: true, recoveryCode: 'RELAY-XXXX-XXXX-XXXX' }),
            401: ERRORS[401]
          }
        }
      },
      '/api/auth/recover': {
        post: {
          tags: ['auth'],
          summary: 'Redeem a recovery code to set a new password',
          description:
            'Single use. Signs out every existing session and does not sign you in — ' +
            'log in with the new password afterwards.',
          security: [],
          requestBody: body('recover'),
          responses: {
            200: json('Password reset', { success: true }),
            400: ERRORS[400], 401: ERRORS[401], 429: ERRORS[429]
          }
        }
      },
      '/api/auth/setup': {
        post: {
          tags: ['auth'],
          summary: 'Create the first account',
          description: 'Refused once setup is complete.',
          security: [],
          requestBody: body('setup'),
          responses: {
            200: json('Created', { success: true, recoveryCode: 'RELAY-XXXX-XXXX-XXXX' }),
            400: ERRORS[400], 403: json('Setup already completed')
          }
        }
      },

      '/api/posts': {
        get: {
          tags: ['posts'],
          summary: 'List posts',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published', 'archived'] } },
            { name: 'collection', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'sort', in: 'query', schema: { type: 'string' } },
            { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } }
          ],
          responses: { 200: json('Posts'), 401: ERRORS[401] }
        },
        post: {
          tags: ['posts'],
          summary: 'Create a draft',
          requestBody: body('createPost'),
          responses: { 201: json('Created'), 400: ERRORS[400], 401: ERRORS[401] }
        }
      },
      '/api/posts/{id}': {
        get: { tags: ['posts'], summary: 'Get a post', parameters: [idParam], responses: { 200: json('Post'), 401: ERRORS[401], 404: ERRORS[404] } },
        put: {
          tags: ['posts'],
          summary: 'Update a post',
          description: 'Authors may only update their own posts.',
          parameters: [idParam],
          requestBody: body('updatePost'),
          responses: { 200: json('Updated'), 400: ERRORS[400], 401: ERRORS[401], 403: ERRORS[403], 404: ERRORS[404] }
        },
        delete: {
          tags: ['posts'],
          summary: 'Delete a post and its exported file',
          description: 'Authors may only delete their own posts.',
          parameters: [idParam],
          responses: { 200: json('Deleted'), 401: ERRORS[401], 403: ERRORS[403], 404: ERRORS[404] }
        }
      },
      '/api/posts/{id}/publish': {
        post: {
          tags: ['posts'],
          summary: 'Publish, exporting markdown to the Astro site',
          description:
            'Exports before committing the status change, so a failed export leaves the post ' +
            'unpublished. Frontmatter keys the CMS does not model are preserved. ' +
            'Authors may only publish their own posts.',
          parameters: [idParam],
          requestBody: {
            required: false,
            content: { 'application/json': { schema: {
              type: 'object',
              properties: { publishedAt: { type: 'string', format: 'date-time' } }
            } } }
          },
          responses: { 200: json('Published'), 401: ERRORS[401], 403: ERRORS[403], 404: ERRORS[404] }
        }
      },
      '/api/posts/{id}/unpublish': {
        post: {
          tags: ['posts'],
          summary: 'Unpublish and remove the exported file',
          parameters: [idParam],
          responses: { 200: json('Unpublished'), 401: ERRORS[401], 403: ERRORS[403], 404: ERRORS[404] }
        }
      },
      '/api/posts/{id}/versions': {
        get: { tags: ['posts'], summary: 'Version history', parameters: [idParam], responses: { 200: json('Versions'), 401: ERRORS[401], 404: ERRORS[404] } }
      },

      '/api/media': {
        get: { tags: ['media'], summary: 'List media', responses: { 200: json('Media'), 401: ERRORS[401] } }
      },
      '/api/media/upload': {
        post: {
          tags: ['media'],
          summary: 'Upload an image',
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                alt: { type: 'string' }
              },
              required: ['file']
            } } }
          },
          responses: { 201: json('Uploaded'), 400: ERRORS[400], 401: ERRORS[401], 429: ERRORS[429] }
        }
      },
      '/api/media/{id}': {
        get: { tags: ['media'], summary: 'Get one media item', parameters: [idParam], responses: { 200: json('Media'), 401: ERRORS[401], 404: ERRORS[404] } },
        delete: {
          tags: ['media'],
          summary: 'Delete a media file',
          description: 'Authors may only delete their own media.',
          parameters: [idParam],
          responses: { 200: json('Deleted'), 401: ERRORS[401], 403: ERRORS[403], 404: ERRORS[404] }
        }
      },

      '/api/tags': {
        get: { tags: ['tags'], summary: 'List tags with post counts', responses: { 200: json('Tags', { tags: [{ id: 1, name: 'Travel', slug: 'travel', postCount: 3 }] }), 401: ERRORS[401] } },
        post: { tags: ['tags'], summary: 'Create a tag', requestBody: body('createTag'), responses: { 201: json('Created'), 400: ERRORS[400], 401: ERRORS[401], 409: ERRORS[409] } }
      },
      '/api/tags/{id}': {
        delete: {
          tags: ['tags'],
          summary: 'Delete a tag (admin only)',
          description: 'Removes the tag from every post that used it, which is why it is admin only.',
          parameters: [idParam],
          responses: { 200: json('Deleted'), 401: ERRORS[401], 403: ERRORS[403], 404: ERRORS[404] }
        }
      },

      '/api/users': {
        get: { tags: ['users'], summary: 'List users (admin only)', responses: { 200: json('Users'), 401: ERRORS[401], 403: ERRORS[403] } },
        post: { tags: ['users'], summary: 'Create a user (admin only)', requestBody: body('createUser'), responses: { 201: json('Created'), 400: ERRORS[400], 401: ERRORS[401], 403: ERRORS[403], 409: ERRORS[409] } }
      },
      '/api/users/{id}': {
        delete: {
          tags: ['users'],
          summary: 'Delete a user (admin only)',
          description: 'Refused for yourself, the last admin, or anyone who still owns posts or media.',
          parameters: [idParam],
          responses: { 200: json('Deleted'), 400: json('Refused'), 401: ERRORS[401], 403: ERRORS[403], 404: ERRORS[404], 409: ERRORS[409] }
        }
      }
    }
  };
}
