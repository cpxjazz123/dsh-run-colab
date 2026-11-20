-- Accounts and sessions for the panel.
--
-- password_hash is NULL for Google-only accounts. google_sub is the OAuth
-- subject id; it is NULL until that account links Google. SESSION ids hold the
-- SHA-256 of the cookie token, so a leaked table cannot mint a session.

CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL COLLATE NOCASE UNIQUE,
	name TEXT NOT NULL DEFAULT '',
	picture TEXT NOT NULL DEFAULT '',
	password_hash TEXT,
	google_sub TEXT UNIQUE,
	created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
