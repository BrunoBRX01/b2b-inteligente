import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

test('redefinição local de senha troca o hash, encerra sessões e registra auditoria', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'b2b-reset-'));
  process.env.B2B_DB_PATH = join(folder, 'b2b.sqlite');
  const { migrate, pool, closeDatabase } = await import('../src/db.mjs');
  const { hashPassword, verifyPassword } = await import('../src/security.mjs');
  const { resetUserPassword } = await import('../src/password-reset.mjs');
  try {
    await migrate();
    const userId = randomUUID();
    await pool.execute('INSERT INTO users (id, email, full_name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [userId, 'pessoa@empresa.com.br', 'Pessoa Teste', await hashPassword('Senha-Antiga-Muito-Longa'), 'admin']);
    await pool.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+8 hours'))", ['digest-teste', userId]);

    await assert.rejects(resetUserPassword('naoexiste@empresa.com.br', 'Senha-Nova-Muito-Longa'), /Nenhuma conta/);
    await assert.rejects(resetUserPassword('pessoa@empresa.com.br', 'curta'), /entre 14 e 128/);

    const result = await resetUserPassword('  Pessoa@Empresa.com.br ', 'Senha-Nova-Muito-Longa');
    assert.equal(result.email, 'pessoa@empresa.com.br');
    assert.equal(result.active, true);

    const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    assert.equal(await verifyPassword('Senha-Nova-Muito-Longa', user.password_hash), true);
    assert.equal(await verifyPassword('Senha-Antiga-Muito-Longa', user.password_hash), false);
    assert.ok(!user.password_hash.includes('Senha-Nova'), 'senha não pode ficar em texto puro');

    const [[{ sessoes }]] = await pool.query('SELECT COUNT(*) AS sessoes FROM sessions WHERE user_id = ?', [userId]);
    assert.equal(sessoes, 0);
    const [[{ auditoria }]] = await pool.query("SELECT COUNT(*) AS auditoria FROM audit_events WHERE action = 'user.password_reset_local' AND target_id = ?", [userId]);
    assert.equal(auditoria, 1);
  } finally {
    await closeDatabase().catch(() => {});
    await rm(folder, { recursive: true, force: true });
  }
});
