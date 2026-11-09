/**
 * Ferramentas que a IA pode usar no banco. Toda alteração fica registrada em
 * audit_events e em ai_activity, com quem pediu (ou "auto" quando a IA agiu sozinha).
 */
import { randomUUID } from 'node:crypto';
import { pool } from '../db.mjs';

const QUOTE_STATUS = { new: 'Nova', reviewing: 'Em análise', contacted: 'Contatada', closed: 'Encerrada' };
const SHIPMENT_STATUS = { pending: 'Aguardando embarque', in_transit: 'Em trânsito', customs: 'Desembaraço', delivered: 'Entregue', delayed: 'Atrasado', cancelled: 'Cancelado' };
const CLIENT_STATUS = { prospect: 'Prospect', active: 'Ativo', inactive: 'Inativo', blocked: 'Bloqueado' };
const INTERACTION_KINDS = ['ligacao', 'email', 'reuniao', 'visita', 'whatsapp'];
const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? '' : String(v).trim().slice(0, max));

export async function logActivity({ source, kind, title, body = null, details = null, userId = null, clientId = null }) {
  await pool.execute(
    'INSERT INTO ai_activity (id, source, kind, title, body, details_json, requested_by, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), source, kind, str(title, 200), body ? str(body, 6000) : null, details ? JSON.stringify(details) : null, userId, clientId]
  );
}

async function audit(ctx, action, targetType, targetId, details) {
  await pool.execute(
    'INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), ctx.userId || null, `ai.${action}`, targetType, targetId, JSON.stringify({ ...details, via: ctx.source === 'auto' ? 'ia_automatica' : 'ia_chat' })]
  );
}

export async function resolveClient(ref) {
  const q = str(ref, 120);
  if (!q) return { error: 'Informe o cliente (código CLI-0000, nome ou CNPJ).' };
  const [exact] = await pool.query(
    'SELECT id, code, trade_name AS name FROM clients WHERE id = ? OR code = ? COLLATE NOCASE OR cnpj = ? OR trade_name = ? COLLATE NOCASE LIMIT 2', [q, q, q, q]
  );
  if (exact.length === 1) return { client: exact[0] };
  const [like] = await pool.query(
    'SELECT id, code, trade_name AS name FROM clients WHERE trade_name LIKE ? OR legal_name LIKE ? ORDER BY trade_name LIMIT 6', [`%${q}%`, `%${q}%`]
  );
  if (like.length === 1) return { client: like[0] };
  if (!like.length) return { error: `Nenhum cliente encontrado para "${q}".` };
  return { error: `Mais de um cliente combina com "${q}". Especifique o código.`, candidatos: like.map((c) => `${c.code} ${c.name}`) };
}

async function resolveQuote(ref) {
  const q = str(ref, 60);
  if (!q) return null;
  const [rows] = await pool.query('SELECT id, company_name AS company, status FROM quote_requests WHERE id = ? OR id LIKE ? LIMIT 2', [q, `${q}%`]);
  return rows.length === 1 ? rows[0] : null;
}

const def = (name, description, properties = {}, required = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } }
});

