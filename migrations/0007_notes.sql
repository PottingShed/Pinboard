-- Comments show on the wall as sticky notes on their piece. This is where each
-- one sits: its middle, as a share of the piece's width and height (0 to 1).
-- Empty means its own spot by a corner (pieces.js).
ALTER TABLE pins ADD COLUMN ax REAL;
ALTER TABLE pins ADD COLUMN ay REAL;
