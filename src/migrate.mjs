import { closeDatabase, migrate, pool } from './db.mjs';

try {
  await migrate();
  console.log('Migration inicial aplicada com sucesso.');
} catch (error) {
  console.error('Falha ao aplicar migration:', error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}
