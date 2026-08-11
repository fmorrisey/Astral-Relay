-- Recovery codes were shown at setup but never stored, so they could not be
-- redeemed and a forgotten password locked the account out permanently.
--
-- Stored as an Argon2id hash, never in the clear: a recovery code is a
-- credential that resets a password, so a database read must not yield one.
-- Nullable because existing accounts have no code until they issue one.
ALTER TABLE users ADD COLUMN recovery_code_hash TEXT;

-- When the current code was issued, so the UI can say whether one exists and
-- how old it is without revealing the code itself.
ALTER TABLE users ADD COLUMN recovery_code_set_at TEXT;
