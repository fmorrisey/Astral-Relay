# Astral Relay

- [![CI](https://github.com/fmorrisey/Astral-Relay/actions/workflows/ci.yml/badge.svg)](https://github.com/fmorrisey/Astral-Relay/actions/workflows/ci.yml)
  [![CD](https://github.com/fmorrisey/Astral-Relay/actions/workflows/cd.yml/badge.svg)](https://github.com/fmorrisey/Astral-Relay/actions/workflows/cd.yml)


> "This is Major Tom to Ground Control I'm stepping through the door And I'm floating in a most peculiar way And the stars look very different today" 👨‍🎤🧑‍🚀

A self-hosted, mobile-friendly publishing system for Astro sites. Write, manage, and publish content from any device — Astral Relay exports directly to Astro's content collections format.

## ⚠️ Important: How This Works

**Astral Relay is a write-first CMS with a one-way import.**

- ✅ Write new posts in Astral Relay
- ✅ Click "Publish" → exports `.md` files to your Astro site
- ✅ Your Astro build picks up the new content
- ✅ Pull existing content in once with `npm run import`
- ❌ Does **not** watch the workspace — files edited outside Astral Relay after an
  import are not picked up until you re-run it

### Importing existing content

```bash
npm run import -- --dry-run          # report what would happen, change nothing
npm run import                       # import every collection
npm run import -- --collection blog  # limit to one collection
```

The import reads `src/content/{collection}/*.md` and never writes to the
workspace. It is idempotent — matching on collection + slug, so re-running
updates instead of duplicating — and the slug comes from the **filename**, not
the title, so page URLs are preserved.

Frontmatter keys Astral Relay doesn't model are deliberately left in the file
rather than copied into the database. The file stays their source of truth, and
publishing merges them back in.

Entries that can't be mapped (no frontmatter, no title, invalid YAML) are
reported, not silently skipped.

**The workflow:**
```
Write in Astral Relay → Publish → Exports to Astro → Build Astro → Live site
```

## Features

- **Mobile-first PWA** — write and publish from your phone
- **SQLite database** — zero external dependencies, single-file persistence
- **Markdown editor** with tag management and version history
- **Image upload** with automatic optimization via Sharp
- **One-click publish** — exports to `src/content/{collection}/{slug}.md` with YAML frontmatter
- **Session-based auth** with Argon2id password hashing
- **Roles** — admins manage everything; authors manage their own posts and media
- **Docker deployment** — single container, volume-mount your Astro repo
- **Optional webhook** — trigger builds on publish
- **Optional Git sync** — auto-commit and push on publish

## Quick Start

### Prerequisites

- **Docker & Docker Compose** (for production)
- **Node.js >= 18** (for local development)
- **An existing Astro site** with content collections configured

### Production Setup (Docker)

```bash
# 1. Clone and configure
git clone <repo-url> && cd astral-relay
cp .env.example .env

# 2. Generate a session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Add the output to SESSION_SECRET in .env

# 3. CRITICAL: Edit docker-compose.yml and mount your Astro site
# Change this line:
#   - /path/to/your/astro-site:/workspace
# To your actual path, e.g.:
#   - /home/yourname/my-astro-blog:/workspace

# 4. Start the container
docker compose up -d

# 5. Verify workspace is mounted
curl http://localhost:3031/api/health
# Should show: "workspace":"mounted"

# 6. Open http://localhost:3031 and complete setup wizard
```

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set the workspace path to your Astro site
export WORKSPACE_PATH=/absolute/path/to/your/astro-site

# 3. Start the server
npm run dev    # starts with --watch for auto-reload

# 4. Verify workspace is connected
curl http://localhost:3031/api/health
# Should show: "workspace":"mounted"

# 5. Open http://localhost:3031
```

## Workspace Setup (REQUIRED)

**Astral Relay must have access to your Astro site to export content.**

### Verify Your Workspace

```bash
curl http://localhost:3031/api/health
```

**Expected output:**
```json
{
  "status": "healthy",
  "database": "connected",
  "workspace": "mounted",     ← Should say "mounted", NOT "not mounted"
  "uptime": 123
}
```

If you see `"workspace": "not mounted"`:

**For Docker:**
1. Edit `docker-compose.yml`
2. Uncomment and update the workspace volume:
   ```yaml
   volumes:
     - ./data:/app/data
     - /path/to/your/astro-site:/workspace  # Change this path!
   ```
3. Restart: `docker compose restart`

**For Local Dev:**
1. Set the environment variable:
   ```bash
   export WORKSPACE_PATH=/absolute/path/to/your/astro-site
   ```
2. Or add to `.env`:
   ```bash
   WORKSPACE_PATH=/home/yourname/my-astro-blog
   ```
3. Restart the server

### What Gets Exported

When you publish a post, Astral Relay writes:

**Post markdown:**
```
your-astro-site/
  src/content/
    blog/
      your-post-slug.md    ← Created here
    photos/
      vacation-2026.md     ← Or here (based on collection)
```

**Media files:**
```
your-astro-site/
  public/media/
    2026/02/
      abc123.jpg           ← Uploaded images
```

**Frontmatter format:**
```yaml
---
title: Your Post Title
date: 2026-02-15T12:00:00Z
summary: Post summary
tags: [travel, photos]
published: true
---

Your markdown content here...
```

**Publishing over an existing entry preserves fields Astral Relay doesn't model.**
Only the five keys above are rewritten. Anything else already in the file —
`heroImage`, `gallery`, `featured`, `tech`, `links`, `description`, and so on —
is carried through untouched, so a richer Astro schema survives a publish. If the
existing frontmatter is not valid YAML, the publish fails rather than replacing
the file.

## Migrating an existing Astro site

Astral Relay writes five frontmatter keys, and their names may not match what
your collections already use. Check these before publishing over existing
content — everything else in a file is preserved, but these five are rewritten.

| Astral Relay writes | Common alternatives | If yours differs |
|---|---|---|
| `date` | `pubDate`, `publishDate` | Accept `date` in your zod schema, or rename in content |
| `published` | `draft` (inverted!) | `draft: true` means `published: false` — the sense flips |
| `summary` | `description`, `excerpt` | See below |
| `title` | — | Usually already matches |
| `tags` | `categories`, `keywords` | Accept `tags`, or map in your layout |

**`draft` deserves attention.** It is the inverse of `published`, so a schema
expecting `draft` will read a published post as a draft and hide it. Either
switch the collection to `published`, or derive one from the other in your
config:

```ts
// src/content.config.ts — accept both while migrating
const base = {
  title: z.string(),
  date: z.coerce.date(),
  published: z.boolean().default(true),
  summary: z.string().optional(),
  // Old field, still read so pre-existing entries keep working
  draft: z.boolean().optional(),
};
```

**`summary` was previously written as `description`.** If your site reads
`description` and your entries stopped updating, that is why. Astral Relay now
writes `summary` and leaves any hand-written `description` untouched — so both
can coexist, but only `summary` is kept up to date.

**Everything else survives.** `heroImage`, `gallery`, `featured`, `tech`,
`links`, and any other key already in a file are read back and preserved on
publish. Only the five keys above are rewritten. If a file's frontmatter is not
valid YAML, the publish fails rather than replacing it.

The safest order: run `npm run import -- --dry-run`, reconcile field names, then
import and publish one post to confirm the round trip before doing the rest.

## First Time Setup

1. Open `http://localhost:3031`
2. Create your admin account
3. **Save the recovery code** shown on screen
4. Start writing and publishing!

## Architecture

```
astral-relay/
├── src/
│   ├── server.js              # Fastify entry point
│   ├── config.js              # Environment-based config
│   ├── db/                    # SQLite schema, seed, connection
│   ├── models/                # Post, User, Media, Tag, Session
│   ├── services/              # Auth, Storage, Export orchestration
│   ├── exporters/             # Astro markdown + optional Git sync
│   ├── routes/                # API endpoints
│   ├── middleware/            # Auth, rate limit, error handling
│   └── utils/                 # Logger, slugify, validators, image processing
├── public/                    # Preact + HTM frontend (no build step)
├── data/                      # SQLite database (volume mount)
├── Dockerfile
└── docker-compose.yml
```

## API Documentation

An OpenAPI 3 document is served at `/api/openapi.json`, with a browsable UI at
`/docs`.

Off by default in production — a complete map of the API surface is not
something every deployment should publish. Enable with `API_DOCS=true`.

Request bodies in the spec are generated from the same Joi schemas the routes
validate with, and a test asserts every registered route appears in the
document, so neither can drift from the code.

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/setup` | First-time setup (create admin) |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/change-password` | Change password (signs out other devices) |
| `POST` | `/api/auth/recovery-code` | Issue a recovery code, shown once |
| `POST` | `/api/auth/recover` | Redeem a recovery code to reset a password |

### Users (admin only)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users` | List users |
| `POST` | `/api/users` | Create a user (`role`: `author` default, or `admin`) |
| `DELETE` | `/api/users/:id` | Delete a user who owns no content |

### Posts
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/posts` | List posts (filterable by status, collection) |
| `POST` | `/api/posts` | Create draft |
| `GET` | `/api/posts/:id` | Get post |
| `PUT` | `/api/posts/:id` | Update post |
| `DELETE` | `/api/posts/:id` | Delete post |
| `POST` | `/api/posts/:id/publish` | Publish (exports to Astro) |
| `POST` | `/api/posts/:id/unpublish` | Unpublish |
| `GET` | `/api/posts/:id/versions` | Version history |

### Media
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/media/upload` | Upload image (multipart) |
| `GET` | `/api/media` | List media |
| `DELETE` | `/api/media/:id` | Delete media |

### Tags
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tags` | List tags with post counts |
| `POST` | `/api/tags` | Create tag |
| `DELETE` | `/api/tags/:id` | Delete tag |

### System
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/setup/status` | Setup status |
| `POST` | `/api/setup/validate` | Validate workspace path |

## Configuration

Configuration is via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3031` | Server port |
| `DB_PATH` | `./data/relay.db` | SQLite database path |
| `WORKSPACE_PATH` | `/workspace` | Mounted Astro repo path |
| `SESSION_SECRET` | (random) | Cookie signing secret |
| `SESSION_MAX_AGE` | `604800000` | Session TTL (7 days) |
| `MAX_UPLOAD_SIZE` | `10485760` | Max upload size (10MB) |
| `GIT_SYNC_ENABLED` | `false` | Auto-commit on publish |
| `GIT_BRANCH` | `main` | Git branch for sync |
| `WEBHOOK_URL` | (empty) | Webhook URL on publish |
| `LOG_LEVEL` | `info` | Pino log level |

## Tech Stack

- **Backend:** Node.js, Fastify, better-sqlite3
- **Frontend:** Preact + HTM (3KB, no build step)
- **Auth:** Argon2id, httpOnly session cookies
- **Media:** Sharp for image processing
- **Validation:** Joi
- **Logging:** Pino
- **Deployment:** Docker (Node 20 Alpine)

## Troubleshooting

### "Workspace not mounted" error

**Symptom:** Health check shows `"workspace": "not mounted"`

**Solution:**
1. Check your workspace path is correct:
   - Docker: verify volume mount in `docker-compose.yml`
   - Local: verify `WORKSPACE_PATH` environment variable
2. Ensure the path is **absolute**, not relative
3. Verify the directory exists and is accessible
4. For Docker: restart container after changing volumes

### Posts don't appear on my Astro site

**Checklist:**
1. ✅ Is workspace mounted? Check `/api/health`
2. ✅ Did you click "Publish" (not just save draft)?
3. ✅ Check if the `.md` file exists in `src/content/{collection}/`
4. ✅ Rebuild your Astro site (`npm run build` or `astro build`)
5. ✅ Check Astro logs for content collection errors

### Can't upload images

**Checklist:**
1. ✅ File size under 10MB (configurable via `MAX_UPLOAD_SIZE`)
2. ✅ File type is JPEG, PNG, WebP, or GIF
3. ✅ Workspace is mounted (images save to `workspace/public/media/`)

### Locked out — forgotten password

Two routes back in, in order of preference:

**1. Recovery code.** On the sign-in screen, choose **Use a recovery code**, then
enter your username, the code, and a new password. Codes are single-use, and
redeeming one signs out every existing session.

**2. Reset from the server**, if you have no code or have lost it:

```bash
npm run reset-password -- <username>
```

It prompts for the new password (hidden), never takes it as an argument, and
invalidates existing sessions. No restart needed.

### Recovery codes

You are shown a code once, at setup. Only its hash is stored, so it cannot be
displayed again — save it somewhere.

Accounts created before recovery codes were stored have none. To issue one while
signed in:

```bash
curl -X POST http://localhost:3031/api/auth/recovery-code -b 'session=<your session cookie>'
```

Issuing a new code invalidates the previous one, so there is exactly one live
code per account.

### Docker container unhealthy

**Check logs:**
```bash
docker logs astral-relay
```

Common issues:
- Port 3031 already in use
- Database file permissions
- Missing workspace mount

## License

Copyright © 2026 Forrest Morrisey. All rights reserved.

No license is granted to copy, modify, distribute, publish, sublicense,
or otherwise use any part of this repository.

This repository contains original written content, photographs, designs,
and other creative works owned exclusively by the author. Any use without
explicit written permission is prohibited.

### Changing your password

Settings (top right) → **Change password**. You need your current password.
Every other signed-in device is signed out; the one you are using stays in.

The same screen generates a recovery code, which is how accounts created before
recovery codes existed get their first one.
