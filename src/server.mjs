import express, { rateLimit } from './http.mjs';
import { randomUUID, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase, migrate, pool } from './db.mjs';
import {
  clearSessionCookie, createCsrfToken, hashPassword, normalizeEmail, opaqueToken,
  parseCookies, setCsrfCookie, setSessionCookie, tokenDigest, validCsrf,
  validCorporateEmail, validEmail, verifyPassword
} from './security.mjs';
import { runAgent } from './ai/agent.mjs';
import { aiAvailable, aiModel, ensureOllama } from './ai/ollama.mjs';
import { runTask, startAutopilot, taskStatus, TASKS } from './ai/autopilot.mjs';
import { answerPublicAssistant } from './public-assistant.mjs';
import { notifyOwnerOfNewRequest } from './notifications.mjs';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const publicDir = resolve(rootDir, 'public');
const privateDir = resolve(rootDir, 'private');
const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_HOURS = 12;
let dummyPasswordHash;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.static(publicDir, {
  dotfiles: 'deny',
  index: 'index.html',
  maxAge: 0,
  setHeaders(res) { res.set('Cache-Control', 'no-cache'); }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } });
const quoteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Limite de solicitações atingido. Tente novamente mais tarde.' } });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false, message: { error: 'Limite de mensagens atingido. Tente novamente em instantes.' } });
const publicChatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Você enviou muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente.' } });

function currentUser(req) {
  if (req.currentUserPromise) return req.currentUserPromise;
  req.currentUserPromise = (async () => {
    const token = parseCookies(req.headers.cookie).b2b_session;
    if (!token || token.length > 100) return null;
    const [rows] = await pool.execute(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1 LIMIT 1`,
      [tokenDigest(token)]
    );
    return rows[0] || null;
  })();
  return req.currentUserPromise;
}

function requireUser(handler) {
  return async (req, res, next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({ error: 'Acesso não autenticado.' });
      req.user = user;
      return handler(req, res, next);
    } catch (error) { return next(error); }
  };
}

function requireAdmin(handler) {
  return requireUser((req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores.' });
    return handler(req, res, next);
  });
}

function requireCsrf(req, res, next) {
  if (!validCsrf(req)) return res.status(403).json({ error: 'Verificação de segurança falhou. Atualize a página e tente novamente.' });
  return next();
}

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function audit(connection, actorId, action, targetType, targetId, details = {}) {
  await connection.execute(
    'INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), actorId || null, action, targetType, targetId || null, JSON.stringify(details)]
  );
}

app.get('/healthz', (_req, res) => res.status(200).type('text/plain').send('ok'));
app.get('/api/csrf', (_req, res) => {
  const token = createCsrfToken();
  setCsrfCookie(res, token);
  res.set('Cache-Control', 'no-store');
  res.json({ token });
});

app.post('/api/auth/login', loginLimiter, requireCsrf, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!validEmail(email) || password.length > 256) return res.status(400).json({ error: 'Informe e-mail e senha válidos.' });
    if (!validCorporateEmail(email)) {
      await verifyPassword(password, dummyPasswordHash);
      return res.status(401).json({ error: 'E-mail ou senha incorretos, ou conta desativada.' });
    }
    const [rows] = await pool.execute(
      'SELECT id, email, full_name, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    const user = rows[0];
    const passwordOk = await verifyPassword(password, user?.password_hash || dummyPasswordHash);
    if (!user || !user.is_active || !passwordOk) return res.status(401).json({ error: 'E-mail ou senha incorretos, ou conta desativada.' });

    await pool.execute('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    const token = opaqueToken();
    await pool.execute(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' hours'))",
      [tokenDigest(token), user.id, SESSION_TTL_HOURS]
    );
    await pool.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    setSessionCookie(res, token);
    res.set('Cache-Control', 'no-store');
    return res.json({ user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role }, redirect: '/internal' });
  } catch (error) { return next(error); }
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const user = await currentUser(req);
    res.set('Cache-Control', 'no-store');
    if (!user) return res.status(401).json({ error: 'Acesso não autenticado.' });
    return res.json({ user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role } });
  } catch (error) { return next(error); }
});

app.post('/api/auth/logout', requireCsrf, async (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie).b2b_session;
    if (token) await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenDigest(token)]);
    clearSessionCookie(res);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, redirect: '/login' });
  } catch (error) { return next(error); }
});

app.post('/api/public/quote', quoteLimiter, requireCsrf, async (req, res, next) => {
  try {
    const data = {
      contactName: text(req.body?.contactName, 120),
      companyName: text(req.body?.companyName, 160),
      email: normalizeEmail(text(req.body?.email, 254)),
      phone: text(req.body?.phone, 40),
      originCountry: text(req.body?.originCountry, 100),
      productSummary: text(req.body?.productSummary, 240),
      estimatedVolume: text(req.body?.estimatedVolume, 120),
      destination: text(req.body?.destination, 120),
      details: text(req.body?.details, 2000)
    };
    const requestedChannel = req.body?.submissionChannel;
    if (requestedChannel !== undefined && !['website_form', 'chatbot'].includes(requestedChannel)) {
      return res.status(400).json({ error: 'Canal de origem inválido.' });
    }
    const submissionChannel = requestedChannel || 'website_form';
    if (data.contactName.length < 2 || data.companyName.length < 2 || !validEmail(data.email) || data.phone.length < 7 || data.originCountry.length < 2 || data.productSummary.length < 2 || data.destination.length < 2) {
      return res.status(400).json({ error: 'Confira os campos obrigatórios e informe um e-mail válido.' });
    }
    const id = randomUUID();
    await pool.execute(
      `INSERT INTO quote_requests
       (id, contact_name, company_name, email, phone, origin_country, product_summary, estimated_volume, destination, details, submission_channel)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.contactName, data.companyName, data.email, data.phone, data.originCountry, data.productSummary, data.estimatedVolume || null, data.destination, data.details || null, submissionChannel]
    );
    void notifyOwnerOfNewRequest({ id, companyName: data.companyName, productSummary: data.productSummary, submissionChannel })
      .catch((error) => console.error('Aviso ao proprietário não enviado:', error.message));
    return res.status(201).json({ ok: true, requestId: id, message: 'Solicitação recebida. Nossa equipe poderá entrar em contato pelos dados informados.' });
  } catch (error) { return next(error); }
});

