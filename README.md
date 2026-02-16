# Astral Relay

- [![CI](https://github.com/fmorrisey/Astral-Relay/actions/workflows/ci.yml/badge.svg)](https://github.com/fmorrisey/Astral-Relay/actions/workflows/ci.yml)
  [![CD](https://github.com/fmorrisey/Astral-Relay/actions/workflows/cd.yml/badge.svg)](https://github.com/fmorrisey/Astral-Relay/actions/workflows/cd.yml)


> "This is Major Tom to Ground Control I'm stepping through the door And I'm floating in a most peculiar way And the stars look very different today" 👨‍🎤🧑‍🚀

A self-hosted, mobile-friendly publishing system for Astro sites. Write, manage, and publish content from any device — Astral Relay exports directly to Astro's content collections format.

## ⚠️ Important: How This Works

**Astral Relay is a write-first CMS, not an import tool.**

- ✅ Write new posts in Astral Relay
- ✅ Click "Publish" → exports `.md` files to your Astro site
- ✅ Your Astro build picks up the new content
- ❌ Does NOT import existing content from your Astro site

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
description: Post summary
tags: [travel, photos]
published: true
---

Your markdown content here...
```

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

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/setup` | First-time setup (create admin) |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/auth/me` | Current user |

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
