/**
 * Piloto automático: tarefas que a IA executa sozinha e registra na Central da IA.
 *   - vigiar_atrasos   (a cada 30 min) marca embarques vencidos como atrasados e redige aviso ao cliente
 *   - triar_cotacoes   (a cada 10 min) analisa cotações novas, deixa nota e rascunho de resposta
 *   - clientes_parados (diária) encontra clientes ativos sem embarque e sugere abordagem + e-mail
 *   - resumo_diario    (diária, após 7h) relatório da operação com riscos e dicas de crescimento
 */
import { pool } from '../db.mjs';
import { aiAvailable, chat } from './ollama.mjs';
import { createEmailDraft, executeTool, logActivity } from './tools.mjs';

const AUTO = { userId: null, source: 'auto' };
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const looksLikeEmail = (text) => typeof text === 'string' && text.length > 120 && !/^e-?mail (cordial|de|curto)/i.test(text.trim());

async function askJson(system, data, maxTokens = 700) {
  const reply = await chat([
    { role: 'system', content: `${system}\nResponda SOMENTE com um objeto JSON válido, em português do Brasil.` },
    { role: 'user', content: JSON.stringify(data) }
  ], { json: true, maxTokens, temperature: 0.3 });
  try { return JSON.parse(reply.content); } catch { return null; }
}

async function vigiarAtrasos() {
  const [late] = await pool.query(
    `SELECT s.id, s.code, s.status, s.eta, s.product_description AS product, s.origin_country AS origin, s.client_id, c.trade_name AS client, c.code AS clientCode
     FROM shipments s JOIN clients c ON c.id = s.client_id
     WHERE s.status IN ('pending', 'in_transit', 'customs') AND s.eta < date('now') ORDER BY s.eta LIMIT 50`);
  if (!late.length) return { resumo: 'Nenhum embarque com prazo vencido.' };
  for (const s of late) await executeTool('alterar_status_embarque', { codigo: s.code, status: 'delayed' }, AUTO);
  let emails = 0;
  if (await aiAvailable()) {
    for (const s of late.slice(0, 5)) {
      const draft = await askJson(
        'Você escreve e-mails curtos e cordiais em nome da Equipe B2B Inteligente avisando o cliente sobre atraso de embarque, sem prometer nova data exata e oferecendo atualização em breve.\nCampos do JSON: "assunto" (linha de assunto) e "corpo" (o texto completo do e-mail, com saudação, 2-3 parágrafos e assinatura Equipe B2B Inteligente).',
        { cliente: s.client, embarque: s.code, produto: s.product, origem: s.origin, previsao_original: s.eta }, 400);
      if (draft?.assunto && looksLikeEmail(draft?.corpo)) {
        const r = await executeTool('redigir_email', { cliente: s.clientCode, assunto: draft.assunto, corpo: draft.corpo, motivo: `Aviso de atraso do embarque ${s.code}` }, AUTO);
        if (r?.ok) emails++;
      }
    }
  }
  await logActivity({ source: 'auto', kind: 'alert', title: `${late.length} embarque(s) passaram da data prevista e foram marcados como atrasados`,
    body: late.map((s) => `• ${s.code} — ${s.client} (previsto ${s.eta})`).join('\n') + (emails ? `\n\n${emails} aviso(s) aos clientes redigidos na caixa de saída.` : '') });
  return { atrasados: late.length, emails };
}

async function triarCotacoes() {
  if (!await aiAvailable()) return { pulado: 'IA local indisponível' };
  const [quotes] = await pool.query(
    `SELECT id, contact_name, company_name, email, origin_country, product_summary, estimated_volume, destination, details, submission_channel, created_at
     FROM quote_requests WHERE status = 'new' AND ai_notes IS NULL ORDER BY created_at LIMIT 3`);
  let done = 0;
  for (const q of quotes) {
    const [[match]] = await pool.query(
      "SELECT id, code, trade_name, status FROM clients WHERE ? LIKE trade_name || '%' OR legal_name = ? OR email LIKE ? ORDER BY length(trade_name) DESC LIMIT 1",
      [q.company_name, q.company_name, `%@${q.email.split('@')[1] || '-'}`]);
    const analysis = await askJson(
      'Você é analista comercial de uma empresa de logística de importação. Analise a solicitação de cotação.\nCampos do JSON:\n- "resumo": 1-2 frases sobre o pedido\n- "prioridade": "alta", "media" ou "baixa" (alta só para volume grande, recorrente ou urgente)\n- "proximos_passos": lista de 2-4 ações internas\n- "assunto_resposta": assunto do e-mail\n- "email_resposta": o TEXTO COMPLETO do e-mail ao contato, cordial, confirmando o recebimento e pedindo as informações que faltam (ex.: NCM, peso, Incoterm, fornecedor), assinado Equipe B2B Inteligente.\nNão invente preços nem prazos.',
      { ...q, cliente_existente: match ? `${match.code} ${match.trade_name} (${match.status})` : 'não encontrado na carteira' }, 900);
    if (!analysis?.resumo) continue;
    const note = `[IA] Prioridade ${analysis.prioridade || 'média'}. ${analysis.resumo}${match ? ` Possível cliente existente: ${match.code} ${match.trade_name}.` : ''}\nPróximos passos: ${(analysis.proximos_passos || []).join('; ')}`;
    await pool.execute('UPDATE quote_requests SET ai_notes = ?, matched_client_id = ? WHERE id = ?', [note.slice(0, 1500), match?.id || null, q.id]);
    await executeTool('alterar_status_cotacao', { cotacao: q.id, status: 'reviewing' }, AUTO);
    if (looksLikeEmail(analysis.email_resposta)) {
      await createEmailDraft(AUTO, { clientId: match?.id || null, toName: q.contact_name, toEmail: q.email,
        subject: analysis.assunto_resposta || `Sua solicitação de cotação — ${q.product_summary}`, body: analysis.email_resposta, reason: `Resposta à cotação de ${q.company_name}` });
    }
    await logActivity({ source: 'auto', kind: 'action', title: `Cotação de ${q.company_name} triada (prioridade ${analysis.prioridade || 'média'})`, body: note, clientId: match?.id || null });
    done++;
  }
  return { triadas: done };
}