export const toolDefinitions = [
  def('resumo_operacao', 'Indicadores gerais: embarques, entregas, atrasos, faturamento, clientes e cotações em um período.', {
    dias: { type: 'integer', description: 'Período em dias (padrão 30).' } }),
  def('buscar_clientes', 'Procura clientes por nome, cidade, segmento ou status. Retorna código, faturamento TOTAL histórico (desde o início) e último embarque.', {
    texto: { type: 'string', description: 'Parte do nome, cidade ou CNPJ.' },
    status: { type: 'string', enum: Object.keys(CLIENT_STATUS) },
    segmento: { type: 'string' },
    uf: { type: 'string', description: 'Sigla do estado, ex.: SP.' },
    ordenar: { type: 'string', enum: ['faturamento', 'ultimo_embarque', 'nome'], description: 'Padrão: faturamento.' },
    limite: { type: 'integer', description: 'Máximo 20.' } }),
  def('ficha_cliente', 'Ficha completa de um cliente: cadastro, contatos, totais, últimos embarques e interações.', {
    cliente: { type: 'string', description: 'Código (CLI-0001), nome fantasia ou CNPJ.' } }, ['cliente']),
  def('listar_embarques', 'Lista embarques, com filtros por cliente e status.', {
    cliente: { type: 'string', description: 'Código ou nome do cliente (opcional).' },
    status: { type: 'string', enum: Object.keys(SHIPMENT_STATUS) },
    limite: { type: 'integer', description: 'Máximo 30.' } }),
  def('listar_cotacoes', 'Lista solicitações de cotação recebidas pelo site ou chatbot.', {
    status: { type: 'string', enum: Object.keys(QUOTE_STATUS) },
    limite: { type: 'integer', description: 'Máximo 30.' } }),
  def('alterar_status_cotacao', 'Muda o status de uma cotação e opcionalmente grava uma nota.', {
    cotacao: { type: 'string', description: 'Referência da cotação (os 8 primeiros caracteres bastam).' },
    status: { type: 'string', enum: Object.keys(QUOTE_STATUS) },
    nota: { type: 'string' } }, ['cotacao', 'status']),
  def('alterar_status_embarque', 'Muda o status de um embarque pelo código (ex.: IMP-2026-10123).', {
    codigo: { type: 'string' },
    status: { type: 'string', enum: Object.keys(SHIPMENT_STATUS) } }, ['codigo', 'status']),
  def('registrar_interacao', 'Registra no histórico do cliente um contato feito (ligação, e-mail, reunião, visita, WhatsApp).', {
    cliente: { type: 'string' },
    tipo: { type: 'string', enum: INTERACTION_KINDS },
    resumo: { type: 'string' } }, ['cliente', 'tipo', 'resumo']),
  def('atualizar_cliente', 'Atualiza status, classificação (A-D), observações ou gerente de conta de um cliente.', {
    cliente: { type: 'string' },
    status: { type: 'string', enum: Object.keys(CLIENT_STATUS) },
    classificacao: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
    observacoes: { type: 'string', description: 'Substitui as observações atuais.' },
    gerente_email: { type: 'string', description: 'E-mail do usuário que será o gerente de conta.' } }, ['cliente']),
  def('redigir_email', 'Escreve um e-mail para o contato principal do cliente e o coloca na caixa de saída para a equipe revisar e enviar.', {
    cliente: { type: 'string' },
    assunto: { type: 'string' },
    corpo: { type: 'string', description: 'Texto completo do e-mail, com saudação e assinatura "Equipe B2B Inteligente".' },
    motivo: { type: 'string', description: 'Por que este e-mail está sendo enviado.' } }, ['cliente', 'assunto', 'corpo'])
];

export const WRITE_TOOLS = new Set(['alterar_status_cotacao', 'alterar_status_embarque', 'registrar_interacao', 'atualizar_cliente', 'redigir_email']);

export async function createEmailDraft(ctx, { clientId, toName, toEmail, subject, body, reason }) {
  const id = randomUUID();
  await pool.execute(
    'INSERT INTO ai_emails (id, client_id, to_name, to_email, subject, body, reason, source, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, clientId, toName, toEmail, str(subject, 200), str(body, 6000), reason ? str(reason, 300) : null, ctx.source, ctx.userId || null]
  );
  return id;
}

