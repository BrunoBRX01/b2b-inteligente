import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupDatabase, closeDatabase, migrate } from '../src/db.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const backupDir = resolve(process.env.B2B_BACKUP_DIR || resolve(root, 'backups'));
await mkdir(backupDir, { recursive: true });
const date = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(backupDir, `b2b-backup-${date}.sqlite`);
try {
  await migrate();
  await backupDatabase(output);
  console.log(`Backup concluído: ${output}`);
} catch (error) {
  console.error(`Backup falhou: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
