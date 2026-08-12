#!/usr/bin/env bash
#
# Deploy Astral Relay on this host. Run by CD over SSH, and safe to run by hand.
#
# This is the reviewable copy. The one CD actually executes is installed OUTSIDE
# the repository:
#
#   install -Dm755 scripts/deploy.sh ~/.local/bin/astral-relay-deploy
#
# The deploy key in ~/.ssh/authorized_keys is pinned to that installed path with
# a forced command, so the key can only ever run a deploy -- it is not shell
# access. Keeping it outside the repo matters: the forced command must not be
# something a change to the repository can rewrite, or "can merge to main" would
# silently mean "can run anything on this host".
#
# Re-run the install line above after changing this file.

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-$HOME/code/astral-relay}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3031/api/health}"

log() { printf '%s %s\n' "$(date -Is)" "$*"; }

cd "$DEPLOY_PATH"

log "Updating $DEPLOY_PATH"

# This directory doubles as a development checkout, so a deploy can arrive while
# there is uncommitted work in it -- and the reset below would destroy it
# silently. Found the hard way: the first test run of this script reverted an
# in-progress edit to the workflow that calls it.
#
# Refusing would make any stray edit block deploys, so save a patch instead and
# carry on. Nothing is lost and nothing is blocked.
if ! git diff --quiet HEAD 2>/dev/null; then
  mkdir -p "$DEPLOY_PATH/data/backups"
  PATCH="$DEPLOY_PATH/data/backups/uncommitted-$(date +%Y%m%d-%H%M%S).patch"
  git diff HEAD > "$PATCH"
  log "WARNING: uncommitted changes were present; saved to $PATCH before resetting"
fi

git fetch --prune origin
# Reset rather than pull: this tree mirrors main, it is not somewhere work is
# kept, and reset survives a force-push. Gitignored files -- .env, data/ -- are
# untouched.
git reset --hard origin/main
log "Now at $(git log --oneline -1)"

log "Backing up the database"
# Migrations run on boot. A copy before that is the difference between a bad
# migration being an inconvenience and being a data loss. -wal included, or the
# copy silently misses recent writes.
BACKUP_DIR="$DEPLOY_PATH/data/backups"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
for f in relay.db relay.db-wal; do
  [ -f "$DEPLOY_PATH/data/$f" ] && cp "$DEPLOY_PATH/data/$f" "$BACKUP_DIR/$f.$STAMP"
done
# Keep the last 10; unbounded backups fill the disk that the database lives on.
ls -1t "$BACKUP_DIR"/relay.db.* 2>/dev/null | tail -n +11 | xargs -r rm --
ls -1t "$BACKUP_DIR"/relay.db-wal.* 2>/dev/null | tail -n +11 | xargs -r rm --

log "Building and restarting"
docker compose up -d --build

log "Waiting for health"
for _ in $(seq 1 30); do
  status="$(curl -sf -m 5 "$HEALTH_URL" || true)"
  case "$status" in
    *'"status":"healthy"'*)
      log "$status"
      case "$status" in
        *'"workspace":"mounted"'*)
          log "Deploy OK"
          docker image prune -f >/dev/null 2>&1 || true
          exit 0
          ;;
        *)
          log "ERROR: healthy but workspace is not mounted - check HOST_WORKSPACE_PATH in .env"
          exit 1
          ;;
      esac
      ;;
  esac
  sleep 2
done

log "ERROR: did not become healthy within 60s"
docker compose logs --tail 50
exit 1
