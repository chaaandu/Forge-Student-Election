import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

const SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));

/**
 * Open the authoritative store.
 *
 * WAL + `busy_timeout` is the whole concurrency strategy: readers never block,
 * writers are serialised, and a competing writer waits rather than failing.
 * `BEGIN IMMEDIATE` (see `transaction()`) then gives ballot submission an
 * exclusive write lock for its entire duration, which is what makes the
 * one-vote guarantee provable rather than probabilistic.
 */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  // Durability over throughput: an election has at most a few hundred writes,
  // and a vote that survives the response but not a power cut is not a vote.
  db.pragma('synchronous = FULL');

  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

/**
 * Run `fn` inside an IMMEDIATE transaction.
 *
 * IMMEDIATE (rather than better-sqlite3's default DEFERRED) acquires the write
 * lock up front. Without it, a transaction that reads first and writes later can
 * find its lock upgrade refused mid-flight under contention — exactly the race
 * this system must not have.
 */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The transaction was already rolled back by SQLite; the original error wins.
    }
    throw error;
  }
}

export function getMeta(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
