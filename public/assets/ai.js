const $ = (id) => document.getElementById(id);
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const parseDate = (v) => new Date(String(v).replace(' ', 'T') + 'Z');
const fmt = (v) => (v ? dateFmt.format(parseDate(v)) : 'nunca');
const kindInfo = { action: ['Ação', '✓'], report: ['Relatório', '▥'], tip: ['Dica', '✦'], alert: ['Alerta', '!'], error: ['Erro', '×'] };
const emailStatus = { draft: 'Rascunho', sent: 'Enviado', discarded: 'Descartado', failed: 'Falhou' };
let state = { activity: [], emails: [], tasks: [] };
let currentEmail = null;
const conversation = [];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => { if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v ?? ''; else node.setAttribute(k, v); });
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
async function csrf() { return window.getB2BCsrfToken(); }
async function api(path, options = {}) {
  const write = options.method && options.method !== 'GET';
  if (write && !options.body) options = { ...options, body: '{}' };
  const headers = write ? { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrf() } : {};
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Falha na comunicação com o servidor.');
  return data;
}

function sourceBadge(item) {
  return el('span', { class: `source-badge ${item.source}`, text: item.source === 'auto' ? 'Automático' : `Chat · ${item.requestedBy || 'equipe'}` });
}
function clientLink(item) {
  return item.clientId && item.clientName ? el('a', { class: 'feed-client', href: `/internal/clients#${encodeURIComponent(item.clientId)}`, text: item.clientName }) : null;
}

function renderActivity() {
  const items = state.activity.filter((a) => !['report', 'tip'].includes(a.kind));
  $('count-activity').textContent = items.length || '';
  $('tab-activity').replaceChildren(items.length ? el('ul', { class: 'feed' }, ...items.map((a) => el('li', { class: `feed-item ${a.kind}` },
    el('span', { class: 'feed-icon', text: kindInfo[a.kind]?.[1] || '•' }),
    el('div', { class: 'feed-content' },
      el('div', { class: 'feed-top' }, el('strong', { text: a.title })),
      a.body ? el('p', { class: 'feed-body', text: a.body }) : null,
      el('div', { class: 'feed-meta' }, sourceBadge(a), clientLink(a), el('small', { text: fmt(a.createdAt) })))))) : el('p', { class: 'empty-state', text: 'A IA ainda não registrou nenhuma ação.' }));
}

function renderReports() {
  const items = state.activity.filter((a) => ['report', 'tip'].includes(a.kind));
  $('count-reports').textContent = items.length || '';
  $('tab-reports').replaceChildren(items.length ? el('div', { class: 'report-grid' }, ...items.map((a) => el('article', { class: `report-card ${a.kind}` },
    el('div', { class: 'feed-meta' }, el('span', { class: `kind-pill ${a.kind}`, text: kindInfo[a.kind][0] }), clientLink(a), el('small', { text: fmt(a.createdAt) })),
    el('h3', { text: a.title }), el('p', { class: 'report-body', text: a.body || '' })))) : el('p', { class: 'empty-state', text: 'Nenhum relatório ou dica ainda. Rode "Resumo diário" ou "Clientes parados" no piloto automático.' }));
}

function renderEmails() {
  const drafts = state.emails.filter((e) => e.status === 'draft').length;
  $('count-emails').textContent = drafts || '';
  $('tab-emails').replaceChildren(state.emails.length ? el('div', { class: 'table-scroll' }, el('table', { class: 'emails-table' },
    el('thead', {}, el('tr', {}, ...['Para', 'Assunto', 'Motivo', 'Origem', 'Criado', 'Status', ''].map((h) => el('th', { text: h })))),
    el('tbody', {}, ...state.emails.map((e) => {
      const open = el('button', { class: 'edit-user-button', type: 'button', text: e.status === 'draft' ? 'Revisar' : 'Ver' });
      open.addEventListener('click', () => openEmail(e));
      return el('tr', { class: e.status !== 'draft' ? 'muted-row' : '' },
        el('td', {}, el('div', { class: 'request-meta' }, el('span', { text: e.toName || e.toEmail }), el('small', { text: e.toEmail }), clientLink(e))),
        el('td', { class: 'email-subject', text: e.subject }),
        el('td', { class: 'email-reason', text: e.reason || '—' }),
        el('td', {}, sourceBadge(e)),
        el('td', { class: 'date-cell', text: fmt(e.createdAt) }),
        el('td', {}, el('span', { class: `email-status ${e.status}`, text: emailStatus[e.status] })),
        el('td', {}, open));
    })))) : el('p', { class: 'empty-state', text: 'Nenhum e-mail na caixa de saída.' }));
}

