// Redefine a senha de uma conta existente, direto no computador onde está o banco.
// A senha é digitada sem aparecer na tela e nunca é gravada em texto puro.
//   node --env-file=.env scripts/redefinir-senha.mjs
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { closeDatabase, migrate } from '../src/db.mjs';
import { resetUserPassword } from '../src/password-reset.mjs';

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('Execute este comando em um terminal interativo para digitar a senha com segurança.'));
      return;
    }
    stdout.write(prompt);
    let value = '';
    const onData = (chunk) => {
      for (const key of chunk.toString('utf8')) {
        if (key === '\u0003') { cleanup(); reject(new Error('Operação cancelada.')); return; }
        if (key === '\r' || key === '\n') { cleanup(); stdout.write('\n'); resolve(value); return; }
        if (key === '\u007f' || key === '\b') value = value.slice(0, -1);
        else if (key >= ' ' && key !== '\u001b') value += key;
      }
    };
    const cleanup = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

const rl = readline.createInterface({ input: stdin, output: stdout });
try {
  await migrate();
  const email = (await rl.question('E-mail da conta: ')).trim();
  rl.close();
  const password = await readHidden('Nova senha (mínimo 14 caracteres, não aparece na tela): ');
  const confirmation = await readHidden('Confirme a nova senha: ');
  if (password !== confirmation) throw new Error('As senhas não coincidem. Nada foi alterado.');
  const result = await resetUserPassword(email, password);
  console.log(`\nSenha redefinida para ${result.fullName} <${result.email}>.`);
  if (!result.active) console.log('Atenção: esta conta está DESATIVADA. Peça a um administrador para reativá-la.');
  console.log('Entre em http://127.0.0.1:3000/login com o e-mail e a nova senha.');
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
} finally {
  if (rl.listenerCount('close') === 0) rl.close();
  await closeDatabase().catch(() => {});
}