app.get('/api/internal/requests', requireUser(async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, contact_name AS contactName, company_name AS companyName, email, phone,
              origin_country AS originCountry, product_summary AS productSummary,
              estimated_volume AS estimatedVolume, destination, details, submission_channel AS submissionChannel, status, created_at AS createdAt, ai_notes AS aiNotes
       FROM quote_requests ORDER BY created_at DESC LIMIT 200`
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ requests: rows });
  } catch (error) { return next(error); }
}));

app.patch('/api/internal/requests/:id', requireCsrf, requireUser(async (req, res, next) => {
  const status = text(req.body?.status, 20);
  if (!['new', 'reviewing', 'contacted', 'closed'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('UPDATE quote_requests SET status = ? WHERE id = ?', [status, req.params.id]);
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }
    await audit(connection, req.user.id, 'quote.status_changed', 'quote_request', req.params.id, { status });
    await connection.commit();
    return res.json({ ok: true });
  } catch (error) {
    await connection.rollback().catch(() => {});
    return next(error);
  } finally { connection.release(); }
}));

function queryParams(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

const SHIPMENT_FIELDS = `s.id, s.code, s.status, s.ordered_at AS orderedAt, s.eta, s.delivered_at AS deliveredAt,
  s.origin_country AS originCountry, s.origin_port AS originPort, s.destination_port AS destinationPort,
  s.destination_city AS destinationCity, s.transport_mode AS transportMode, s.incoterm, s.product_description AS product,
  s.ncm, s.weight_kg AS weightKg, s.containers, s.goods_value_usd AS goodsValueUsd,
  s.freight_brl + s.service_fee_brl AS revenueBrl`;

app.get('/api/internal/dashboard', requireUser(async (req, res, next) => {
  try {
    const days = [7, 30, 90, 365].includes(Number(queryParams(req).get('days'))) ? Number(queryParams(req).get('days')) : 30;
    const since = `-${days} days`;
    const [[kpis]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(status = 'delivered') AS delivered,
              SUM(status = 'delayed') AS delayed,
              SUM(status IN ('pending', 'in_transit', 'customs')) AS open,
              SUM(status = 'cancelled') AS cancelled,
              ROUND(COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN freight_brl + service_fee_brl END), 0), 2) AS revenueBrl,
              ROUND(COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN goods_value_usd END), 0), 2) AS goodsValueUsd,
              COUNT(DISTINCT client_id) AS activeClients
       FROM shipments WHERE ordered_at >= datetime('now', ?)`, [since]
    );
    const [[current]] = await pool.query(
      `SELECT SUM(status = 'delayed') AS delayed, SUM(status IN ('pending', 'in_transit', 'customs')) AS open FROM shipments`
    );
    const [series] = await pool.query(
      `WITH RECURSIVE d(day) AS (SELECT date('now', ?) UNION ALL SELECT date(day, '+1 day') FROM d WHERE day < date('now'))
       SELECT d.day,
              (SELECT COUNT(*) FROM shipments WHERE date(ordered_at) = d.day) AS received,
              (SELECT COUNT(*) FROM shipments WHERE date(delivered_at) = d.day) AS delivered
       FROM d`, [`-${days - 1} days`]
    );
    const [byStatus] = await pool.query(
      `SELECT status, COUNT(*) AS count FROM shipments WHERE ordered_at >= datetime('now', ?) GROUP BY status`, [since]
    );
    const [topClients] = await pool.query(
      `SELECT c.id, c.trade_name AS name, c.segment, COUNT(*) AS shipments,
              ROUND(SUM(s.freight_brl + s.service_fee_brl), 2) AS revenueBrl
       FROM shipments s JOIN clients c ON c.id = s.client_id
       WHERE s.ordered_at >= datetime('now', ?) AND s.status <> 'cancelled'
       GROUP BY c.id ORDER BY revenueBrl DESC LIMIT 5`, [since]
    );
    const [recent] = await pool.query(
      `SELECT ${SHIPMENT_FIELDS}, c.id AS clientId, c.trade_name AS clientName
       FROM shipments s JOIN clients c ON c.id = s.client_id
       WHERE s.ordered_at >= datetime('now', ?) ORDER BY s.ordered_at DESC LIMIT 300`, [since]
    );
    const [[clientStats]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(status = 'active') AS active, SUM(status = 'prospect') AS prospects FROM clients`
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ days, kpis, current, series, byStatus, topClients, recent, clientStats });
  } catch (error) { return next(error); }
}));

app.get('/api/internal/clients', requireUser(async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.trade_name AS tradeName, c.legal_name AS legalName, c.cnpj, c.segment,
              c.company_size AS companySize, c.city, c.state, c.status, c.rating, c.client_since AS clientSince,
              u.full_name AS accountManager,
              (SELECT full_name FROM client_contacts WHERE client_id = c.id AND is_primary = 1 LIMIT 1) AS primaryContact,
              (SELECT email FROM client_contacts WHERE client_id = c.id AND is_primary = 1 LIMIT 1) AS primaryEmail,
              COUNT(s.id) AS shipments,
              ROUND(COALESCE(SUM(CASE WHEN s.status <> 'cancelled' THEN s.freight_brl + s.service_fee_brl END), 0), 2) AS revenueBrl,
              MAX(s.ordered_at) AS lastShipmentAt
       FROM clients c
       LEFT JOIN users u ON u.id = c.account_manager_id
       LEFT JOIN shipments s ON s.client_id = c.id
       GROUP BY c.id ORDER BY revenueBrl DESC`
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ clients: rows });
  } catch (error) { return next(error); }
}));

