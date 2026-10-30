-- What a piece is, and so who it's for:
--   public  our work, fine for anyone to see (on the TVs)
--   wip     work in progress, for the studio only (never on the TVs)
--   inspo   work we love that we didn't make (not on the TVs)
--   social  life at Potting Shed: socials, snapshots (on the TVs)
-- It takes over from the private flag and the 'inspiration' origin, which
-- stay in the table unused.
ALTER TABLE pins ADD COLUMN type TEXT NOT NULL DEFAULT 'public';
UPDATE pins SET type = CASE WHEN origin = 'inspiration' THEN 'inspo' WHEN private = 1 THEN 'wip' ELSE 'public' END;
UPDATE pins SET origin = 'studio' WHERE origin = 'inspiration';
