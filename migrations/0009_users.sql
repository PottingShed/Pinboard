-- People, signed in with their work Google accounts, and what's theirs.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,       -- as Google has it: "Luke Vidamour"
  first TEXT NOT NULL,      -- what's shown on their work and notes: "Luke"
  picture TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);
ALTER TABLE pins ADD COLUMN user_id TEXT;
ALTER TABLE boards ADD COLUMN user_id TEXT;
CREATE INDEX pins_user ON pins (user_id);