app.get('/api/internal/clients/:id', requireUser(async (req, res, next) => {
  try {
    const [[client]] = await pool.query(
      `SELECT c.id, c.code, c.legal_name AS legalName, c.trade_name AS tradeName, c.cnpj,
              c.state_registration AS stateRegistration, c.segment, c.company_size AS companySize, c.employees,
              c.annual_revenue_brl AS annualRevenueBrl, c.credit_limit_brl AS creditLimitBrl,
              c.payment_terms_days AS paymentTermsDays, c.street, c.number, c.district, c.city, c.state,
              c.zip_code AS zipCode, c.website, c.phone, c.email, c.status, c.rating, c.nps_score AS npsScore,
              c.lead_source AS leadSource, c.notes, c.client_since AS clientSince, u.full_name AS accountManager
       FROM clients c LEFT JOIN users u ON u.id = c.account_manager_id WHERE c.id = ?`, [req.params.id]
    );
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const [contacts] = await pool.query(
      `SELECT full_name AS fullName, job_title AS jobTitle, department, email, phone, mobile, is_primary AS isPrimary
       FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, full_name`, [req.params.id]
    );
    const [[summary]] = await pool.query(
      `SELECT COUNT(*) AS shipments, SUM(status = 'delivered') AS delivered, SUM(status = 'delayed') AS delayed,
              SUM(status IN ('pending', 'in_transit', 'customs')) AS open,
              ROUND(COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN freight_brl + service_fee_brl END), 0), 2) AS revenueBrl,
              ROUND(COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN goods_value_usd END), 0), 2) AS goodsValueUsd
       FROM shipments WHERE client_id = ?`, [req.params.id]
    );
    const [shipments] = await pool.query(
      `SELECT ${SHIPMENT_FIELDS} FROM shipments s WHERE s.client_id = ? ORDER BY s.ordered_at DESC LIMIT 25`, [req.params.id]
    );
    const [interactions] = await pool.query(
      `SELECT i.kind, i.summary, i.occurred_at AS occurredAt, u.full_name AS userName
       FROM client_interactions i LEFT JOIN users u ON u.id = i.user_id
       WHERE i.client_id = ? ORDER BY i.occurred_at DESC LIMIT 15`, [req.params.id]
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ client, contacts, summary, shipments, interactions });
  } catch (error) { return next(error); }
}));

