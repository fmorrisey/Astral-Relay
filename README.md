# Astral Relay

- ![CI](https://img.shields.io/badge/-CI-lightgrey) ![CD](https://img.shields.io/badge/-CD-lightgrey)


> This is Major Tom to Ground Control I'm stepping through the door And I'm floating in a most peculiar way And the stars look very different today

A self-hosted, mobile-friendly publishing system for Astro sites. Write, manage, and publish content from any device — Astral Relay exports directly to Astro's content collections format.

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

```bash
# Clone and configure
git clone <repo-url> && cd astral-relay
cp .env.example .env

# Generate a session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Add the output to SESSION_SECRET in .env

# Update docker-compose.yml with your Astro site path
# Then start:
docker compose up -d

# Open http://localhost:3030 and complete the setup wizard
```

## Local Development

```bash
npm install
npm run dev    # starts with --watch for auto-reload
```

The server runs on `http://localhost:3030` by default.

## Requirements

- **Docker & Docker Compose** (for production)
- **Node.js >= 18** (for local development)
- An existing Astro site with content collections

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
| `PORT` | `3030` | Server port |
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

## License

Copyright © 2026 Forrest Morrisey. All rights reserved.

No license is granted to copy, modify, distribute, publish, sublicense,
or otherwise use any part of this repository.

This repository contains original written content, photographs, designs,
and other creative works owned exclusively by the author. Any use without
explicit written permission is prohibited.
