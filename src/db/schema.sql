-- ============================================
-- Core Content Tables
-- ============================================

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  summary TEXT,

  status TEXT NOT NULL DEFAULT 'draft',

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,

  created_by INTEGER NOT NULL REFERENCES users(id),

  UNIQUE(collection, slug)
);

CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_collection ON posts(collection);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

CREATE TABLE post_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  body TEXT NOT NULL,
  summary TEXT,

  version_number INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER NOT NULL REFERENCES users(id),

  UNIQUE(post_id, version_number)
);

CREATE INDEX idx_versions_post ON post_versions(post_id, version_number DESC);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tags_name ON tags(name);

CREATE TABLE post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (post_id, tag_id)
);

-- ============================================
-- Media Management
-- ============================================

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  storage_path TEXT NOT NULL,
  alt_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_media_created ON media(created_at DESC);
CREATE INDEX idx_media_mime ON media(mime_type);

CREATE TABLE post_media (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,

  PRIMARY KEY (post_id, media_id)
);

-- ============================================
-- User Management
-- ============================================

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE INDEX idx_users_username ON users(username);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ============================================
-- System Tables
-- ============================================

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_resource ON activity_log(resource_type, resource_id);
