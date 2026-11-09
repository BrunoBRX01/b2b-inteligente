// Cria contas de administrador de teste para a equipe (uso local) e acrescenta
// as credenciais em CREDENCIAIS_ADMIN.local.txt (ignorado pelo git).
//   node --env-file=.env scripts/seed-team-local.mjs "Nome Completo:email@dominio" "Outra Pessoa:outro@dominio"
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closeDatabase, migrate, pool } from '../src/db.mjs';
import { hashPassword } from '../src/security.mjs';

const team = process.argv.slice(2).map((arg) => {
  const i = arg.lastIndexOf(':');
  return { fullName: arg.slice(0, i).trim(), email: arg.slice(i + 1).trim().toLowerCase() };
}).filter((m) => m.fullName && m.email.includes('@'));
if (!team.length) {
  console.error('Informe as pessoas: "Nome Completo:email@dominio" ...');
  process.exit(1);
}
const outFile = fileURLToPath(new URL('../CREDENCIAIS_ADMIN.local.txt', import.meta.url));

try {
  await migrate();
  for (const { email, fullName } of team) {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) { console.log(`${email} já existe, ignorado.`); continue; }
    const password = randomBytes(15).toString('base64url');
    await pool.execute(
      'INSERT INTO users (id, email, full_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [randomUUID(), email, fullName, await hashPassword(password), 'admin']
    );
    appendFileSync(outFile, `\n${fullName} (admin)\nE-mail: ${email}\nSenha:  ${password}\n`, { mode: 0o600 });
    console.log(`Conta criada: ${fullName} <${email}>`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}
