import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
async function freePort() {
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port;
  await new Promise((ok) => srv.close(ok));
  return port;
}

async function waitForServer(base, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Servidor terminou com ${child.exitCode}`);
    try { const response = await fetch(`${base}/healthz`); if (response.ok) return; } catch { /* aguardar */ }
    await new Promise((ok) => setTimeout(ok, 80));
  }
  throw new Error('Servidor não respondeu ao healthz.');
}

test('integração HTTP: login, cotação, gestão, persistência, backup e segurança', { timeout: 30000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'b2b-local-'));
  const dbPath = join(folder, 'b2b.sqlite');
  const env = { ...process.env, B2B_DB_PATH: dbPath, COOKIE_TRANSPORT: 'http-local', B2B_BACKUP_DIR: join(folder, 'backups'), HOST: '127.0.0.1', PORT: String(await freePort()), AI_PROVIDER: 'off', AI_AUTOPILOT: 'off' };
  const base = `http://127.0.0.1:${env.PORT}`;
  let child;
  try {
    process.env.B2B_DB_PATH = dbPath;
    const { migrate, pool, closeDatabase } = await import('../src/db.mjs');
    const { hashPassword } = await import('../src/security.mjs');
    await migrate();
    const adminId = randomUUID();
    await pool.execute('INSERT INTO users (id, email, full_name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [adminId, 'admin@empresa.com.br', 'Admin de Teste', await hashPassword('Senha-Longa-Segura-2026'), 'admin']);
    await closeDatabase();

    child = spawn(process.execPath, ['src/server.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
    await waitForServer(base, child);

    let response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /B2B Inteligente/i);
    response = await fetch(`${base}/assets/site.css`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/css/);
    response = await fetch(`${base}/private/users.html`);
    assert.equal(response.status, 404);
    response = await fetch(`${base}/api/admin/users`);
    assert.equal(response.status, 401);
    response = await fetch(`${base}/internal`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/login');

    response = await fetch(`${base}/api/csrf`);
    assert.equal(response.status, 200);
    const csrf = (await response.json()).token;
    const csrfCookie = response.headers.get('set-cookie').split(';')[0];
    const post = async (path, body, session = '') => fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, cookie: `${csrfCookie}${session ? '; ' + session : ''}` },
      body: JSON.stringify(body)
    });
    response = await fetch(`${base}/api/public/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 403);
    response = await post('/api/auth/login', { email: 'admin@empresa.com.br', password: 'senha-errada' });
    assert.equal(response.status, 401);
    response = await post('/api/auth/login', { email: 'admin@empresa.com.br', password: 'Senha-Longa-Segura-2026' });
    assert.equal(response.status, 200, errors);
    const session = response.headers.get('set-cookie').split(';')[0];
    assert.match(session, /^b2b_session=/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/);

    response = await fetch(`${base}/api/auth/me`, { headers: { cookie: session } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user.role, 'admin');
    response = await fetch(`${base}/internal/users`, { headers: { cookie: session } });
    assert.equal(response.status, 200);

    const quote = {
      contactName: 'Cliente Teste', companyName: 'Empresa Importadora', email: 'contato@importadora.com.br',
      phone: '65999999999', originCountry: 'China', productSummary: 'Equipamentos',
      estimatedVolume: '2 pallets', destination: 'Cuiabá', details: 'Teste', submissionChannel: 'chatbot'
    };
    response = await post('/api/public/quote', quote);
    assert.equal(response.status, 201, errors);
    const quoteId = (await response.json()).requestId;
    response = await fetch(`${base}/api/internal/requests`, { headers: { cookie: session } });
    assert.equal(response.status, 200);
    const requests = (await response.json()).requests;
    assert.equal(requests[0].id, quoteId);
    assert.equal(requests[0].submissionChannel, 'chatbot');

    response = await fetch(`${base}/api/internal/requests/${quoteId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, cookie: `${csrfCookie}; ${session}` },
      body: JSON.stringify({ status: 'reviewing' })
    });
    assert.equal(response.status, 200, errors);

    const user = { email: 'funcionario@empresa.com.br', fullName: 'Funcionário de Teste', role: 'employee', password: 'Outra-Senha-Forte-2026' };
    response = await post('/api/admin/users', user, session);
    assert.equal(response.status, 201, errors);
    response = await post('/api/admin/users', user, session);
    assert.equal(response.status, 409, 'e-mail duplicado deve ser 409');
    response = await fetch(`${base}/api/admin/users`, { headers: { cookie: session } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).users.length, 2);
    response = await post('/api/auth/login', { email: user.email, password: user.password });
    assert.equal(response.status, 200);
    const employeeSession = response.headers.get('set-cookie').split(';')[0];
    response = await fetch(`${base}/api/admin/users`, { headers: { cookie: employeeSession } });
    assert.equal(response.status, 403);
    response = await fetch(`${base}/internal/users`, { headers: { cookie: employeeSession }, redirect: 'manual' });
    assert.equal(response.status, 302);
    response = await fetch(`${base}/api/internal/requests`, { headers: { cookie: employeeSession } });
    assert.equal(response.status, 200);

    response = await fetch(`${base}/api/admin/users/${adminId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, cookie: `${csrfCookie}; ${session}` },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(response.status, 400);

    response = await post('/api/public/chatbot', { messages: [{ role: 'user', content: 'Como solicitar uma cotação?' }] });
    assert.equal(response.status, 200);
    assert.match((await response.json()).answer, /cotação/i);

    response = await post('/api/auth/logout', {}, session);
    assert.equal(response.status, 200);
    response = await fetch(`${base}/api/auth/me`, { headers: { cookie: session } });
    assert.equal(response.status, 401);

    // Backup online: a API oficial cria snapshot mesmo com o servidor aberto.
    const backup = spawn(process.execPath, ['scripts/backup.mjs'], { cwd: root, env, stdio: 'pipe' });
    let output = '';
    backup.stdout.on('data', (data) => { output += data; });
    const backupExit = await new Promise((ok) => backup.once('exit', ok));
    assert.equal(backupExit, 0, 'backup deve terminar com sucesso');
    assert.match(output, /Backup concluído/);
    const backupFiles = await readdir(env.B2B_BACKUP_DIR);
    assert.ok(backupFiles.some((name) => name.endsWith('.sqlite')));
    const { DatabaseSync: SnapshotDb } = await import('node:sqlite');
    const snapshot = new SnapshotDb(join(env.B2B_BACKUP_DIR, backupFiles.find((name) => name.endsWith('.sqlite'))), { readOnly: true });
    assert.equal(snapshot.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
    assert.equal(snapshot.prepare('SELECT status FROM quote_requests WHERE id = ?').get(quoteId).status, 'reviewing');
    assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    snapshot.close();

    // O banco é um único arquivo e os dados sobrevivem ao encerramento do servidor.
    child.kill('SIGTERM');
    await new Promise((ok) => child.once('exit', ok));
    child = undefined;
    const { DatabaseSync } = await import('node:sqlite');
    const verifyDb = new DatabaseSync(dbPath, { readOnly: true });
    assert.equal(verifyDb.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
    assert.equal(verifyDb.prepare('SELECT status FROM quote_requests WHERE id = ?').get(quoteId).status, 'reviewing');
    assert.equal(verifyDb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(verifyDb.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n, 2);
    verifyDb.close();


  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((ok) => child.once('exit', ok));
    }
    await rm(folder, { recursive: true, force: true });
    delete process.env.B2B_DB_PATH;
  }
});
