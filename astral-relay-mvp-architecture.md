# Astral Relay — MVP v1 Architecture Plan (SQLite-First)

**Version:** 1.0  
**Date:** February 11, 2026  
**Purpose:** Complete technical specification for implementation
**Author:** Forrest Morrisey

---

## Executive Summary

Astral Relay is a self-hosted, mobile-friendly publishing system for Astro sites. This MVP uses **SQLite as the source of truth** and exports content to Astro's filesystem format. Git integration is optional and non-blocking.

**Core Philosophy:**
> Write → Save → Publish → Export to files → Done

**Technical Stack:**
- Backend: Node.js + Fastify
- Database: SQLite (better-sqlite3)
- Frontend: Preact + HTM (no build step)
- Deployment: Docker + Docker Compose
- Storage: SQLite for content, filesystem for media

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                  User (Mobile/Desktop)              │
└─────────────────────┬───────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────┐
│            Astral Relay Container                    │
│                                                      │
│  ┌──────────────┐          ┌──────────────────┐    │
│  │   Fastify    │◄────────►│   SQLite DB      │    │
│  │   API Server │          │   (relay.db)     │    │
│  └──────┬───────┘          └──────────────────┘    │
│         │                                            │
│         │                  ┌──────────────────┐    │
│         └─────────────────►│ Astro Exporter   │    │
│                            └────────┬─────────┘    │
│                                     │               │
│  ┌──────────────┐                  │               │
│  │  Static UI   │                  ▼               │
│  │  (Preact PWA)│          /workspace/src/content/ │
│  └──────────────┘          /workspace/public/media/│
└─────────────────────────────────────┬───────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌───────────┐     ┌──────────┐    ┌──────────────┐
            │   Astro   │     │  Webhook │    │ Git (optional)│
            │   Build   │     │  Trigger │    │   Commit      │
            └───────────┘     └──────────┘    └──────────────┘
```

### 1.2 Data Flow: Publish Lifecycle

```
1. User writes draft
   ├─ Autosave to SQLite every 3 seconds
   └─ Status: 'draft'

2. User clicks "Publish"
   ├─ Update SQLite: status = 'published'
   ├─ Create version snapshot
   └─ Trigger export

3. Astro Exporter runs
   ├─ Generate markdown with frontmatter
   ├─ Write to /workspace/src/content/{collection}/{slug}.md
   └─ Copy media files to /workspace/public/media/

4. Optional: Trigger webhook (non-blocking)
   └─ POST to configured URL

5. Optional: Git commit (non-blocking, background)
   ├─ git add src/content/
   ├─ git commit -m "publish: {title}"
   └─ git push origin main

6. Return success to user (within 200ms)
```

---

## 2. Database Schema

### 2.1 SQLite Schema (Complete)

```sql
-- ============================================
-- Core Content Tables
-- ============================================

-- Main posts table
CREATE TABLE posts (
  id TEXT PRIMARY KEY,              -- UUID v4
  collection TEXT NOT NULL,          -- 'blog', 'photos', 'adventures', etc.
  slug TEXT NOT NULL,                -- URL-safe identifier
  title TEXT NOT NULL,
  body TEXT NOT NULL,                -- Markdown content
  summary TEXT,                      -- Optional excerpt
  
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'archived'
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,                 -- ISO 8601 datetime
  
  created_by INTEGER NOT NULL REFERENCES users(id),
  
  UNIQUE(collection, slug)
);

CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_collection ON posts(collection);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- Version history (immutable log)
CREATE TABLE post_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  summary TEXT,
  
  version_number INTEGER NOT NULL,   -- Incremental per post
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  
  UNIQUE(post_id, version_number)
);

CREATE INDEX idx_versions_post ON post_versions(post_id, version_number DESC);

-- Tags
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,         -- URL-safe version
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tags_name ON tags(name);

-- Post-Tag relationship
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
  id TEXT PRIMARY KEY,               -- UUID v4
  
  filename TEXT NOT NULL,            -- Stored filename (uuid.ext)
  original_filename TEXT NOT NULL,   -- User's original filename
  
  mime_type TEXT NOT NULL,           -- image/jpeg, image/png, etc.
  size_bytes INTEGER NOT NULL,
  
  width INTEGER,                     -- For images only
  height INTEGER,
  
  storage_path TEXT NOT NULL,        -- Relative: media/2026/02/uuid.jpg
  alt_text TEXT,                     -- Accessibility
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_media_created ON media(created_at DESC);
CREATE INDEX idx_media_mime ON media(mime_type);

-- Link media to posts (for cleanup and tracking)
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
  password_hash TEXT NOT NULL,       -- Argon2id
  display_name TEXT,
  email TEXT,                        -- For password recovery
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE INDEX idx_users_username ON users(username);

-- Session management
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- Random 32-byte hex token
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  expires_at TEXT NOT NULL,          -- ISO 8601 datetime
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

-- Configuration (key-value store)
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Database migrations tracking
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activity log (audit trail)
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,              -- 'post.create', 'post.publish', etc.
  resource_type TEXT NOT NULL,       -- 'post', 'media', 'user'
  resource_id TEXT,
  metadata TEXT,                     -- JSON blob
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_resource ON activity_log(resource_type, resource_id);
```

### 2.2 Initial Data (Seed)

```sql
-- Default configuration
INSERT INTO config (key, value) VALUES
  ('version', '1.0.0'),
  ('setup_complete', 'false'),
  ('workspace_path', '/workspace'),
  ('collections', '["blog","photos","adventures","portfolio"]'),
  ('webhook_enabled', 'false'),
  ('webhook_url', ''),
  ('git_sync_enabled', 'false'),
  ('git_branch', 'main');