async function clientesParados() {
  if (!await aiAvailable()) return { pulado: 'IA local indisponível' };
  const [idle] = await pool.query(
    `SELECT c.id, c.code, c.trade_name, c.segment, c.city, c.state, c.rating, c.notes, MAX(s.ordered_at) AS last,
            COUNT(s.id) AS total, ROUND(SUM(s.freight_brl + s.service_fee_brl), 2) AS revenue,
            (SELECT GROUP_CONCAT(DISTINCT product_description) FROM shipments WHERE client_id = c.id) AS products
     FROM clients c JOIN shipments s ON s.client_id = c.id
     WHERE c.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM ai_emails e WHERE e.client_id = c.id AND e.created_at >= datetime('now', '-30 days'))
     GROUP BY c.id HAVING last < datetime('now', '-60 days') ORDER BY revenue DESC LIMIT 3`);
  if (!idle.length) return { resumo: 'Nenhum cliente ativo parado há mais de 60 dias.' };
  for (const c of idle) {
    const days = Math.round((Date.now() - new Date(c.last.replace(' ', 'T') + 'Z')) / 86400000);
    const plan = await askJson(
      'Você é consultor comercial de uma empresa de logística de importação. O cliente abaixo está sem embarcar.\nCampos do JSON:\n- "dica": 2-3 frases práticas e ESPECÍFICAS para este cliente: cite o segmento, os produtos que ele costuma importar e uma oferta concreta (ex.: consolidação LCL, rota alternativa, planejamento da próxima safra/temporada, revisão de Incoterm).\n- "assunto": assunto do e-mail\n- "corpo": o TEXTO COMPLETO de um e-mail de reaproximação mencionando os produtos do cliente, sem inventar preços, assinado Equipe B2B Inteligente.',
      { cliente: c.trade_name, segmento: c.segment, cidade: `${c.city}/${c.state}`, classificacao: c.rating, dias_sem_embarque: days, embarques_historicos: c.total, faturamento_historico: brl(c.revenue), produtos: c.products, observacoes: c.notes }, 800);
    if (!plan?.dica) continue;
    if (plan.assunto && looksLikeEmail(plan.corpo)) await executeTool('redigir_email', { cliente: c.code, assunto: plan.assunto, corpo: plan.corpo, motivo: `Cliente sem embarque há ${days} dias` }, AUTO);
    await logActivity({ source: 'auto', kind: 'tip', title: `${c.trade_name} está há ${days} dias sem embarcar`, body: plan.dica, clientId: c.id });
  }
  return { clientes: idle.length };
}

