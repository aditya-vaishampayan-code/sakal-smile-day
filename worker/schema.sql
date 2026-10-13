-- Smile Wall database (Cloudflare D1). Holds no personal data: the photo
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
