-- Private work is for the studio only: it never shows in hands-free (TV) mode.
ALTER TABLE pins ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
