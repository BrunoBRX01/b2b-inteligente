/**
 * Banco SQLite local e portátil. Nenhum serviço de banco externo é necessário.
 * As consultas mantêm o contrato [rows] usado pela aplicação anterior.
 */
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const databasePath = resolve(process.env.B2B_DB_PATH || resolve(projectRoot, 'data', 'b2b.sqlite'));
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;');

let locked = false;
const waiters = [];
function acquire() {
  return new Promise((resolveWait) => {
    if (!locked) { locked = true; resolveWait(); }
    else waiters.push(resolveWait);
  });
}
function unlock() {
  const next = waiters.shift();
  if (next) next();
  else locked = false;
}
function runSql(sql, params = []) {
  const stmt = db.prepare(sql);
  if (/^\s*(?:SELECT|WITH|PRAGMA)\b/i.test(sql)) return [stmt.all(...params)];
  const result = stmt.run(...params);
  return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }];
}

export const pool = {
  async query(sql, params = []) { return this.execute(sql, params); },
  async execute(sql, params = []) {
    await acquire();
    try { return runSql(sql, params); }
    finally { unlock(); }
  },
  async getConnection() {
    await acquire();
    let released = false;
    const check = () => { if (released) throw new Error('Conexão já liberada.'); };
    return {
      async beginTransaction() { check(); db.exec('BEGIN IMMEDIATE'); },
      async commit() { check(); db.exec('COMMIT'); },
      async rollback() { check(); if (db.isTransaction) db.exec('ROLLBACK'); },
      async query(sql, params = []) { check(); return runSql(sql, params); },
      async execute(sql, params = []) { check(); return runSql(sql, params); },
      async exec(sql) { check(); db.exec(sql); },
      release() { if (!released) { released = true; unlock(); } }
    };
  }
};

const migrations = [
  { version: '001_initial', url: new URL('../migrations/001_initial.sql', import.meta.url) },
  { version: '002_quote_submission_channel', url: new URL('../migrations/002_quote_submission_channel.sql', import.meta.url) },
  { version: '003_clients_and_shipments', url: new URL('../migrations/003_clients_and_shipments.sql', import.meta.url) },
  { version: '004_ai_agent', url: new URL('../migrations/004_ai_agent.sql', import.meta.url) }
];

export async function migrate() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT NOT NULL PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
    for (const migration of migrations) {
      const [rows] = await connection.execute('SELECT version FROM schema_migrations WHERE version = ?', [migration.version]);
      if (rows.length) continue;
      const sql = await readFile(fileURLToPath(migration.url), 'utf8');
      await connection.exec(sql);
      await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [migration.version]);
      console.log(`Migration aplicada: ${migration.version}`);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

export async function backupDatabase(destinationPath) {
  const target = resolve(destinationPath);
  if (target === databasePath) throw new Error('O backup precisa ter outro caminho.');
  mkdirSync(dirname(target), { recursive: true });
  await acquire();
  try { await sqliteBackup(db, target); }
  finally { unlock(); }
  return target;
}

export async function closeDatabase() {
  await acquire();
  try { db.close(); }
  finally { unlock(); }
}
