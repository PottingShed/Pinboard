-- Everything on the wall: pieces of work (image, video), and comments on them
-- (kind 'comment', with parent_id set to the piece they're about).
CREATE TABLE IF NOT EXISTS pins (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                      -- image | video | comment
  origin TEXT NOT NULL DEFAULT 'studio',   -- studio | case-study | archive (work from the website)
  parent_id TEXT,                          -- set on comments
  src TEXT, thumb TEXT,                    -- file names in R2
  nat_w INTEGER, nat_h INTEGER,
  size TEXT,                               -- s | m | l
  rot REAL NOT NULL DEFAULT 0,             -- unused
  fix TEXT, fix_color TEXT,                -- how it's taped up (fix_color unused)
  title TEXT, text TEXT, color TEXT,
  colors TEXT,                             -- JSON { palette: [{ c, w }] }, worked out in the browser
  author TEXT, studio TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS pins_live ON pins (deleted_at, created_at);
