import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { random, hash } from './security.js';

export function openDB(directory) {
  if (directory !== ':memory:') mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(directory === ':memory:' ? directory : join(directory, 'social.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS states (id TEXT PRIMARY KEY, kind TEXT NOT NULL, binding TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, remote_id TEXT NOT NULL, platform TEXT NOT NULL, kind TEXT NOT NULL,
      author TEXT NOT NULL, text TEXT NOT NULL, image TEXT NOT NULL, url TEXT NOT NULL,
      created TEXT NOT NULL, status TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1,
      seen INTEGER NOT NULL, product TEXT NOT NULL DEFAULT '', demo INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, ok INTEGER NOT NULL, message TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_posts_sync ON posts(status, available, demo, seen);
    CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(status, available, demo, created DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_at ON runs(at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
    CREATE INDEX IF NOT EXISTS idx_states_expires ON states(expires);
  `);
  const get = key => { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; };
  const set = (key, value) => db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  if (!get('preferences')) set('preferences', { autoPublish: true, enabled: true });
  return {
    db, get, set,
    session() { const id = random(); db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(id), random(), Date.now() + 8 * 3600_000); return id; },
    state(kind, binding) { const id = random(); db.prepare('INSERT INTO states VALUES (?,?,?,?)').run(hash(id), kind, binding, Date.now() + 600_000); return id; },
    consume(id, kind, binding) {
      const row = db.prepare('DELETE FROM states WHERE id=? AND kind=? AND binding=? AND expires>? RETURNING id').get(hash(id || ''), kind, binding, Date.now());
      return !!row;
    },
    clean() { db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); db.prepare('DELETE FROM states WHERE expires<?').run(Date.now()); },
    clearSocial() { db.exec('DELETE FROM posts; DELETE FROM runs;'); for (const k of ['connection', 'metaPending']) db.prepare('DELETE FROM settings WHERE key=?').run(k); },
    upsert(p) {
      const before = db.prepare('SELECT * FROM posts WHERE id=?').get(p.id);
      const changed = before && (before.text !== p.text || before.author !== p.author);
      const auto = get('preferences').autoPublish;
      const status = before ? (changed && !auto && before.status === 'published' ? 'pending' : before.status) : (auto ? 'published' : 'pending');
      db.prepare(`INSERT INTO posts (id,remote_id,platform,kind,author,text,image,url,created,status,seen,demo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET author=excluded.author,text=excluded.text,
        image=excluded.image,url=excluded.url,status=excluded.status,available=1,seen=excluded.seen`).run(
        p.id, p.remote_id, p.platform, p.kind, p.author, p.text, p.image, p.url, p.created, status, Date.now(), p.demo ? 1 : 0);
    },
    feed({ platform = 'all', product = '', limit = 12, demo = false } = {}) {
      if (!get('preferences').enabled) return [];
      return db.prepare(`SELECT id,platform,kind,author,text,image,url,created,product,demo FROM posts
        WHERE status='published' AND available=1 AND seen>? AND demo=?
        AND (?='all' OR platform=?) AND (?='' OR product=?) ORDER BY created DESC LIMIT ?`).all(
        Date.now() - 48 * 3600_000, demo ? 1 : 0, platform, platform, product, product, Math.min(48, Math.max(1, limit)));
    },
    run(ok, message) { db.prepare('INSERT INTO runs (at,ok,message) VALUES (?,?,?)').run(Date.now(), ok ? 1 : 0, message); db.exec('DELETE FROM runs WHERE id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT 50)'); },
  };
}
