// Cria um administrador de teste para uso local e grava as credenciais em
// CREDENCIAIS_ADMIN.local.txt (ignorado pelo git). Não roda se já houver admin.
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closeDatabase, migrate, pool } from '../src/db.mjs';
import { hashPassword } from '../src/security.mjs';

const email = 'admin@b2b-inteligente.test';
const fullName = 'Administrador Local';
const password = randomBytes(15).toString('base64url'); // 20 caracteres
const outFile = fileURLToPath(new URL('../CREDENCIAIS_ADMIN.local.txt', import.meta.url));

try {
  await migrate();
  const [admins] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
  if (Number(admins[0].count) > 0) throw new Error('Já existe um administrador.');
  await pool.execute(
    'INSERT INTO users (id, email, full_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    [randomUUID(), email, fullName, await hashPassword(password), 'admin']
  );
  writeFileSync(outFile, `Login do painel: http://127.0.0.1:3000/login\nE-mail: ${email}\nSenha:  ${password}\n`, { mode: 0o600 });
  console.log(`Administrador criado. Credenciais em ${outFile}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}