const handlers = {
  async resumo_operacao({ dias }) {
    const d = Math.min(Math.max(Number(dias) || 30, 1), 730);
    const [[k]] = await pool.query(
      `SELECT COUNT(*) AS embarques, SUM(status = 'delivered') AS entregues, SUM(status = 'delayed') AS atrasados,
              SUM(status IN ('pending','in_transit','customs')) AS em_andamento, SUM(status = 'cancelled') AS cancelados,
              ROUND(SUM(CASE WHEN status <> 'cancelled' THEN freight_brl + service_fee_brl END), 2) AS faturamento_brl,
              COUNT(DISTINCT client_id) AS clientes_atendidos
       FROM shipments WHERE ordered_at >= datetime('now', ?)`, [`-${d} days`]);
    const [[c]] = await pool.query(`SELECT COUNT(*) AS total, SUM(status='active') AS ativos, SUM(status='prospect') AS prospects, SUM(status='inactive') AS inativos, SUM(status='blocked') AS bloqueados FROM clients`);
    const [[q]] = await pool.query(`SELECT SUM(status='new') AS novas, SUM(status='reviewing') AS em_analise, SUM(status='contacted') AS contatadas FROM quote_requests`);
    const [[now]] = await pool.query(`SELECT SUM(status='delayed') AS atrasados_agora, SUM(status IN ('pending','in_transit','customs')) AS abertos_agora FROM shipments`);
    return { periodo_dias: d, embarques: k, situacao_atual: now, clientes: c, cotacoes: q };
  },
  async buscar_clientes({ texto, status, segmento, uf, ordenar, limite }) {
    const where = []; const params = [];
    if (texto) { where.push('(c.trade_name LIKE ? OR c.legal_name LIKE ? OR c.city LIKE ? OR c.cnpj LIKE ?)'); params.push(...Array(4).fill(`%${str(texto, 80)}%`)); }
    if (status && CLIENT_STATUS[status]) { where.push('c.status = ?'); params.push(status); }
    if (segmento) { where.push('c.segment LIKE ?'); params.push(`%${str(segmento, 60)}%`); }
    if (uf) { where.push('c.state = ?'); params.push(str(uf, 2).toUpperCase()); }
    const order = { ultimo_embarque: 'ultimo_embarque ASC', nome: 'c.trade_name' }[ordenar] || 'faturamento_brl DESC';
    const [rows] = await pool.query(
      `SELECT c.code AS codigo, c.trade_name AS nome, c.segment AS segmento, c.city || '/' || c.state AS cidade, c.status, c.rating AS classificacao,
              COUNT(s.id) AS embarques, ROUND(COALESCE(SUM(CASE WHEN s.status <> 'cancelled' THEN s.freight_brl + s.service_fee_brl END), 0), 2) AS faturamento_brl,
              MAX(s.ordered_at) AS ultimo_embarque
       FROM clients c LEFT JOIN shipments s ON s.client_id = c.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY c.id ORDER BY ${order} LIMIT ?`,
      [...params, Math.min(Number(limite) || 5, 20)]);
    return { total: rows.length, clientes: rows };
  },
  async ficha_cliente({ cliente }) {
    const r = await resolveClient(cliente); if (r.error) return r;
    const id = r.client.id;
    const [[c]] = await pool.query(
      `SELECT c.code AS codigo, c.trade_name AS nome, c.legal_name AS razao_social, c.cnpj, c.segment AS segmento, c.company_size AS porte,
              c.city || '/' || c.state AS cidade, c.status, c.rating AS classificacao, c.nps_score AS nps, c.credit_limit_brl AS limite_credito,
              c.payment_terms_days AS prazo_pagamento_dias, c.client_since AS cliente_desde, c.notes AS observacoes, c.email, c.phone AS telefone,
              u.full_name AS gerente_conta
       FROM clients c LEFT JOIN users u ON u.id = c.account_manager_id WHERE c.id = ?`, [id]);
    const [contatos] = await pool.query('SELECT full_name AS nome, job_title AS cargo, email, mobile AS celular, is_primary AS principal FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC', [id]);
    const [[tot]] = await pool.query(
      `SELECT COUNT(*) AS embarques, SUM(status='delivered') AS entregues, SUM(status='delayed') AS atrasados, SUM(status IN ('pending','in_transit','customs')) AS em_andamento,
              ROUND(SUM(CASE WHEN status <> 'cancelled' THEN freight_brl + service_fee_brl END), 2) AS faturamento_brl, MAX(ordered_at) AS ultimo_embarque
       FROM shipments WHERE client_id = ?`, [id]);
    const [embarques] = await pool.query(
      `SELECT code AS codigo, status, date(ordered_at) AS data, eta, origin_country AS origem, product_description AS produto, transport_mode AS modal,
              ROUND(freight_brl + service_fee_brl, 2) AS faturamento_brl FROM shipments WHERE client_id = ? ORDER BY ordered_at DESC LIMIT 8`, [id]);
    const [interacoes] = await pool.query('SELECT kind AS tipo, summary AS resumo, date(occurred_at) AS data FROM client_interactions WHERE client_id = ? ORDER BY occurred_at DESC LIMIT 5', [id]);
    return { cliente: c, totais: tot, contatos, ultimos_embarques: embarques, ultimas_interacoes: interacoes };
  },
  async listar_embarques({ cliente, status, limite }) {
    const where = []; const params = [];
    if (cliente) { const r = await resolveClient(cliente); if (r.error) return r; where.push('s.client_id = ?'); params.push(r.client.id); }
    if (status && SHIPMENT_STATUS[status]) { where.push('s.status = ?'); params.push(status); }
    const [rows] = await pool.query(
      `SELECT s.code AS codigo, c.code AS cliente_codigo, c.trade_name AS cliente, s.status, date(s.ordered_at) AS data, s.eta,
              s.origin_country || ' → ' || s.destination_port AS rota, s.product_description AS produto, ROUND(s.freight_brl + s.service_fee_brl, 2) AS faturamento_brl
       FROM shipments s JOIN clients c ON c.id = s.client_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.ordered_at DESC LIMIT ?`, [...params, Math.min(Number(limite) || 5, 30)]);
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM shipments s ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, params);
    return { total_encontrado: n, mostrando: rows.length, embarques: rows };
  },
  async listar_cotacoes({ status, limite }) {
    const params = []; let where = '';
    if (status && QUOTE_STATUS[status]) { where = 'WHERE status = ?'; params.push(status); }
    const [rows] = await pool.query(
      `SELECT substr(id, 1, 8) AS ref, company_name AS empresa, contact_name AS contato, email, origin_country AS origem, product_summary AS produto,
              estimated_volume AS volume, destination AS destino, status, date(created_at) AS recebida, ai_notes AS nota_ia
       FROM quote_requests ${where} ORDER BY created_at DESC LIMIT ?`, [...params, Math.min(Number(limite) || 5, 30)]);
    return { total: rows.length, cotacoes: rows };
  },

  async alterar_status_cotacao({ cotacao, status, nota }, ctx) {
    if (!QUOTE_STATUS[status]) return { error: 'Status inválido.' };
    const q = await resolveQuote(cotacao); if (!q) return { error: `Cotação "${cotacao}" não encontrada.` };
    await pool.execute('UPDATE quote_requests SET status = ?, ai_notes = COALESCE(?, ai_notes) WHERE id = ?', [status, nota ? str(nota, 1500) : null, q.id]);
    await audit(ctx, 'quote.status_changed', 'quote_request', q.id, { de: q.status, para: status });
    return { ok: true, action: `Cotação de ${q.company}: ${QUOTE_STATUS[q.status]} → ${QUOTE_STATUS[status]}` };
  },
  async alterar_status_embarque({ codigo, status }, ctx) {
    if (!SHIPMENT_STATUS[status]) return { error: 'Status inválido.' };
    const [[s]] = await pool.query('SELECT s.id, s.status, s.client_id, c.trade_name AS cliente FROM shipments s JOIN clients c ON c.id = s.client_id WHERE s.code = ? COLLATE NOCASE', [str(codigo, 40)]);
    if (!s) return { error: `Embarque "${codigo}" não encontrado.` };
    await pool.execute(`UPDATE shipments SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, datetime('now')) ELSE delivered_at END WHERE id = ?`, [status, status, s.id]);
    await audit(ctx, 'shipment.status_changed', 'shipment', s.id, { de: s.status, para: status });
    return { ok: true, clientId: s.client_id, action: `Embarque ${str(codigo, 40).toUpperCase()} (${s.cliente}): ${SHIPMENT_STATUS[s.status]} → ${SHIPMENT_STATUS[status]}` };
  },
  async registrar_interacao({ cliente, tipo, resumo }, ctx) {
    if (!INTERACTION_KINDS.includes(tipo)) return { error: 'Tipo inválido.' };
    if (!str(resumo)) return { error: 'Informe o resumo.' };
    const r = await resolveClient(cliente); if (r.error) return r;
    const id = randomUUID();
    await pool.execute('INSERT INTO client_interactions (id, client_id, user_id, kind, summary, occurred_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))', [id, r.client.id, ctx.userId || null, tipo, str(resumo, 800)]);
    await audit(ctx, 'client.interaction_added', 'client', r.client.id, { tipo });
    return { ok: true, clientId: r.client.id, action: `Interação (${tipo}) registrada em ${r.client.name}: ${str(resumo, 120)}` };
  },
  async atualizar_cliente({ cliente, status, classificacao, observacoes, gerente_email }, ctx) {
    const r = await resolveClient(cliente); if (r.error) return r;
    const sets = []; const params = []; const changes = [];
    if (status) { if (!CLIENT_STATUS[status]) return { error: 'Status inválido.' }; sets.push('status = ?'); params.push(status); changes.push(`status ${CLIENT_STATUS[status]}`); }
    if (classificacao) { if (!['A', 'B', 'C', 'D'].includes(classificacao)) return { error: 'Classificação inválida.' }; sets.push('rating = ?'); params.push(classificacao); changes.push(`classificação ${classificacao}`); }
    if (observacoes != null && observacoes !== '') { sets.push('notes = ?'); params.push(str(observacoes, 1500)); changes.push('observações'); }
    if (gerente_email) {
      const [[u]] = await pool.query('SELECT id, full_name FROM users WHERE email = ? COLLATE NOCASE AND is_active = 1', [str(gerente_email, 254)]);
      if (!u) return { error: `Usuário ${gerente_email} não encontrado.` };
      sets.push('account_manager_id = ?'); params.push(u.id); changes.push(`gerente ${u.full_name}`);
    }
    if (!sets.length) return { error: 'Nada para alterar.' };
    await pool.execute(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`, [...params, r.client.id]);
    await audit(ctx, 'client.updated', 'client', r.client.id, { campos: changes });
    return { ok: true, clientId: r.client.id, action: `Cliente ${r.client.name} atualizado: ${changes.join(', ')}` };
  },
  async redigir_email({ cliente, assunto, corpo, motivo }, ctx) {
    if (!str(assunto) || !str(corpo)) return { error: 'Assunto e corpo são obrigatórios.' };
    const r = await resolveClient(cliente); if (r.error) return r;
    const [[contact]] = await pool.query('SELECT full_name, email FROM client_contacts WHERE client_id = ? AND email IS NOT NULL ORDER BY is_primary DESC LIMIT 1', [r.client.id]);
    const [[fallback]] = await pool.query('SELECT email FROM clients WHERE id = ?', [r.client.id]);
    const toEmail = contact?.email || fallback?.email;
    if (!toEmail) return { error: 'Cliente sem e-mail cadastrado.' };
    await createEmailDraft(ctx, { clientId: r.client.id, toName: contact?.full_name || r.client.name, toEmail, subject: assunto, body: corpo, reason: motivo });
    return { ok: true, clientId: r.client.id, action: `E-mail "${str(assunto, 80)}" para ${contact?.full_name || r.client.name} <${toEmail}> colocado na caixa de saída` };
  }
};

export async function executeTool(name, args, ctx) {
  const handler = handlers[name];
  if (!handler) return { error: `Ferramenta desconhecida: ${name}` };
  try {
    const result = await handler(args || {}, ctx);
    if (result?.ok && result.action) {
      await logActivity({ source: ctx.source, kind: 'action', title: result.action, userId: ctx.userId, clientId: result.clientId || null, details: { ferramenta: name, argumentos: args } });
    }
    return result;
  } catch (error) {
    return { error: `Falha ao executar ${name}: ${error.message}` };
  }
}