async function resumoDiario() {
  if (!await aiAvailable()) return { pulado: 'IA local indisponível' };
  const [[week]] = await pool.query(
    `SELECT COUNT(*) AS embarques_7d, SUM(status='delivered') AS entregues_7d, ROUND(SUM(CASE WHEN status <> 'cancelled' THEN freight_brl + service_fee_brl END), 2) AS faturamento_7d
     FROM shipments WHERE ordered_at >= datetime('now', '-7 days')`);
  const [[prev]] = await pool.query(
    `SELECT COUNT(*) AS embarques, ROUND(SUM(CASE WHEN status <> 'cancelled' THEN freight_brl + service_fee_brl END), 2) AS faturamento
     FROM shipments WHERE ordered_at >= datetime('now', '-14 days') AND ordered_at < datetime('now', '-7 days')`);
  const [[now]] = await pool.query(`SELECT SUM(status='delayed') AS atrasados, SUM(status IN ('pending','in_transit','customs')) AS em_andamento FROM shipments`);
  const [[quotes]] = await pool.query(`SELECT SUM(status='new') AS novas, SUM(status='reviewing') AS em_analise FROM quote_requests`);
  const [segments] = await pool.query(
    `SELECT c.segment AS segmento, COUNT(*) AS embarques_90d, ROUND(SUM(s.freight_brl + s.service_fee_brl)) AS faturamento_90d
     FROM shipments s JOIN clients c ON c.id = s.client_id WHERE s.ordered_at >= datetime('now', '-90 days') AND s.status <> 'cancelled'
     GROUP BY c.segment ORDER BY faturamento_90d DESC`);
  const [origins] = await pool.query(
    `SELECT origin_country AS origem, COUNT(*) AS embarques_90d FROM shipments WHERE ordered_at >= datetime('now', '-90 days') GROUP BY origin_country ORDER BY 2 DESC LIMIT 6`);
  const [[prospects]] = await pool.query(`SELECT COUNT(*) AS prospects FROM clients WHERE status = 'prospect'`);
  const [[quotes7]] = await pool.query(`SELECT COUNT(*) AS n FROM quote_requests WHERE created_at >= datetime('now', '-7 days')`);
  const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1).replace('.', ',')}%` : 'sem base');
  const report = await askJson(
    'Você é o analista da B2B Inteligente (logística de importação). Escreva o resumo diário para a equipe com base nos dados. Formato: {"titulo": "...", "destaques": ["..."], "riscos": ["..."], "acoes_do_dia": ["..."], "dicas_crescimento": ["3 ideias concretas para aumentar o faturamento, baseadas nos segmentos e origens"]}. Use EXATAMENTE os números e variações fornecidos (já calculados e formatados); não calcule nem invente outros.',
    {
      ultimos_7_dias: { embarques: week.embarques_7d, entregues: week.entregues_7d, faturamento: brl(week.faturamento_7d) },
      sete_dias_anteriores: { embarques: prev.embarques, faturamento: brl(prev.faturamento) },
      variacao_faturamento: pct(week.faturamento_7d, prev.faturamento), variacao_embarques: pct(week.embarques_7d, prev.embarques),
      situacao_atual: { embarques_atrasados: now.atrasados, embarques_em_andamento: now.em_andamento },
      cotacoes: { recebidas_ultimos_7_dias: quotes7.n, aguardando_triagem: quotes.novas, em_analise: quotes.em_analise },
      prospects_em_negociacao: prospects.prospects,
      segmentos_90d: segments.map((x) => ({ segmento: x.segmento, embarques: x.embarques_90d, faturamento: brl(x.faturamento_90d) })),
      origens_90d: origins
    }, 1100);
  if (!report?.destaques) return { erro: 'A IA não gerou o resumo.' };
  const section = (title, items) => (items?.length ? `${title}\n${items.map((i) => `• ${i}`).join('\n')}` : '');
  const body = [section('Destaques', report.destaques), section('Riscos', report.riscos), section('Ações do dia', report.acoes_do_dia), section('Como crescer', report.dicas_crescimento)].filter(Boolean).join('\n\n');
  await logActivity({ source: 'auto', kind: 'report', title: report.titulo || `Resumo do dia ${new Date().toLocaleDateString('pt-BR')}`, body });
  return { ok: true };
}

export const TASKS = {
  vigiar_atrasos: { label: 'Vigiar atrasos', everyMinutes: 30, run: vigiarAtrasos },
  triar_cotacoes: { label: 'Triar cotações novas', everyMinutes: 10, run: triarCotacoes },
  clientes_parados: { label: 'Clientes parados', everyMinutes: 24 * 60, run: clientesParados },
  resumo_diario: { label: 'Resumo diário', everyMinutes: 24 * 60, minHour: 7, run: resumoDiario }
};

const running = new Set();
export async function runTask(name) {
  const task = TASKS[name];
  if (!task) throw new Error('Tarefa desconhecida.');
  if (running.has(name)) return { emAndamento: true };
  running.add(name);
  try {
    await pool.execute('INSERT INTO ai_task_runs (task, last_run_at) VALUES (?, datetime(\'now\')) ON CONFLICT(task) DO UPDATE SET last_run_at = excluded.last_run_at', [name]);
    return await task.run();
  } catch (error) {
    await logActivity({ source: 'auto', kind: 'error', title: `Falha na tarefa "${task.label}"`, body: error.message });
    return { erro: error.message };
  } finally { running.delete(name); }
}

export async function taskStatus() {
  const [rows] = await pool.query('SELECT task, last_run_at AS lastRunAt FROM ai_task_runs');
  const last = Object.fromEntries(rows.map((r) => [r.task, r.lastRunAt]));
  return Object.entries(TASKS).map(([name, t]) => ({ name, label: t.label, everyMinutes: t.everyMinutes, lastRunAt: last[name] || null, running: running.has(name) }));
}

async function tick() {
  const statuses = await taskStatus();
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }));
  for (const s of statuses) {
    const task = TASKS[s.name];
    if (task.minHour && hour < task.minHour) continue;
    const due = !s.lastRunAt || Date.now() - new Date(s.lastRunAt.replace(' ', 'T') + 'Z').getTime() >= task.everyMinutes * 60000;
    if (due && !s.running) await runTask(s.name);
  }
}

export function startAutopilot() {
  if ((process.env.AI_AUTOPILOT || 'on') !== 'on') return;
  const loop = () => tick().catch((error) => console.error('Piloto automático:', error.message));
  setTimeout(loop, 20000).unref();
  setInterval(loop, 5 * 60000).unref();
  console.log('Piloto automático da IA ativo.');
}
