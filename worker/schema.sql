-- Smile Wall database (Cloudflare D1). The photo tables hold no personal data: the photo
-- itself lives in R2, and the delete token is stored only as a hash.
CREATE TABLE IF NOT EXISTS photos (
  id          TEXT PRIMARY KEY,               -- time-sortable, also the R2 key
  created_at  INTEGER NOT NULL,               -- ms since epoch
  status      TEXT NOT NULL DEFAULT 'visible', -- visible | hidden (auto, after reports)
  reports     INTEGER NOT NULL DEFAULT 0,
  delete_hash TEXT NOT NULL,                  -- SHA-256 of the uploader's delete token
  consent     TEXT NOT NULL                   -- consent notice version the uploader accepted
);
CREATE INDEX IF NOT EXISTS photos_status_id ON photos (status, id);
CREATE INDEX IF NOT EXISTS photos_reports ON photos (reports, id);

-- Running count of visible photos, so the counter never scans the table.
CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, n INTEGER NOT NULL);
INSERT OR IGNORE INTO stats (key, n) VALUES ('visible', 0);

-- The upload queue writes rows in batches; each new row counts itself, in the
-- same transaction. (Hides, restores and deletes adjust the count in the Worker.)
CREATE TRIGGER IF NOT EXISTS photos_count AFTER INSERT ON photos WHEN NEW.status = 'visible'
BEGIN
  UPDATE stats SET n = n + 1 WHERE key = 'visible';
END;

-- Event-update sign-ups (personal data: email and/or mobile number). Kept apart
-- from the photos: the 3 Nov photo wipe leaves this table alone, and the cron
-- empties it once SIGNUPS_DELETE_AT passes. Nothing here links to a photo.
CREATE TABLE IF NOT EXISTS signups (
  id             TEXT PRIMARY KEY,
  created_at     INTEGER NOT NULL,            -- first sign-up, ms since epoch
  consented_at   INTEGER NOT NULL,            -- latest consent, ms since epoch
  email          TEXT,                        -- lower-case
  email_verified INTEGER NOT NULL DEFAULT 0,  -- 1 when it came from Google sign-in
  phone          TEXT,                        -- +91XXXXXXXXXX
  source         TEXT NOT NULL,               -- google | form
  consent        TEXT NOT NULL,               -- sign-up consent version accepted
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS signups_email ON signups (email);
CREATE UNIQUE INDEX IF NOT EXISTS signups_phone ON signups (phone);