app.get('/api/internal/ai', requireUser(async (_req, res, next) => {
  try {
    const [activity] = await pool.query(
      `SELECT a.id, a.source, a.kind, a.title, a.body, a.is_read AS isRead, a.created_at AS createdAt, a.client_id AS clientId,
              u.full_name AS requestedBy, c.trade_name AS clientName
       FROM ai_activity a LEFT JOIN users u ON u.id = a.requested_by LEFT JOIN clients c ON c.id = a.client_id
       ORDER BY a.created_at DESC LIMIT 150`);
    const [emails] = await pool.query(
      `SELECT e.id, e.to_name AS toName, e.to_email AS toEmail, e.subject, e.body, e.reason, e.status, e.source, e.created_at AS createdAt,
              e.sent_at AS sentAt, e.client_id AS clientId, c.trade_name AS clientName, u.full_name AS requestedBy
       FROM ai_emails e LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN users u ON u.id = e.requested_by
       ORDER BY CASE e.status WHEN 'draft' THEN 0 ELSE 1 END, e.created_at DESC LIMIT 100`);
    res.set('Cache-Control', 'private, no-store');
    return res.json({ available: await aiAvailable(), model: aiModel(), autopilot: (process.env.AI_AUTOPILOT || 'on') === 'on', tasks: await taskStatus(), activity, emails });
  } catch (error) { return next(error); }
}));

app.post('/api/internal/ai/tasks/:name/run', requireCsrf, requireUser(async (req, res, next) => {
  try {
    if (!TASKS[req.params.name]) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    const result = await runTask(req.params.name);
    return res.json({ ok: true, result });
  } catch (error) { return next(error); }
}));

app.post('/api/internal/ai/activity/read', requireCsrf, requireUser(async (_req, res, next) => {
  try { await pool.execute('UPDATE ai_activity SET is_read = 1 WHERE is_read = 0'); return res.json({ ok: true }); }
  catch (error) { return next(error); }
}));

