import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';

/**
 * Banco 100% local (arquivo SQLite).
 * Toda a persistência do checkout, upsells, pixels e pedidos fica aqui.
 *
 * A conexão é um singleton em globalThis para sobreviver ao hot-reload do Next.
 */

const g = globalThis as unknown as { __vegaDb?: Database.Database };

function resolveDbFile(): string {
  const file = process.env.DATABASE_FILE || './data/vega.db';
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

function open(): Database.Database {
  const db = new Database(resolveDbFile());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA_SQL);
  return db;
}

export function getDb(): Database.Database {
  if (!g.__vegaDb) g.__vegaDb = open();
  return g.__vegaDb;
}

/** SELECT que retorna várias linhas. */
export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}

/** SELECT que retorna uma linha (ou undefined). */
export function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...(params as never[])) as T | undefined;
}

/** INSERT / UPDATE / DELETE. */
export function run(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).run(...(params as never[]));
}

/** Executa em transação. */
export function tx<T>(fn: () => T): T {
  const db = getDb();
  const wrapped = db.transaction(fn);
  return wrapped();
}

/** Marca uma chave como já processada. Retorna false se já existia (evento duplicado). */
export function claimIdempotency(key: string): boolean {
  try {
    run('INSERT INTO idempotency (key) VALUES (?)', [key]);
    return true;
  } catch {
    return false;
  }
}

export function getSetting(key: string, fallback = ''): string {
  const row = one<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, value],
  );
}

export function getJsonSetting<T>(key: string, fallback: T): T {
  const raw = getSetting(key, '');
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJsonSetting(key: string, value: unknown) {
  setSetting(key, JSON.stringify(value));
}
