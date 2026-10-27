-- Boards: collections anyone in the studio can make, add to and share.
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- What's on each board, who saved it there and when.
CREATE TABLE board_pins (
  board_id TEXT NOT NULL,
  pin_id TEXT NOT NULL,
  added_by TEXT,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, pin_id)
);
CREATE INDEX board_pins_by_pin ON board_pins (pin_id);