-- Initial migration marker
INSERT INTO migrations (name) VALUES ('001_initial_schema');
```

---

## 3. File System Structure

### 3.1 Project Directory Layout

```
astral-relay/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .dockerignore
├── .gitignore
├── README.md
│
├── src/
│   ├── server.js              # Main entry point
│   ├── config.js              # Configuration loader
│   │
│   ├── db/
│   │   ├── index.js           # Database connection & utils
│   │   ├── schema.sql         # Schema definition
│   │   ├── migrations.js      # Migration runner
│   │   └── seed.sql           # Initial data
│   │
│   ├── models/
│   │   ├── Post.js            # Post CRUD operations
│   │   ├── Media.js           # Media management
│   │   ├── User.js            # User operations
│   │   ├── Tag.js             # Tag management
│   │   └── Session.js         # Session handling
│   │
│   ├── services/
│   │   ├── auth.js            # Authentication logic
│   │   ├── storage.js         # File storage abstraction
│   │   └── exporter.js        # Export orchestration
│   │
│   ├── exporters/
│   │   ├── AstroExporter.js   # Astro format export
│   │   └── GitExporter.js     # Optional Git sync
│   │
│   ├── routes/
│   │   ├── auth.js            # Login/logout endpoints
│   │   ├── posts.js           # Post CRUD API
│   │   ├── media.js           # Upload/manage media
│   │   ├── tags.js            # Tag management
│   │   ├── setup.js           # Initial setup wizard
│   │   └── health.js          # Health check
│   │
│   ├── middleware/
│   │   ├── authenticate.js    # Session validation
│   │   ├── rateLimit.js       # Rate limiting
│   │   ├── errorHandler.js    # Global error handler
│   │   └── logging.js         # Request logging
│   │
│   └── utils/
│       ├── slugify.js         # Slug generation
│       ├── validators.js      # Input validation
│       ├── imageProcessor.js  # Sharp wrapper
│       └── logger.js          # Pino logger setup
│
├── public/
│   ├── index.html             # SPA shell
│   ├── app.js                 # Preact application
│   ├── styles.css             # Mobile-first CSS
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service worker (optional)
│
├── data/
│   └── relay.db               # SQLite database (volume mount)
│
└── workspace/                 # Mounted Astro repo (volume)
    ├── src/
    │   └── content/
    │       ├── blog/
    │       ├── photos/
    │       └── config.ts
    └── public/
        └── media/             # Exported media files
```

### 3.2 Docker Volume Mounts

```yaml
volumes:
  # Persistent database
  - ./data:/app/data
  
  # User's Astro repository
  - /path/to/user/astro-site:/workspace
```

---

## 4. API Specification

### 4.1 Authentication Endpoints

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/setup        # First-time setup only
```

#### POST /api/auth/login

**Request:**
```json
{
  "username": "admin",
  "password": "secure-password"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin",
    "displayName": "Admin User"
  }
}
```

**Response (401):**
```json
{
  "error": "Invalid credentials"
}
```

**Headers:** Sets `session` cookie (httpOnly, secure, sameSite: strict)

---

#### POST /api/auth/logout

**Response (200):**
```json
{
  "success": true
}
```

**Effect:** Deletes session from database, clears cookie

---

