/**
 * Redefinição de senha feita no próprio computador (sem passar pelo site).
 * Usada por scripts/redefinir-senha.mjs quando ninguém consegue entrar no painel.
 */
import { randomUUID } from 'node:crypto';
import { pool } from './db.mjs';
import { hashPassword, normalizeEmail, validEmail } from './security.mjs';

export async function resetUserPassword(rawEmail, password) {
  const email = normalizeEmail(rawEmail);
  if (!validEmail(email)) throw new Error('E-mail inválido.');
  if (typeof password !== 'string' || password.length < 14 || password.length > 128) {
    throw new Error('A senha deve ter entre 14 e 128 caracteres.');
  }
  const [rows] = await pool.query('SELECT id, full_name, is_active FROM users WHERE email = ? LIMIT 1', [email]);
  const user = rows[0];
  if (!user) throw new Error(`Nenhuma conta encontrada com o e-mail ${email}.`);

  await pool.execute('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [await hashPassword(password), user.id]);
  // Encerra sessões abertas com a senha antiga.
  await pool.execute('DELETE FROM sessions WHERE user_id = ?', [user.id]);
  await pool.execute(
    'INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), null, 'user.password_reset_local', 'user', user.id, JSON.stringify({ via: 'terminal_local' })]
  );
  return { email, fullName: user.full_name, active: Boolean(user.is_active) };
}
