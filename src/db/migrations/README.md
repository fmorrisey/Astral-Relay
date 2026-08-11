# Migrations

SQL files applied in filename order by `src/db/migrations.js`, on boot and via
`npm run migrate`.

## Naming

```
NNN_lower_snake_case.sql      e.g. 002_add_user_role.sql
```

The numeric prefix is zero-padded and sorted lexically, so `010` sorts after
`009`. A filename that does not match is a hard error, not a skip — a typo that
is silently ignored becomes a migration everyone believes ran.

Numbering starts at **002**. `schema.sql` is the fresh-install path and
`seed.sql` records `001_initial_schema` as already applied; existing databases
carry the same row, so both start from the same baseline.

## Rules

- **No `BEGIN` / `COMMIT` / `ROLLBACK`.** The runner wraps each migration in a
  transaction along with its bookkeeping row, so a migration cannot end up
  applied-but-unrecorded. Nested transaction control breaks that guarantee, and
  the runner rejects files containing it.
- **Never edit a migration that has shipped.** It will not re-run — it is
  recorded as applied. Add a new one.
- **Additive changes are safest.** SQLite's `ALTER TABLE` is limited: it cannot
  drop or retype a column. Removing or changing one means creating a new table,
  copying rows, and swapping — do that inside a single migration file, which the
  runner's transaction will cover.
- **A column added `NOT NULL` needs a `DEFAULT`**, or the migration fails on any
  table that already has rows.

## Verifying against real data

Migrations run against a live database on Rainier. Test on a copy first:

```bash
cp data/relay.db /tmp/relay-check.db
DB_PATH=/tmp/relay-check.db npm run migrate
```
