import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { randomUUID } from 'node:crypto';
import { closeDatabase, migrate, pool } from '../src/db.mjs';
import { hashPassword, normalizeEmail, validCorporateEmail, validEmail } from '../src/security.mjs';

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('Execute este comando em um terminal interativo para digitar a senha com segurança.'));
      return;
    }
    stdout.write(prompt);
    let value = '';
    const onData = (chunk) => {
      // Processar caractere por caractere permite colar senhas no terminal.
      for (const key of chunk.toString('utf8')) {
        if (key === '\u0003') {
          cleanup();
          reject(new Error('Operação cancelada.'));
          return;
        }
        if (key === '\r' || key === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (key === '\u007f' || key === '\b') value = value.slice(0, -1);
        else if (key >= ' ' && key !== '\u001b') value += key;
      }
    };
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

const rl = readline.createInterface({ input: stdin, output: stdout });
try {
  await migrate();
  const [admins] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
  if (Number(admins[0].count) > 0) throw new Error('Já existe um administrador. Use a área administrativa para criar outras contas.');
  const email = normalizeEmail(await rl.question('E-mail corporativo do administrador: '));
  if (!validEmail(email)) throw new Error('E-mail inválido.');
  if (!validCorporateEmail(email)) throw new Error('O e-mail não pertence a um domínio corporativo autorizado.');
  const fullName = (await rl.question('Nome completo: ')).trim();
  if (fullName.length < 2 || fullName.length > 120) throw new Error('O nome deve ter entre 2 e 120 caracteres.');
  rl.close();
  const password = await readHidden('Senha inicial (mínimo 14 caracteres): ');
  const confirmation = await readHidden('Confirme a senha: ');
  if (password.length < 14 || password.length > 128) throw new Error('A senha deve ter entre 14 e 128 caracteres.');
  if (password !== confirmation) throw new Error('As senhas não coincidem.');
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [adminsAtCommit] = await connection.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (adminsAtCommit.length) throw new Error('Outro administrador foi criado. Use a área administrativa para gerenciar a equipe.');
    await connection.execute(
      'INSERT INTO users (id, email, full_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [randomUUID(), email, fullName, await hashPassword(password), 'admin']
    );
    await connection.commit();
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
  console.log(`Administrador ${email} criado. A senha não foi exibida nem armazenada em texto puro.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (rl.listenerCount('close') === 0) rl.close();
  await closeDatabase().catch(() => {});
}
