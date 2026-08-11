/**
 * Convert a Joi schema to JSON Schema, for OpenAPI documentation.
 *
 * Deriving the spec from the same objects the routes validate with is the point:
 * a hand-written spec drifts the moment a field is added, and nobody notices
 * until someone builds against it.
 *
 * Deliberately narrow -- it covers the constructs this codebase actually uses
 * and throws on anything else, so an unsupported construct fails loudly at
 * startup rather than being silently omitted from the documentation. A general
 * converter is a dependency; this is 80 lines and always correct for what it
 * claims to handle.
 */
export function joiToJsonSchema(joiSchema) {
  return convert(joiSchema.describe());
}

function convert(described) {
  switch (described.type) {
    case 'object':
      return convertObject(described);
    case 'array':
      return convertArray(described);
    case 'string':
      return convertString(described);
    case 'number':
      return withMeta(described, { type: 'number' });
    case 'boolean':
      return withMeta(described, { type: 'boolean' });
    default:
      throw new Error(`joiToJsonSchema: unsupported Joi type "${described.type}"`);
  }
}

function convertObject(described) {
  const properties = {};
  const required = [];

  for (const [key, child] of Object.entries(described.keys || {})) {
    properties[key] = convert(child);
    if (child.flags?.presence === 'required') required.push(key);
  }

  const schema = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  // Joi's default is to strip unknown keys, not accept them.
  schema.additionalProperties = false;

  return withMeta(described, schema);
}

function convertArray(described) {
  const schema = { type: 'array' };

  // Joi allows several item schemas; this codebase only ever uses one.
  const [items] = described.items || [];
  if (items) schema.items = convert(items);

  for (const rule of described.rules || []) {
    if (rule.name === 'max') schema.maxItems = rule.args.limit;
    if (rule.name === 'min') schema.minItems = rule.args.limit;
  }

  return withMeta(described, schema);
}

function convertString(described) {
  const schema = { type: 'string' };

  for (const rule of described.rules || []) {
    switch (rule.name) {
      case 'min': schema.minLength = rule.args.limit; break;
      case 'max': schema.maxLength = rule.args.limit; break;
      case 'email': schema.format = 'email'; break;
      case 'uri': schema.format = 'uri'; break;
      // Documented as a description rather than a pattern: the intent is
      // "letters and digits", and spelling that as a regex in the spec invites
      // clients to enforce a subtly different one.
      case 'alphanum': schema.description = appendNote(schema.description, 'Letters and digits only.'); break;
      default:
        throw new Error(`joiToJsonSchema: unsupported string rule "${rule.name}"`);
    }
  }

  if (described.allow) {
    // Joi's .valid() marks the schema "only"; .allow() merely permits extras.
    if (described.flags?.only) schema.enum = described.allow;
    else if (described.allow.includes('')) schema.minLength = 0;
  }

  return withMeta(described, schema);
}

function withMeta(described, schema) {
  if (described.flags?.default !== undefined) schema.default = described.flags.default;
  return schema;
}

function appendNote(existing, note) {
  return existing ? `${existing} ${note}` : note;
}
