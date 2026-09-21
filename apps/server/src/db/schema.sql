-- Mesa Elections — authoritative schema.
--
-- Two record families that deliberately share no key:
--   * attributable  (voters, vote_receipts)  — "did this person vote?"
--   * anonymous     (ballots, ballot_selections) — "what did the electorate choose?"
-- There is no voter reference on a ballot, anywhere. The "who voted for whom"
-- query is not forbidden by policy; it is unwritable. See docs/data-model.md §2.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------- voters ---
CREATE TABLE IF NOT EXISTS voters (
  id               TEXT PRIMARY KEY,
  election_id      TEXT NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  email_norm       TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('student', 'employee')),
  house_id         TEXT,
  access_code_hash TEXT,
  access_code_salt TEXT,
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TEXT,
  has_voted        INTEGER NOT NULL DEFAULT 0 CHECK (has_voted IN (0, 1)),
  voted_at         TEXT,
  UNIQUE (election_id, email_norm)
);

CREATE INDEX IF NOT EXISTS voters_election_type ON voters (election_id, type);

-- A hard uniqueness constraint on participation, independent of `has_voted`.
-- Two mechanisms, either of which alone prevents a double vote.
CREATE TABLE IF NOT EXISTS vote_receipts (
  voter_id    TEXT PRIMARY KEY REFERENCES voters (id),
  election_id TEXT NOT NULL,
  receipt_id  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL
);

-- --------------------------------------------------------------- ballots ---
CREATE TABLE IF NOT EXISTS ballots (
  id             TEXT PRIMARY KEY,           -- random UUID, never a sequence
  election_id    TEXT NOT NULL,
  voter_type     TEXT NOT NULL CHECK (voter_type IN ('student', 'employee')),
  submitted_hour TEXT NOT NULL,              -- hour-bucketed on purpose
  config_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ballots_election_type ON ballots (election_id, voter_type);

CREATE TABLE IF NOT EXISTS ballot_selections (
  ballot_id    TEXT NOT NULL REFERENCES ballots (id),
  position_id  TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  PRIMARY KEY (ballot_id, position_id)       -- one selection per position, structurally
);

CREATE INDEX IF NOT EXISTS ballot_selections_tally
  ON ballot_selections (position_id, candidate_id);

-- -------------------------------------------------------------- sessions ---
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  token_hash      TEXT NOT NULL UNIQUE,      -- the raw token is never stored
  voter_id        TEXT NOT NULL REFERENCES voters (id),
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  revoked_at      TEXT,
  ip_hash         TEXT,
  user_agent_hash TEXT
);

CREATE INDEX IF NOT EXISTS sessions_voter ON sessions (voter_id);

-- OAuth state + PKCE verifier for the Entra flow. Single use, short lived.
CREATE TABLE IF NOT EXISTS auth_requests (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  consumed_at   TEXT
);

-- One-time handoff codes for the Entra redirect flow. The session token is
-- never placed in a URL (browser history, referrer headers, proxy logs); the
-- SPA exchanges this short-lived code for it over POST instead.
CREATE TABLE IF NOT EXISTS handoff_codes (
  code        TEXT PRIMARY KEY,
  voter_id    TEXT NOT NULL REFERENCES voters (id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT
);

-- ----------------------------------------------------------- idempotency ---
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT PRIMARY KEY,
  voter_id      TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('in_flight', 'completed')),
  response_code INTEGER,
  response_body TEXT,
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------- outbox ---
CREATE TABLE IF NOT EXISTS outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,
  dedupe_key      TEXT NOT NULL UNIQUE,
  payload         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_flight', 'synced', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error      TEXT,
  created_at      TEXT NOT NULL,
  synced_at       TEXT
);

CREATE INDEX IF NOT EXISTS outbox_claim ON outbox (status, next_attempt_at);

-- ------------------------------------------------------------- audit log ---
-- Append-only and hash-chained: each row commits to its predecessor, so editing
-- or removing any historical row invalidates every hash after it.
CREATE TABLE IF NOT EXISTS audit_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  event      TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('voter', 'admin', 'system')),
  actor_id   TEXT,
  subject_id TEXT,
  metadata   TEXT,                            -- NEVER selections, NEVER secrets
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_event ON audit_log (event, at);

-- ---------------------------------------------------- immutability guards ---
-- These stop an accidental migration, a stray admin script, or a careless
-- future change from rewriting history. They do not defend against an operator
-- who can drop them; that limit is stated in docs/security-model.md §8.
CREATE TRIGGER IF NOT EXISTS ballots_no_update BEFORE UPDATE ON ballots
  BEGIN SELECT RAISE(ABORT, 'ballots are immutable'); END;
CREATE TRIGGER IF NOT EXISTS ballots_no_delete BEFORE DELETE ON ballots
  BEGIN SELECT RAISE(ABORT, 'ballots are immutable'); END;

CREATE TRIGGER IF NOT EXISTS ballot_selections_no_update BEFORE UPDATE ON ballot_selections
  BEGIN SELECT RAISE(ABORT, 'ballot selections are immutable'); END;
CREATE TRIGGER IF NOT EXISTS ballot_selections_no_delete BEFORE DELETE ON ballot_selections
  BEGIN SELECT RAISE(ABORT, 'ballot selections are immutable'); END;

CREATE TRIGGER IF NOT EXISTS vote_receipts_no_update BEFORE UPDATE ON vote_receipts
  BEGIN SELECT RAISE(ABORT, 'vote receipts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS vote_receipts_no_delete BEFORE DELETE ON vote_receipts
  BEGIN SELECT RAISE(ABORT, 'vote receipts are immutable'); END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'the audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'the audit log is append-only'); END;

-- A voter may never be un-voted. Re-enfranchising someone is a deliberate
-- administrative act that must go through a documented reset, not an UPDATE.
CREATE TRIGGER IF NOT EXISTS voters_no_unvote BEFORE UPDATE OF has_voted ON voters
  WHEN OLD.has_voted = 1 AND NEW.has_voted = 0
  BEGIN SELECT RAISE(ABORT, 'a cast vote cannot be withdrawn'); END;