app.patch('/api/internal/ai/emails/:id', requireCsrf, requireUser(async (req, res, next) => {
  try {
    const status = text(req.body?.status, 20);
    const subject = text(req.body?.subject, 200);
    const body = text(req.body?.body, 6000);
    if (status && !['draft', 'sent', 'discarded'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const [result] = await pool.execute(
      `UPDATE ai_emails SET status = COALESCE(?, status), subject = COALESCE(?, subject), body = COALESCE(?, body),
              sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END WHERE id = ?`,
      [status || null, subject || null, body || null, status || '', req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'E-mail não encontrado.' });
    await audit(pool, req.user.id, `ai_email.${status || 'edited'}`, 'ai_email', req.params.id, {});
    return res.json({ ok: true });
  } catch (error) { return next(error); }
}));

app.get('/api/admin/users', requireAdmin(async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, full_name AS fullName, role, is_active AS isActive,
              created_at AS createdAt, last_login_at AS lastLoginAt
       FROM users ORDER BY created_at DESC`
    );
    res.set('Cache-Control', 'private, no-store');
    return res.json({ users: rows });
  } catch (error) { return next(error); }
}));

app.post('/api/admin/users', requireCsrf, requireAdmin(async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const fullName = text(req.body?.fullName, 120);
  const role = req.body?.role;
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!validCorporateEmail(email) || fullName.length < 2 || !['employee', 'admin'].includes(role) || password.length < 14 || password.length > 128) {
    return res.status(400).json({ error: 'Informe nome, e-mail de domínio autorizado, perfil e uma senha inicial de 14 a 128 caracteres.' });
  }
  const id = randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'INSERT INTO users (id, email, full_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [id, email, fullName, await hashPassword(password), role]
    );
    await audit(connection, req.user.id, 'user.created', 'user', id, { email, role });
    await connection.commit();
    return res.status(201).json({ ok: true, id });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message)) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    return next(error);
  } finally { connection.release(); }
}));

app.patch('/api/admin/users/:id', requireCsrf, requireAdmin(async (req, res, next) => {
  const id = req.params.id;
  const email = req.body?.email === undefined ? undefined : normalizeEmail(req.body.email);
  const fullName = req.body?.fullName === undefined ? undefined : text(req.body.fullName, 120);
  const role = req.body?.role;
  const isActive = req.body?.isActive;
  const password = req.body?.password;
  if ((email !== undefined && !validCorporateEmail(email)) || (fullName !== undefined && fullName.length < 2) || (role !== undefined && !['employee', 'admin'].includes(role)) || (isActive !== undefined && typeof isActive !== 'boolean') || (password !== undefined && (typeof password !== 'string' || password.length < 14 || password.length > 128))) {
    return res.status(400).json({ error: 'Os dados enviados são inválidos. A senha, quando alterada, deve ter 14 a 128 caracteres.' });
  }
  if (req.user.id === id && isActive === false) return res.status(400).json({ error: 'Não é possível desativar a própria conta.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [targets] = await connection.execute('SELECT id, email, role, is_active FROM users WHERE id = ?', [id]);
    const target = targets[0];
    if (!target) {
      await connection.rollback();
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const targetRole = role ?? target.role;
    const targetActive = isActive ?? Boolean(target.is_active);
    if (target.role === 'admin' && target.is_active && (targetRole !== 'admin' || !targetActive)) {
      const [admins] = await connection.query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1");
      if (admins.length <= 1) {
        await connection.rollback();
        return res.status(409).json({ error: 'É necessário manter pelo menos um administrador ativo.' });
      }
    }
    const fields = [];
    const values = [];
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (fullName !== undefined) { fields.push('full_name = ?'); values.push(fullName); }
    if (role !== undefined) { fields.push('role = ?'); values.push(role); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (password !== undefined) { fields.push('password_hash = ?'); values.push(await hashPassword(password)); }
    if (!fields.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    }
    values.push(id);
    await connection.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    if ((role !== undefined && role !== target.role) || isActive === false || password !== undefined) {
      await connection.execute('DELETE FROM sessions WHERE user_id = ?', [id]);
    }
    await audit(connection, req.user.id, 'user.updated', 'user', id, { email: email ?? target.email, role: targetRole, isActive: targetActive, passwordChanged: password !== undefined });
    await connection.commit();
    return res.json({ ok: true });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message)) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
    return next(error);
  } finally { connection.release(); }
}));

app.post('/api/public/chatbot', publicChatLimiter, requireCsrf, async (req, res, next) => {
  const rawHistory = Array.isArray(req.body?.messages) ? req.body.messages.slice(-8) : [];
  const history = [];
  for (const item of rawHistory) {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') continue;
    const content = item.content.trim().slice(0, 1000);
    if (content) history.push({ role: item.role, content });
  }
  if (!history.length || history.at(-1).role !== 'user') {
    return res.status(400).json({ error: 'Envie uma pergunta para o assistente.' });
  }
  try {
    const result = await answerPublicAssistant(history);
    res.set('Cache-Control', 'no-store');
    return res.json({ answer: result.answer, mode: result.mode });
  } catch (error) {
    console.error('Falha no chatbot público:', error.message);
    return res.status(502).json({ error: 'O assistente está temporariamente indisponível. Você ainda pode usar o formulário de cotação.' });
  }
});

app.post('/api/internal/assistant', aiLimiter, requireCsrf, requireUser(async (req, res, next) => {
  const rawHistory = Array.isArray(req.body?.messages) ? req.body.messages.slice(-10) : [];
  const history = [];
  for (const item of rawHistory) {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') continue;
    const content = item.content.trim().slice(0, 2000);
    if (content) history.push({ role: item.role, content });
  }
  if (!history.length || history.at(-1).role !== 'user') return res.status(400).json({ error: 'Envie uma pergunta para o assistente.' });
  try {
    if (!await aiAvailable()) return res.status(503).json({ error: 'A IA local (Ollama) não está rodando ou o modelo não foi baixado. Veja a Central da IA.' });
    const result = await runAgent(history, req.user);
    return res.json({ answer: result.answer, actions: result.actions, source: 'ollama' });
  } catch (error) {
    console.error('Falha no assistente:', error.message);
    return res.status(502).json({ error: 'O assistente não conseguiu responder agora. Tente novamente.' });
  }
}));

app.get('/login', async (req, res, next) => {
  try {
    if (await currentUser(req)) return res.redirect('/internal');
    res.set('Cache-Control', 'no-store');
    return res.sendFile(resolve(publicDir, 'login.html'));
  } catch (error) { return next(error); }
});

app.get('/internal', async (req, res, next) => {
  try {
    if (!await currentUser(req)) return res.redirect('/login');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.sendFile(resolve(privateDir, 'dashboard.html'));
  } catch (error) { return next(error); }
});
app.get('/internal/users', async (req, res, next) => {
  try {
    const user = await currentUser(req);
    if (!user) return res.redirect('/login');
    if (user.role !== 'admin') return res.redirect('/internal');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.sendFile(resolve(privateDir, 'users.html'));
  } catch (error) { return next(error); }
});
app.get('/internal/requests', async (req, res, next) => {
  try {
    if (!await currentUser(req)) return res.redirect('/login');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.sendFile(resolve(privateDir, 'requests.html'));
  } catch (error) { return next(error); }
});
app.get('/internal/ai', async (req, res, next) => {
  try {
    if (!await currentUser(req)) return res.redirect('/login');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.sendFile(resolve(privateDir, 'ai.html'));
  } catch (error) { return next(error); }
});
app.get('/internal/clients', async (req, res, next) => {
  try {
    if (!await currentUser(req)) return res.redirect('/login');
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    return res.sendFile(resolve(privateDir, 'clients.html'));
  } catch (error) { return next(error); }
});

app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /internal\nDisallow: /login\n'));
app.use((_req, res) => res.status(404).send('Página não encontrada.'));
app.use((error, _req, res, _next) => {
  console.error('Erro da aplicação:', error.message);
  if (res.headersSent) return;
  return res.status(500).json({ error: 'Ocorreu um erro interno. Tente novamente.' });
});

try {
  await migrate();
  dummyPasswordHash = await hashPassword(randomBytes(32).toString('hex'));
  const host = process.env.HOST || '127.0.0.1';
  const server = app.listen(PORT, host, () => console.log(`B2B Inteligente pronto: http://${host}:${PORT}/`));
  ensureOllama().catch(() => {}).finally(() => startAutopilot());
  server.on('error', (error) => {
    console.error(`Falha ao abrir o servidor: ${error.message}`);
    process.exitCode = 1;
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(async () => {
      await closeDatabase().catch((error) => console.error('Falha ao fechar banco:', error.message));
      process.exit();
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error('O servidor não pôde iniciar:', error.message);
  await closeDatabase().catch(() => {});
  process.exit(1);
}
