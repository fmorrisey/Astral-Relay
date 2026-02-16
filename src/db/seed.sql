INSERT INTO config (key, value) VALUES
  ('version', '1.0.0'),
  ('setup_complete', 'false'),
  ('workspace_path', '/workspace'),
  ('collections', '["blog","photos","adventures","portfolio"]'),
  ('webhook_enabled', 'false'),
  ('webhook_url', ''),
  ('git_sync_enabled', 'false'),
  ('git_branch', 'main');

INSERT INTO migrations (name) VALUES ('001_initial_schema');
