import { randomUUID } from 'crypto';

/**
 * Create a test user
 */
export function createTestUser(db, overrides = {}) {
  const username = overrides.username || 'testuser';
  const passwordHash = overrides.passwordHash || '$argon2id$v=19$m=65536,t=3,p=4$test$testhash'; // Dummy hash
  const displayName = overrides.displayName || 'Test User';
  const email = overrides.email || 'test@example.com';

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, display_name, email)
    VALUES (?, ?, ?, ?)
  `).run(username, passwordHash, displayName, email);

  return {
    id: result.lastInsertRowid,
    username,
    displayName,
    email
  };
}

/**
 * Create a test session
 */
export function createTestSession(db, userId) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionId, userId, expiresAt);

  return sessionId;
}

/**
 * Create a test post
 */
export function createTestPost(db, userId, overrides = {}) {
  const postId = overrides.id || randomUUID();
  const collection = overrides.collection || 'blog';
  const slug = overrides.slug || 'test-post';
  const title = overrides.title || 'Test Post';
  const body = overrides.body || 'This is a test post body';
  const summary = overrides.summary || 'Test summary';
  const status = overrides.status || 'draft';
  const publishedAt = overrides.publishedAt || null;

  db.prepare(`
    INSERT INTO posts (id, collection, slug, title, body, summary, status, created_by, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(postId, collection, slug, title, body, summary, status, userId, publishedAt);

  // Create initial version like the real Post.create() does
  db.prepare(`
    INSERT INTO post_versions (post_id, title, body, summary, version_number, created_by)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(postId, title, body, summary, userId);

  return {
    id: postId,
    collection,
    slug,
    title,
    body,
    summary,
    status,
    created_by: userId,
    published_at: publishedAt
  };
}

/**
 * Create a test tag
 */
export function createTestTag(db, overrides = {}) {
  const name = overrides.name || 'test-tag';
  const slug = overrides.slug || 'test-tag';

  const result = db.prepare(`
    INSERT INTO tags (name, slug)
    VALUES (?, ?)
  `).run(name, slug);

  return {
    id: result.lastInsertRowid,
    name,
    slug
  };
}

/**
 * Associate a tag with a post
 */
export function addTagToPost(db, postId, tagId) {
  db.prepare(`
    INSERT INTO post_tags (post_id, tag_id)
    VALUES (?, ?)
  `).run(postId, tagId);
}