function renderTasks(data) {
  $('autopilot-state').textContent = data.autopilot ? 'Ligado: a IA roda estas tarefas sozinha e registra tudo abaixo.' : 'Desligado no .env (AI_AUTOPILOT=off). Você ainda pode rodar manualmente.';
  $('ai-tasks').replaceChildren(...data.tasks.map((t) => {
    const button = el('button', { class: 'secondary-button', type: 'button', text: t.running ? 'Rodando…' : 'Executar agora' });
    if (t.running) button.disabled = true;
    button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'Rodando…';
      try { await api(`/api/internal/ai/tasks/${t.name}/run`, { method: 'POST' }); } catch (error) { window.alert(error.message); }
      await load();
    });
    const every = t.everyMinutes >= 1440 ? 'uma vez por dia' : `a cada ${t.everyMinutes} min`;
    return el('li', {}, el('div', {}, el('strong', { text: t.label }), el('small', { text: `${every} · última: ${fmt(t.lastRunAt)}` })), button);
  }));
  const status = $('ai-status');
  status.className = `ai-status ${data.available ? 'online' : 'offline'}`;
  status.replaceChildren(el('i'), data.available ? `IA online · ${data.model}` : 'IA offline — inicie o Ollama');
}

async function load() {
  try {
    const data = await api('/api/internal/ai');
    state = data;
    renderTasks(data); renderActivity(); renderEmails(); renderReports();
  } catch (error) {
    $('tab-activity').replaceChildren(el('p', { class: 'empty-state', text: error.message }));
  }
}

function openEmail(e) {
  currentEmail = e;
  $('email-to').value = `${e.toName || ''} <${e.toEmail}>`;
  $('email-subject').value = e.subject;
  $('email-body').value = e.body;
  const editable = e.status === 'draft';
  ['email-subject', 'email-body'].forEach((id) => { $(id).readOnly = !editable; });
  ['email-discard', 'email-save', 'email-sent'].forEach((id) => { $(id).hidden = !editable; });
  $('email-dialog').showModal();
}
async function updateEmail(changes) {
  try {
    await api(`/api/internal/ai/emails/${encodeURIComponent(currentEmail.id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
    $('email-dialog').close();
    await load();
  } catch (error) { window.alert(error.message); }
}
$('email-save').addEventListener('click', () => updateEmail({ subject: $('email-subject').value, body: $('email-body').value }));
$('email-discard').addEventListener('click', () => updateEmail({ status: 'discarded' }));
$('email-sent').addEventListener('click', () => updateEmail({ status: 'sent', subject: $('email-subject').value, body: $('email-body').value }));
$('email-open').addEventListener('click', () => {
  const url = `mailto:${encodeURIComponent(currentEmail.toEmail)}?subject=${encodeURIComponent($('email-subject').value)}&body=${encodeURIComponent($('email-body').value)}`;
  window.location.href = url;
});

document.querySelectorAll('.ai-tabs button').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.ai-tabs button').forEach((b) => b.classList.toggle('active', b === tab));
  ['activity', 'emails', 'reports'].forEach((name) => { $(`tab-${name}`).hidden = name !== tab.dataset.tab; });
}));
$('refresh-ai').addEventListener('click', load);

function addMessage(role, text, actions = []) {
  const box = el('div', { class: `ai-msg ${role}` }, el('p', { text }));
  if (actions.length) box.append(el('div', { class: 'ai-actions' }, el('strong', { text: 'O que eu fiz:' }), el('ul', {}, ...actions.map((a) => el('li', { text: a })))));
  $('ai-messages').append(box);
  $('ai-messages').scrollTop = $('ai-messages').scrollHeight;
  return box;
}
async function send(text) {
  const content = text.trim(); if (!content) return;
  $('ai-suggestions')?.remove();
  addMessage('user', content);
  conversation.push({ role: 'user', content });
  $('ai-input').value = '';
  $('ai-send').disabled = true;
  const thinking = addMessage('assistant thinking', 'Pensando e consultando o banco…');
  const started = Date.now();
  const timer = setInterval(() => { thinking.querySelector('p').textContent = `Pensando e consultando o banco… ${Math.round((Date.now() - started) / 1000)}s`; }, 1000);
  try {
    const result = await api('/api/internal/assistant', { method: 'POST', body: JSON.stringify({ messages: conversation.slice(-10) }) });
    thinking.remove();
    addMessage('assistant', result.answer, result.actions || []);
    conversation.push({ role: 'assistant', content: result.answer });
    if (result.actions?.length) load();
  } catch (error) {
    thinking.remove();
    addMessage('assistant error', error.message);
  } finally {
    clearInterval(timer);
    $('ai-send').disabled = false;
    $('ai-input').focus();
  }
}
$('ai-form').addEventListener('submit', (event) => { event.preventDefault(); send($('ai-input').value); });
$('ai-input').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send($('ai-input').value); } });
document.querySelectorAll('#ai-suggestions button').forEach((b) => b.addEventListener('click', () => send(b.textContent)));

await load();
setInterval(load, 60000);