#### GET /api/auth/me

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "displayName": "Admin User",
    "email": "admin@example.com"
  }
}
```

**Response (401):**
```json
{
  "error": "Not authenticated"
}
```

---

#### POST /api/auth/setup

**Purpose:** First-time setup wizard

**Request:**
```json
{
  "username": "admin",
  "password": "new-password",
  "displayName": "Site Admin",
  "workspacePath": "/workspace",
  "collections": ["blog", "photos"],
  "webhook": {
    "enabled": false,
    "url": ""
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "recoveryCode": "RELAY-XXXX-XXXX-XXXX"
}
```

**Behavior:**
- Only works if `setup_complete = false`
- Creates admin user
- Validates workspace path exists
- Checks for `astro.config.*` and `package.json`
- Saves configuration
- Sets `setup_complete = true`

---

### 4.2 Post Endpoints

```
GET    /api/posts              # List posts (with filters)
POST   /api/posts              # Create new draft
GET    /api/posts/:id          # Get single post
PUT    /api/posts/:id          # Update post
DELETE /api/posts/:id          # Delete post
POST   /api/posts/:id/publish  # Publish post
POST   /api/posts/:id/unpublish # Unpublish post
GET    /api/posts/:id/versions # Get version history
```

#### GET /api/posts

**Query Parameters:**
- `status` - Filter by status (draft, published, archived)
- `collection` - Filter by collection
- `limit` - Results per page (default: 20)
- `offset` - Pagination offset
- `sort` - Sort field (created_at, updated_at, published_at)
- `order` - Sort order (asc, desc)

**Response (200):**
```json
{
  "posts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "collection": "blog",
      "slug": "hello-world",
      "title": "Hello World",
      "summary": "My first post",
      "status": "published",
      "createdAt": "2026-02-11T14:00:00Z",
      "updatedAt": "2026-02-11T14:05:00Z",
      "publishedAt": "2026-02-11T14:05:00Z",
      "tags": ["announcement", "welcome"]
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

#### POST /api/posts

**Request:**
```json
{
  "collection": "blog",
  "title": "My New Post",
  "body": "Post content in markdown",
  "summary": "Optional summary",
  "tags": ["tag1", "tag2"]
}
```

**Response (201):**
```json
{
  "success": true,
  "post": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "collection": "blog",
    "slug": "my-new-post",
    "title": "My New Post",
    "body": "Post content in markdown",
    "summary": "Optional summary",
    "status": "draft",
    "createdAt": "2026-02-11T14:30:00Z",
    "updatedAt": "2026-02-11T14:30:00Z",
    "tags": ["tag1", "tag2"]
  }
}
```

**Behavior:**
- Auto-generates slug from title
- Creates UUID for id
- Sets status to 'draft'
- Creates or reuses tags
- Creates initial version snapshot

---

#### PUT /api/posts/:id

**Request:**
```json
{
  "title": "Updated Title",
  "body": "Updated content",
  "summary": "Updated summary",
  "slug": "custom-slug",
  "tags": ["new-tag"]
}
```

**Response (200):**
```json
{
  "success": true,
  "post": { /* updated post object */ }
}
```

**Behavior:**
- Updates `updated_at` timestamp
- Creates new version snapshot
- If slug changes, validates uniqueness

---

#### POST /api/posts/:id/publish

**Request:**
```json
{
  "publishedAt": "2026-02-11T15:00:00Z"  // Optional, defaults to now
}
```

**Response (200):**
```json
{
  "success": true,
  "post": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "published",
    "publishedAt": "2026-02-11T15:00:00Z"
  },
  "exported": {
    "filePath": "src/content/blog/my-new-post.md",
    "mediaFiles": 2
  }
}
```

**Behavior:**
1. Update post status to 'published'
2. Set `published_at` timestamp
3. Create version snapshot
4. Call AstroExporter.exportPost()
5. Trigger webhook (async, non-blocking)
6. Log to activity_log
7. Optional: Trigger GitExporter (async)

---

#### DELETE /api/posts/:id

**Response (200):**
```json
{
  "success": true
}
```

**Behavior:**
- Deletes post from database
- Deletes all versions
- Removes tag associations
- Optionally deletes exported file
- Logs deletion in activity_log

---

### 4.3 Media Endpoints

```
POST   /api/media/upload       # Upload single file
GET    /api/media              # List media
GET    /api/media/:id          # Get media details
DELETE /api/media/:id          # Delete media
```

#### POST /api/media/upload

**Request:** `multipart/form-data`
```
file: [binary]
alt: "Image description"
```

**Response (201):**
```json
{
  "success": true,
  "media": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "filename": "7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg",
    "originalFilename": "vacation.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 245678,
    "width": 1920,
    "height": 1080,
    "storagePath": "media/2026/02/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg",
    "url": "/media/2026/02/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpg",
    "altText": "Image description"
  }
}
```

**Behavior:**
1. Validate file type (image/jpeg, image/png, image/webp, image/gif)
2. Validate file size (max 10MB)
3. Generate UUID for filename
4. Process with Sharp:
   - Resize if width > 2400px
   - Compress (JPEG quality 85%)
   - Extract dimensions
5. Save to `/workspace/public/media/YYYY/MM/{uuid}.ext`
6. Insert record into media table
7. Return media object with public URL

---

### 4.4 Tag Endpoints

```
GET    /api/tags               # List all tags
POST   /api/tags               # Create tag
DELETE /api/tags/:id           # Delete tag
```

#### GET /api/tags

**Response (200):**
```json
{
  "tags": [
    {
      "id": 1,
      "name": "Travel",
      "slug": "travel",
      "postCount": 5
    },
    {
      "id": 2,
      "name": "Photography",
      "slug": "photography",
      "postCount": 12
    }
  ]
}
```

---

### 4.5 Setup & Health Endpoints

```
GET    /api/setup/status       # Check if setup is complete
POST   /api/setup/validate     # Validate workspace
GET    /api/health             # Health check
```

#### GET /api/setup/status

**Response (200):**
```json
{
  "setupComplete": false,
  "version": "1.0.0"
}
```

---

#### POST /api/setup/validate

**Request:**
```json
{
  "workspacePath": "/workspace"
}
```

**Response (200):**
```json
{
  "valid": true,
  "astroConfig": true,
  "packageJson": true,
  "hasSrcContent": true,
  "warnings": []
}
```

**Response (400):**
```json
{
  "valid": false,
  "errors": [
    "No astro.config.* found",
    "Missing package.json"
  ]
}
```

---

#### GET /api/health

**Response (200):**
```json
{
  "status": "healthy",
  "database": "connected",
  "workspace": "mounted",
  "uptime": 3600
}
```

---

## 5. Core Modules Implementation

### 5.1 Database Module (`src/db/index.js`)

```javascript
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import logger from '../utils/logger.js';

class DB {
  constructor(dbPath) {
    this.db = new Database(dbPath, { 
      verbose: logger.debug.bind(logger) 
    });
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    logger.info(`Database connected: ${dbPath}`);
  }
  
  /**
   * Run migrations
   */
  async migrate() {
    const schema = readFileSync(
      join(process.cwd(), 'src/db/schema.sql'), 
      'utf-8'
    );
    
    // Check if migrations table exists
    const hasMigrations = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .get();
    
    if (!hasMigrations) {
      // First run - execute full schema
      this.db.exec(schema);
      
      // Run seed data
      const seed = readFileSync(
        join(process.cwd(), 'src/db/seed.sql'), 
        'utf-8'
      );
      this.db.exec(seed);
      
      logger.info('Database initialized with schema and seed data');
    } else {
      // Run incremental migrations here if needed
      logger.info('Database schema up to date');
    }
  }
  
  /**
   * Prepared statement helper
   */
  prepare(sql) {
    return this.db.prepare(sql);
  }
  
  /**
   * Transaction helper
   */
  transaction(fn) {
    return this.db.transaction(fn);
  }
  
  /**
   * Close database connection
   */
  close() {
    this.db.close();
    logger.info('Database connection closed');
  }
}

export default DB;
```

---

### 5.2 Post Model (`src/models/Post.js`)

```javascript
import { v4 as uuid } from 'uuid';
import { slugify } from '../utils/slugify.js';

export class Post {
  constructor(db) {
    this.db = db;
  }
  
  /**
   * Create new post (draft)
   */
  create({ collection, title, body, summary, tags, userId }) {
    const id = uuid();
    const slug = slugify(title);
    
    const insertPost = this.db.prepare(`
      INSERT INTO posts (id, collection, slug, title, body, summary, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const createVersion = this.db.prepare(`
      INSERT INTO post_versions (post_id, title, body, summary, version_number, created_by)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    
    const transaction = this.db.transaction((data) => {
      insertPost.run(
        data.id,
        data.collection,
        data.slug,
        data.title,
        data.body,
        data.summary || null,
        data.userId
      );
      
      createVersion.run(
        data.id,
        data.title,
        data.body,
        data.summary || null,
        data.userId
      );
      
      // Handle tags
      if (data.tags && data.tags.length > 0) {
        this._attachTags(data.id, data.tags);
      }
    });
    
    transaction({ id, collection, slug, title, body, summary, userId });
    
    return this.findById(id);
  }
  
  /**
   * Find post by ID
   */
  findById(id) {
    const post = this.db.prepare(`
      SELECT 
        p.*,
        u.username as author_username,
        u.display_name as author_name
      FROM posts p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(id);
    
    if (!post) return null;
    
    // Get tags
    const tags = this.db.prepare(`
      SELECT t.id, t.name, t.slug
      FROM tags t
      JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = ?
    `).all(id);
    
    return { ...post, tags };
  }
  
  /**
   * List posts with filters
   */
  list({ status, collection, limit = 20, offset = 0, sort = 'created_at', order = 'desc' }) {
    let query = `
      SELECT 
        p.id, p.collection, p.slug, p.title, p.summary, p.status,
        p.created_at, p.updated_at, p.published_at,
        u.display_name as author_name
      FROM posts p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
      query += ` AND p.status = ?`;
      params.push(status);
    }
    
    if (collection) {
      query += ` AND p.collection = ?`;
      params.push(collection);
    }
    
    query += ` ORDER BY p.${sort} ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const posts = this.db.prepare(query).all(...params);
    
    // Get tags for each post
    return posts.map(post => ({
      ...post,
      tags: this._getPostTags(post.id)
    }));
  }
  
  /**
   * Update post
   */
  update(id, { title, body, summary, slug, tags }) {
    const current = this.findById(id);
    if (!current) throw new Error('Post not found');
    
    const updates = [];
    const params = [];
    
    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    
    if (body !== undefined) {
      updates.push('body = ?');
      params.push(body);
    }
    
    if (summary !== undefined) {
      updates.push('summary = ?');
      params.push(summary);
    }
    
    if (slug !== undefined) {
      updates.push('slug = ?');
      params.push(slug);
    }
    
    updates.push("updated_at = datetime('now')");
    
    const updateStmt = this.db.prepare(`
      UPDATE posts 
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    
    params.push(id);
    updateStmt.run(...params);
    
    // Create new version
    const versionNumber = this._getNextVersionNumber(id);
    this.db.prepare(`
      INSERT INTO post_versions (post_id, title, body, summary, version_number, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title || current.title,
      body || current.body,
      summary || current.summary,
      versionNumber,
      current.created_by
    );
    
    // Update tags if provided
    if (tags !== undefined) {
      this._replaceTags(id, tags);
    }
    
    return this.findById(id);
  }
  
  /**
   * Publish post
   */
  publish(id, publishedAt = null) {
    const stmt = this.db.prepare(`
      UPDATE posts 
      SET 
        status = 'published',
        published_at = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);
    
    const timestamp = publishedAt || new Date().toISOString();
    stmt.run(timestamp, id);
    
    return this.findById(id);
  }
  
  /**
   * Unpublish post
   */
  unpublish(id) {
    this.db.prepare(`
      UPDATE posts 
      SET 
        status = 'draft',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
    
    return this.findById(id);
  }
  
  /**
   * Delete post
   */
  delete(id) {
    this.db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  }
  
  /**
   * Get version history
   */
  getVersions(postId) {
    return this.db.prepare(`
      SELECT 
        v.*,
        u.display_name as author_name
      FROM post_versions v
      LEFT JOIN users u ON v.created_by = u.id
      WHERE v.post_id = ?
      ORDER BY v.version_number DESC
    `).all(postId);
  }
  
  // ===== Private helpers =====
  
  _getPostTags(postId) {
    return this.db.prepare(`
      SELECT t.id, t.name, t.slug
      FROM tags t
      JOIN post_tags pt ON t.id = pt.tag_id
      WHERE pt.post_id = ?
    `).all(postId);
  }
  
  _attachTags(postId, tagNames) {
    const insertTag = this.db.prepare(`
      INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)
    `);
    
    const getTagId = this.db.prepare(`
      SELECT id FROM tags WHERE slug = ?
    `);
    
    const linkTag = this.db.prepare(`
      INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)
    `);
    
    for (const name of tagNames) {
      const slug = slugify(name);
      insertTag.run(name, slug);
      const tag = getTagId.get(slug);
      linkTag.run(postId, tag.id);
    }
  }
  
  _replaceTags(postId, tagNames) {
    // Delete existing
    this.db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);
    
    // Add new
    if (tagNames.length > 0) {
      this._attachTags(postId, tagNames);
    }
  }
  
  _getNextVersionNumber(postId) {
    const result = this.db.prepare(`
      SELECT MAX(version_number) as max_version
      FROM post_versions
      WHERE post_id = ?
    `).get(postId);
    
    return (result.max_version || 0) + 1;
  }
}
```

---

### 5.3 Astro Exporter (`src/exporters/AstroExporter.js`)

```javascript
import { writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import yaml from 'js-yaml';
import logger from '../utils/logger.js';

export class AstroExporter {
  constructor({ workspaceRoot, collections }) {
    this.workspaceRoot = workspaceRoot;
    this.collections = collections || [];
  }
  
  /**
   * Export single post to Astro content format
   */
  async exportPost(post, tags = [], media = []) {
    try {
      // 1. Generate frontmatter
      const frontmatter = this._generateFrontmatter(post, tags);
      
      // 2. Build full markdown
      const content = `---\n${frontmatter}---\n\n${post.body}`;
      
      // 3. Write file
      const filePath = join(
        this.workspaceRoot,
        'src/content',
        post.collection,
        `${post.slug}.md`
      );
      
      await this._ensureDirectory(dirname(filePath));
      await writeFile(filePath, content, 'utf-8');
      
      logger.info(`Exported: ${filePath}`);
      
      // 4. Copy media files (if any)
      let copiedMedia = 0;
      for (const m of media) {
        await this._copyMedia(m);
        copiedMedia++;
      }
      
      return {
        success: true,
        filePath: filePath.replace(this.workspaceRoot, ''),
        mediaFiles: copiedMedia
      };
      
    } catch (error) {
      logger.error('Export failed:', error);
      throw error;
    }
  }
  
  /**
   * Delete exported post file
   */
  async deletePost(post) {
    const filePath = join(
      this.workspaceRoot,
      'src/content',
      post.collection,
      `${post.slug}.md`
    );
    
    if (existsSync(filePath)) {
      const { unlink } = await import('fs/promises');
      await unlink(filePath);
      logger.info(`Deleted: ${filePath}`);
    }
  }
  
  /**
   * Generate YAML frontmatter
   */
  _generateFrontmatter(post, tags) {
    const data = {
      title: post.title,
      pubDate: post.published_at || post.created_at,
      description: post.summary || '',
      tags: tags.map(t => t.name),
      draft: post.status !== 'published'
    };
    
    return yaml.dump(data, {
      lineWidth: -1,  // Don't wrap lines
      noRefs: true
    });
  }
  
  /**
   * Copy media file to public directory
   */
  async _copyMedia(media) {
    const sourcePath = join(this.workspaceRoot, 'public', media.storage_path);
    
    // Media should already be in /workspace/public/media/
    // This is a no-op if upload already placed it correctly
    // Keeping for potential future use (e.g., if we support media library migration)
    
    if (!existsSync(sourcePath)) {
      logger.warn(`Media file not found: ${sourcePath}`);
    }
  }
  
  /**
   * Ensure directory exists
   */
  async _ensureDirectory(dirPath) {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }
}
```

---

### 5.4 Authentication Service (`src/services/auth.js`)

```javascript
import argon2 from 'argon2';
import { randomBytes } from 'crypto';

export class AuthService {
  constructor(db) {
    this.db = db;
  }
  
  /**
   * Hash password with Argon2id
   */
  async hashPassword(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,  // 19MB
      timeCost: 2,
      parallelism: 1
    });
  }
  
  /**
   * Verify password
   */
  async verifyPassword(hash, password) {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Create user session
   */
  createSession(userId, userAgent = null, ipAddress = null) {
    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      sessionId,
      userId,
      expiresAt.toISOString(),
      userAgent,
      ipAddress
    );
    
    return {
      sessionId,
      expiresAt
    };
  }
  
  /**
   * Validate session
   */
  validateSession(sessionId) {
    const session = this.db.prepare(`
      SELECT s.*, u.id as user_id, u.username, u.display_name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `).get(sessionId);
    
    if (session) {
      // Update last activity
      this.db.prepare(`
        UPDATE sessions SET last_activity = datetime('now') WHERE id = ?
      `).run(sessionId);
    }
    
    return session;
  }
  
  /**
   * Delete session (logout)
   */
  deleteSession(sessionId) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
  
  /**
   * Clean expired sessions
   */
  cleanExpiredSessions() {
    const result = this.db.prepare(`
      DELETE FROM sessions WHERE expires_at < datetime('now')
    `).run();
    
    return result.changes;
  }
}
```

---

## 6. Frontend Architecture

### 6.1 Technology Choice

**Framework:** Preact + HTM (no build step)

**Why:**
- 3KB total bundle size
- Native ES modules
- No build complexity
- Works perfectly for CRUD forms
- Mobile-friendly out of the box

### 6.2 Application Structure

```
public/
├── index.html          # SPA shell
├── app.js              # Main application
├── components/
│   ├── Header.js
│   ├── PostList.js
│   ├── PostEditor.js
│   ├── MediaUploader.js
│   └── LoginForm.js
├── lib/
│   ├── api.js          # API client
│   ├── router.js       # Simple hash router
│   └── auth.js         # Auth state
├── styles.css          # Mobile-first CSS
└── manifest.json       # PWA manifest
```

### 6.3 Sample Frontend Code (`public/app.js`)

```javascript
import { html, render } from 'https://esm.sh/htm/preact/standalone';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';

// Simple API client
const api = {
  async request(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  },
  
  getPosts: (params) => api.request(`/posts?${new URLSearchParams(params)}`),
  getPost: (id) => api.request(`/posts/${id}`),
  createPost: (data) => api.request('/posts', { method: 'POST', body: JSON.stringify(data) }),
  updatePost: (id, data) => api.request(`/posts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  publishPost: (id) => api.request(`/posts/${id}/publish`, { method: 'POST' }),
  deletePost: (id) => api.request(`/posts/${id}`, { method: 'DELETE' })
};

// Main app component
function App() {
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    // Simple hash router
    const handleHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  useEffect(() => {
    // Check auth status
    api.request('/auth/me')
      .then(data => setUser(data.user))
      .catch(() => setUser(null));
  }, []);
  
  if (!user) {
    return html`<${LoginForm} onLogin=${setUser} />`;
  }
  
  // Route to components
  if (route.startsWith('#/posts/new')) {
    return html`<${PostEditor} />`;
  }
  
  if (route.startsWith('#/posts/')) {
    const id = route.split('/')[2];
    return html`<${PostEditor} postId=${id} />`;
  }
  
  return html`<${Dashboard} user=${user} />`;
}

// Dashboard
function Dashboard({ user }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    api.getPosts({ limit: 20 })
      .then(data => {
        setPosts(data.posts);
        setLoading(false);
      });
  }, []);
  
  if (loading) {
    return html`<div class="loading">Loading...</div>`;
  }
  
  return html`
    <div class="dashboard">
      <header>
        <h1>Astral Relay</h1>
        <p>Welcome, ${user.displayName}</p>
      </header>
      
      <div class="actions">
        <a href="#/posts/new" class="btn btn-primary">New Post</a>
      </div>
      
      <div class="post-list">
        ${posts.map(post => html`
          <div class="post-card" key=${post.id}>
            <h3><a href="#/posts/${post.id}">${post.title}</a></h3>
            <p class="meta">
              ${post.status} • ${post.collection} • 
              ${new Date(post.updatedAt).toLocaleDateString()}
            </p>
          </div>
        `)}
      </div>
    </div>
  `;
}

// Render app
render(html`<${App} />`, document.getElementById('app'));
```

### 6.4 Mobile-First CSS Guidelines

```css
/* Mobile-first base */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

/* Large tap targets (min 44px) */
.btn {
  min-height: 44px;
  padding: 12px 24px;
  font-size: 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

/* Sticky action bar */
.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  background: white;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 12px;
  z-index: 100;
}

/* Responsive grid */
@media (min-width: 768px) {
  .dashboard {
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .post-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
}
```

---

## 7. Docker Configuration

### 7.1 Dockerfile

```dockerfile
# Use official Node.js LTS
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    sqlite

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3030/api/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start server
CMD ["node", "src/server.js"]
```

### 7.2 docker-compose.yml

```yaml
version: '3.8'

services:
  astral-relay:
    build: .
    container_name: astral-relay
    ports:
      - "3030:3030"
    volumes:
      # Persistent database
      - ./data:/app/data
      
      # Mount user's Astro repository
      # UPDATE THIS PATH to your Astro site
      - /path/to/your/astro-site:/workspace
    
    environment:
      - NODE_ENV=production
      - PORT=3030
      - DB_PATH=/app/data/relay.db
      - WORKSPACE_PATH=/workspace
      
      # Security
      - SESSION_SECRET=${SESSION_SECRET:-generate-random-secret-here}
      
      # Optional: Enable Git sync
      - GIT_SYNC_ENABLED=false
      - GIT_BRANCH=main
      
      # Optional: Webhook
      - WEBHOOK_URL=
    
    restart: unless-stopped
    
    # Optional: Networks for reverse proxy
    # networks:
    #   - web
```

### 7.3 .dockerignore

```
node_modules
npm-debug.log
.git
.gitignore
.env
data/*.db
data/*.db-shm
data/*.db-wal
README.md
```

---

## 8. Configuration Management

### 8.1 Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3030
HOST=0.0.0.0

# Database
DB_PATH=/app/data/relay.db

# Workspace
WORKSPACE_PATH=/workspace

# Security
SESSION_SECRET=<random-64-char-string>
SESSION_MAX_AGE=604800000  # 7 days in ms

# Upload limits
MAX_UPLOAD_SIZE=10485760  # 10MB in bytes

# Optional: Git sync
GIT_SYNC_ENABLED=false
GIT_BRANCH=main

# Optional: Webhook
WEBHOOK_URL=
WEBHOOK_TIMEOUT=5000  # 5 seconds
```

### 8.2 Runtime Configuration (`relay.config.json`)

```json
{
  "version": "1.0.0",
  "workspace": "/workspace",
  
  "collections": [
    "blog",
    "photos",
    "adventures",
    "portfolio"
  ],
  
  "exporters": {
    "astro": {
      "enabled": true
    },
    "git": {
      "enabled": false,
      "branch": "main",
      "autoCommit": false
    }
  },
  
  "webhook": {
    "enabled": false,
    "url": "",
    "timeout": 5000
  },
  
  "media": {
    "maxSizeBytes": 10485760,
    "allowedTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"],
    "maxWidth": 2400,
    "jpegQuality": 85
  },
  
  "security": {
    "sessionMaxAge": 604800000,
    "rateLimitWindow": 900000,
    "rateLimitMax": 100
  }
}
```

---

## 9. Error Handling & Logging

### 9.1 Logging Strategy

**Library:** Pino (fast, structured JSON logging)

```javascript
// src/utils/logger.js
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

export default logger;
```

**Usage:**
```javascript
logger.info({ action: 'post.publish', postId, userId }, 'Post published');
logger.error({ error: err.message, stack: err.stack }, 'Export failed');
logger.debug({ query, params }, 'Database query');
```

### 9.2 Global Error Handler (Fastify)

```javascript
// src/middleware/errorHandler.js
import logger from '../utils/logger.js';

export function errorHandler(error, request, reply) {
  logger.error({
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method
  }, 'Request error');
  
  // Don't expose internal errors to client
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 
    ? 'Internal server error' 
    : error.message;
  
  reply.status(statusCode).send({
    error: message,
    statusCode
  });
}
```

### 9.3 Activity Logging

Every significant action should be logged to `activity_log` table:

```javascript
function logActivity(db, { userId, action, resourceType, resourceId, metadata, ipAddress }) {
  db.prepare(`
    INSERT INTO activity_log (user_id, action, resource_type, resource_id, metadata, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    action,
    resourceType,
    resourceId,
    JSON.stringify(metadata || {}),
    ipAddress
  );
}

// Usage
logActivity(db, {
  userId: 1,
  action: 'post.publish',
  resourceType: 'post',
  resourceId: postId,
  metadata: { collection: 'blog', slug: 'hello-world' },
  ipAddress: request.ip
});
```

---

## 10. Security Checklist

### 10.1 Authentication & Sessions

- [x] Argon2id password hashing
- [x] HttpOnly cookies for sessions
- [x] SameSite=Strict cookie attribute
- [x] Secure cookie flag (HTTPS only)
- [x] Session expiration (7 days)
- [x] Session cleanup on logout
- [x] Rate limiting on login endpoint

### 10.2 Input Validation

```javascript
// src/utils/validators.js
import Joi from 'joi';

export const schemas = {
  createPost: Joi.object({
    collection: Joi.string().alphanum().min(2).max(30).required(),
    title: Joi.string().min(1).max(200).required(),
    body: Joi.string().required(),
    summary: Joi.string().max(500).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
  }),
  
  login: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required()
  })
};

export function validate(schema, data) {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    throw new Error(`Validation failed: ${error.details.map(d => d.message).join(', ')}`);
  }
  return value;
}
```

### 10.3 Path Traversal Prevention

```javascript
// Validate slugs to prevent directory traversal
function sanitizeSlug(slug) {
  // Only allow alphanumeric, dash, underscore
  const cleaned = slug.replace(/[^a-z0-9-_]/gi, '-');
  
  // Prevent path traversal
  if (cleaned.includes('..') || cleaned.includes('/')) {
    throw new Error('Invalid slug');
  }
  
  return cleaned;
}
```

### 10.4 File Upload Security

```javascript
// src/utils/imageProcessor.js
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function processUpload(file) {
  // Validate type
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new Error('Invalid file type');
  }
  
  // Validate size
  if (file.size > MAX_SIZE) {
    throw new Error('File too large');
  }
  
  // Re-encode with Sharp (prevents malicious files)
  const image = sharp(file.buffer);
  const metadata = await image.metadata();
  
  // Resize if too large
  if (metadata.width > 2400) {
    image.resize(2400, null, { withoutEnlargement: true });
  }
  
  // Convert to JPEG with controlled quality
  const processed = await image
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();
  
  const filename = `${uuid()}.jpg`;
  
  return {
    buffer: processed,
    filename,
    width: metadata.width,
    height: metadata.height,
    size: processed.length
  };
}
```

---

## 11. Testing Strategy

### 11.1 Test Structure

```
tests/
├── unit/
│   ├── models/
│   │   ├── Post.test.js
│   │   ├── User.test.js
│   │   └── Media.test.js
│   ├── services/
│   │   └── auth.test.js
│   └── utils/
│       └── slugify.test.js
├── integration/
│   ├── api/
│   │   ├── posts.test.js
│   │   ├── auth.test.js
│   │   └── media.test.js
│   └── exporters/
│       └── AstroExporter.test.js
└── fixtures/
    ├── test.db
    └── sample-posts.json
```

### 11.2 Sample Test (Unit)

```javascript
// tests/unit/models/Post.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { Post } from '../../../src/models/Post.js';
import { readFileSync } from 'fs';

describe('Post Model', () => {
  let db;
  let postModel;
  
  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    const schema = readFileSync('src/db/schema.sql', 'utf-8');
    db.exec(schema);
    
    // Create test user
    db.prepare(`
      INSERT INTO users (username, password_hash, display_name)
      VALUES ('testuser', 'hash', 'Test User')
    `).run();
    
    postModel = new Post(db);
  });
  
  afterEach(() => {
    db.close();
  });
  
  it('should create a draft post', () => {
    const post = postModel.create({
      collection: 'blog',
      title: 'Test Post',
      body: 'Test content',
      userId: 1
    });
    
    assert.strictEqual(post.status, 'draft');
    assert.strictEqual(post.title, 'Test Post');
    assert.strictEqual(post.slug, 'test-post');
  });
  
  it('should publish a post', () => {
    const post = postModel.create({
      collection: 'blog',
      title: 'Test Post',
      body: 'Test content',
      userId: 1
    });
    
    const published = postModel.publish(post.id);
    
    assert.strictEqual(published.status, 'published');
    assert.ok(published.published_at);
  });
});
```

### 11.3 Sample Test (Integration)

```javascript
// tests/integration/api/posts.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { build } from '../helpers/app.js';

describe('POST /api/posts', () => {
  let app;
  let sessionCookie;
  
  before(async () => {
    app = await build();
    
    // Login to get session
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'testpass'
      }
    });
    
    sessionCookie = loginResponse.headers['set-cookie'];
  });
  
  after(async () => {
    await app.close();
  });
  
  it('should create a new post', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: {
        cookie: sessionCookie
      },
      payload: {
        collection: 'blog',
        title: 'Integration Test Post',
        body: 'Test content',
        tags: ['test']
      }
    });
    
    assert.strictEqual(response.statusCode, 201);
    
    const data = JSON.parse(response.body);
    assert.ok(data.post.id);
    assert.strictEqual(data.post.title, 'Integration Test Post');
    assert.strictEqual(data.post.status, 'draft');
  });
});
```

---

## 12. Deployment & Operations

### 12.1 First-Time Setup Instructions

**Step 1: Clone and configure**
```bash
git clone https://github.com/user/astral-relay.git
cd astral-relay

# Copy example config
cp .env.example .env

# Generate session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" >> .env
```

**Step 2: Update docker-compose.yml**
```yaml
volumes:
  - /path/to/your/astro-site:/workspace
```

**Step 3: Start container**
```bash
docker-compose up -d
```

**Step 4: Access setup wizard**
```
http://localhost:3030
```

**Step 5: Complete setup**
- Create admin account
- Verify workspace detection
- Select collections
- Save recovery code

### 12.2 Backup Strategy

**Database backup (daily cron):**
```bash
#!/bin/bash
# backup-relay.sh

BACKUP_DIR="/backups/astral-relay"
DATE=$(date +%Y%m%d-%H%M%S)

# Stop writes (optional)
docker exec astral-relay sqlite3 /app/data/relay.db "PRAGMA wal_checkpoint(TRUNCATE);"

# Copy database
docker cp astral-relay:/app/data/relay.db "$BACKUP_DIR/relay-$DATE.db"

# Keep last 7 days
find "$BACKUP_DIR" -name "relay-*.db" -mtime +7 -delete

echo "Backup complete: relay-$DATE.db"
```

**Restore:**
```bash
docker cp relay-20260211-120000.db astral-relay:/app/data/relay.db
docker restart astral-relay
```

### 12.3 Monitoring

**Health check endpoint:**
```bash
curl http://localhost:3030/api/health
```

**Docker logs:**
```bash
docker logs -f astral-relay
```

**Database stats:**
```sql
-- Check database size
SELECT page_count * page_size as size 
FROM pragma_page_count(), pragma_page_size();

-- Check table sizes
SELECT name, (pgsize * 1024) as bytes
FROM dbstat
WHERE aggregate = TRUE
ORDER BY bytes DESC;
```

---

## 13. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [x] Set up project structure
- [x] Define database schema
- [x] Create Docker configuration
- [x] Implement database connection
- [x] Set up logging
- [x] Create basic Fastify server

**Deliverable:** Server starts, database initializes, health check works

---

### Phase 2: Authentication (Week 1-2)
- [x] User model
- [x] Session management
- [x] Login/logout endpoints
- [x] Password hashing
- [x] Setup wizard API

**Deliverable:** Can create admin user, login, maintain session

---

### Phase 3: Post Management (Week 2-3)
- [x] Post model with full CRUD
- [x] Version history
- [x] Tag management
- [x] Post API endpoints
- [x] Autosave functionality

**Deliverable:** Can create, edit, save drafts via API

---

### Phase 4: Media Upload (Week 3)
- [x] Media model
- [x] Image processing with Sharp
- [x] Upload endpoint
- [x] Media storage in workspace

**Deliverable:** Can upload images from API, get public URLs

---

### Phase 5: Export System (Week 4)
- [x] Astro exporter
- [x] Frontmatter generation
- [x] File write logic
- [x] Publish endpoint integration
- [x] Optional webhook trigger

**Deliverable:** Publishing writes correct markdown files to workspace

---

### Phase 6: Frontend UI (Week 4-5)
- [x] Login form
- [x] Dashboard
- [x] Post list
- [x] Post editor
- [x] Media uploader
- [x] Mobile-responsive CSS

**Deliverable:** Can use Orbit from browser/mobile

---

### Phase 7: Polish & Testing (Week 5-6)
- [x] Error handling
- [x] Input validation
- [x] Rate limiting
- [x] Unit tests
- [x] Integration tests
- [x] Documentation

**Deliverable:** Production-ready v1.0.0

---

## 14. Success Criteria

**Astral Relay v1 MVP is complete when:**

1. ✅ User can install via `docker-compose up`
2. ✅ Setup wizard detects Astro repository
3. ✅ User can create admin account
4. ✅ User can login from mobile browser
5. ✅ User can create markdown post
6. ✅ User can upload image from camera/gallery
7. ✅ Publish button writes file to `src/content/{collection}/{slug}.md`
8. ✅ Exported file has correct frontmatter
9. ✅ Media files are in `public/media/`
10. ✅ Optional webhook triggers successfully
11. ✅ Astro build picks up new content
12. ✅ Site updates with new post
13. ✅ All tests pass
14. ✅ Works smoothly on mobile (Safari iOS, Chrome Android)

---

## 15. Future Enhancements (Post-MVP)

### Phase 2 (v1.1 - v1.3)
- Schema discovery from `src/content/config.ts`
- 2FA authentication
- Role-based permissions
- Pull request workflow
- Media manager UI
- Scheduled posts

### Phase 3 (v2.0+)
- Multi-site support
- Plugin system
- Alternative exporters (Hugo, 11ty)
- S3/R2 media adapter
- Real-time preview
- Collaborative editing

---

## 16. Package Dependencies

### 16.1 package.json

```json
{
  "name": "astral-relay",
  "version": "1.0.0",
  "description": "Self-hosted publishing system for Astro sites",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test tests/**/*.test.js",
    "migrate": "node src/db/migrations.js"
  },
  "dependencies": {
    "@fastify/cookie": "^9.3.1",
    "@fastify/cors": "^9.0.1",
    "@fastify/multipart": "^8.1.0",
    "@fastify/rate-limit": "^9.1.0",
    "@fastify/static": "^6.12.0",
    "argon2": "^0.31.2",
    "better-sqlite3": "^9.4.0",
    "fastify": "^4.26.0",
    "js-yaml": "^4.1.0",
    "pino": "^8.19.0",
    "pino-pretty": "^10.3.1",
    "sharp": "^0.33.2",
    "uuid": "^9.0.1",
    "joi": "^17.12.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.9",
    "@types/node": "^20.11.17"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

## 17. Final Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │  Mobile Safari │  │ Chrome Android │  │Desktop Browser │ │
│  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘ │
└───────────┼────────────────────┼────────────────────┼─────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 │ HTTPS
┌────────────────────────────────┼─────────────────────────────┐
│                  ASTRAL RELAY CONTAINER                       │
│                                │                              │
│  ┌─────────────────────────────▼──────────────────────────┐  │
│  │              Fastify HTTP Server                        │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐    │  │
│  │  │  Static  │  │   Auth   │  │    Rate Limit     │    │  │
│  │  │  Files   │  │Middleware│  │    Middleware     │    │  │
│  │  └──────────┘  └──────────┘  └───────────────────┘    │  │
│  └──────────────────────────┬───────────────────────────────┘│
│                             │                                 │
│  ┌──────────────────────────┼───────────────────────────────┐│
│  │           API ROUTES     │                               ││
│  │  ┌────────┬─────────┬───┴────┬──────────┬──────────┐   ││
│  │  │ /auth  │ /posts  │ /media │  /tags   │  /setup  │   ││
│  │  └───┬────┴────┬────┴────┬───┴─────┬────┴─────┬────┘   ││
│  └──────┼─────────┼─────────┼─────────┼──────────┼────────┘│
│         │         │         │         │          │          │
│  ┌──────▼─────────▼─────────▼─────────▼──────────▼───────┐ │
│  │              BUSINESS LOGIC LAYER                      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │ │
│  │  │   Auth   │  │  Storage │  │      Exporter        │ │ │
│  │  │  Service │  │  Service │  │    Orchestrator      │ │ │
│  │  └──────────┘  └──────────┘  └──────────┬───────────┘ │ │
│  └────────────────────────────────────────────┼───────────┘ │
│                                               │              │
│  ┌────────────────────────────────────────────┼───────────┐ │
│  │               DATA ACCESS LAYER            │           │ │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐   │           │ │
│  │  │  Post   │  │  Media  │  │   User   │   │           │ │
│  │  │  Model  │  │  Model  │  │  Model   │   │           │ │
│  │  └────┬────┘  └────┬────┘  └────┬─────┘   │           │ │
│  └───────┼────────────┼────────────┼──────────┼───────────┘ │
│          │            │            │          │              │
│  ┌───────▼────────────▼────────────▼──────────▼───────────┐ │
│  │              SQLite Database (relay.db)               │ │
│  │  ┌──────┐ ┌────────────┐ ┌───────┐ ┌────────────┐   │ │
│  │  │posts │ │post_versions│ │ media │ │   users    │   │ │
│  │  └──────┘ └────────────┘ └───────┘ └────────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           EXPORT LAYER                               │   │
│  │  ┌───────────────────┐      ┌──────────────────────┐│   │
│  │  │  Astro Exporter   │      │   Git Exporter       ││   │
│  │  │  (required)       │      │   (optional)         ││   │
│  │  └─────────┬─────────┘      └──────────┬───────────┘│   │
│  └────────────┼─────────────────────────────┼───────────┘   │
└───────────────┼─────────────────────────────┼───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────────────────────────────────────┐
│                   WORKSPACE VOLUME                         │
│  /workspace/                                              │
│    ├── src/content/                                       │
│    │   ├── blog/*.md          ◄─── Astro Exporter        │
│    │   └── photos/*.md                                    │
│    └── public/media/                                      │
│        └── YYYY/MM/*.jpg      ◄─── Media Upload          │
└───────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────┐
│              ASTRO BUILD PIPELINE                          │
│  ┌─────────────┐    ┌──────────────┐   ┌──────────────┐  │
│  │  Webhook    │───►│ Astro Build  │──►│    Deploy    │  │
│  │  Trigger    │    │              │   │              │  │
│  └─────────────┘    └──────────────┘   └──────────────┘  │
└───────────────────────────────────────────────────────────┘
```

---

## 18. Implementation Checklist for Claude Code

### Critical Path Items

**Database & Core:**
- [ ] Create `src/db/schema.sql` with full schema
- [ ] Create `src/db/seed.sql` with initial config
- [ ] Implement `src/db/index.js` with migration support
- [ ] Create all model classes (Post, User, Media, Tag, Session)

**Server & API:**
- [ ] Set up Fastify server in `src/server.js`
- [ ] Implement all API routes (auth, posts, media, tags, setup)
- [ ] Add middleware (auth, rate limit, error handler, logging)
- [ ] Implement services (auth, storage, exporter)

**Export System:**
- [ ] Complete `AstroExporter.js` with frontmatter generation
- [ ] Implement file writing with proper error handling
- [ ] Add optional `GitExporter.js`
- [ ] Add webhook trigger functionality

**Frontend:**
- [ ] Create `public/index.html` SPA shell
- [ ] Implement `public/app.js` with Preact + HTM
- [ ] Create all components (Dashboard, PostEditor, MediaUploader, LoginForm)
- [ ] Add mobile-first CSS
- [ ] Create PWA manifest

**Docker & Config:**
- [ ] Complete `Dockerfile`
- [ ] Create `docker-compose.yml`
- [ ] Set up `.env.example`
- [ ] Add `.dockerignore` and `.gitignore`

**Testing:**
- [ ] Write unit tests for models
- [ ] Write integration tests for API
- [ ] Write tests for exporters
- [ ] Add test fixtures

**Documentation:**
- [ ] Create comprehensive README.md
- [ ] Add setup instructions
- [ ] Document API endpoints
- [ ] Create troubleshooting guide

---

## 19. README.md Template

```markdown
# Astral Relay

> A self-hosted, mobile-friendly publishing system for Astro sites

## Features

- 📱 Mobile-first PWA interface
- 🗃️ SQLite database (no external dependencies)
- 📝 Markdown editor with live preview
- 🖼️ Image upload with automatic optimization
- 🚀 One-click publish to Astro content
- 🔒 Secure session-based authentication
- 🐳 Docker deployment
- 🔌 Optional webhook integration

## Quick Start

1. Clone this repository
2. Update `docker-compose.yml` with your Astro site path
3. Run `docker-compose up -d`
4. Open `http://localhost:3030`
5. Complete setup wizard

## Requirements

- Docker & Docker Compose
- An existing Astro site with content collections

## Documentation

See [docs/](./docs/) for:
- Setup guide
- API reference
- Troubleshooting
- Development guide

## License

Copyright © 2026 Forrest Morrisey. All rights reserved.

No license is granted to copy, modify, distribute, publish, sublicense,
or otherwise use any part of this repository.

This repository contains original written content, photographs, designs,
and other creative works owned exclusively by the author. Any use without
explicit written permission is prohibited.

```

---

**End of Architecture Plan**

This document provides complete specifications for implementing Orbit CMS v1 MVP. All technical decisions, database schemas, API contracts, and implementation guidance are defined and ready for development.
