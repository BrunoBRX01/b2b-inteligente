// Copia o banco atual (com segurança, mesmo com o servidor rodando) para o
// repositório PRIVADO de dados e envia ao GitHub.
//
//   node --env-file=.env scripts/salvar-banco-github.mjs
//
// A pasta do repositório de dados é, por padrão, "b2b-inteligente-dados" ao
// lado da pasta do projeto. Para mudar, defina B2B_DATA_REPO no .env.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupDatabase, closeDatabase } from '../src/db.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(process.env.B2B_DATA_REPO || resolve(projectRoot, '..', 'b2b-inteligente-dados'));
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

try {
  if (!existsSync(resolve(repo, '.git'))) throw new Error(`Repositório de dados não encontrado em ${repo}. Clone-o com: gh repo clone <seu-usuario>/b2b-inteligente-dados`);
  await backupDatabase(resolve(repo, 'b2b.sqlite'));
  git('add', 'b2b.sqlite');
  if (!git('status', '--porcelain')) {
    console.log('O banco não mudou desde o último envio.');
  } else {
    const stamp = new Date().toLocaleString('pt-BR');
    git('commit', '-m', `Banco atualizado em ${stamp}`);
    git('push');
    console.log(`Banco enviado ao repositório privado (${stamp}).`);
  }
} catch (error) {
  console.error('Falha ao salvar o banco:', error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase().catch(() => {});
}
