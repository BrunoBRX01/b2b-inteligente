const byId = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const currencyCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const number = (value) => Number(value || 0).toLocaleString('pt-BR');
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const fullDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const parseDate = (value) => new Date(String(value).replace(' ', 'T') + (String(value).length > 10 ? 'Z' : 'T12:00:00'));
const statusInfo = {
  delivered: ['Entregue', 'entregue'], delayed: ['Atrasado', 'atrasado'], pending: ['Aguardando embarque', 'pendente'],
  in_transit: ['Em trânsito', 'pendente'], customs: ['Desembaraço', 'pendente'], cancelled: ['Cancelado', 'atrasado']
};
const filterGroup = { delivered: 'Entregue', delayed: 'Atrasado', pending: 'Pendente', in_transit: 'Pendente', customs: 'Pendente', cancelled: 'Cancelado' };
let pedidos = [];
let visibleLimit = 25;

byId('current-date').textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date()).toLocaleUpperCase('pt-BR');
byId('footer-year').textContent = String(new Date().getFullYear());

function renderChart(series) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.received, d.delivered)));
  const top = Math.ceil(max / 3) * 3;
  const x = (i) => (series.length < 2 ? 0 : (i / (series.length - 1)) * 760);
  const y = (v) => 210 - (v / top) * 180;
  const line = (key) => series.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ');
  byId('chart-received').setAttribute('d', line('received'));
  byId('chart-delivered').setAttribute('d', line('delivered'));
  byId('chart-area').setAttribute('d', `${line('delivered')} L760 210 L0 210 Z`);
  byId('y-labels').replaceChildren(...[top, (top * 2) / 3, top / 3, 0].map((v) => { const s = document.createElement('span'); s.textContent = Math.round(v); return s; }));
  const step = Math.max(1, Math.floor((series.length - 1) / 5));
  const labels = series.filter((_, i) => i % step === 0).slice(0, 6);
  byId('x-labels').replaceChildren(...labels.map((d) => { const s = document.createElement('span'); s.textContent = shortDate.format(parseDate(d.day)); return s; }));
}

function renderOrders() {
  const query = byId('search').value.trim().toLocaleLowerCase('pt-BR');
  const selectedStatus = byId('status-filter').value;
  const filtered = pedidos.filter((p) => `${p.code} ${p.clientName} ${p.product} ${p.originCountry}`.toLocaleLowerCase('pt-BR').includes(query)
    && (selectedStatus === 'todos' || filterGroup[p.status] === selectedStatus));
  const shown = filtered.slice(0, visibleLimit);
  const body = byId('lista-pedidos');
  body.replaceChildren();
  if (!shown.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td');
    cell.colSpan = 6; cell.className = 'empty-state'; cell.textContent = pedidos.length ? 'Nenhum embarque encontrado com esses filtros.' : 'Nenhum embarque no período.'; row.append(cell); body.append(row);
  }
  shown.forEach((p) => {
    const row = document.createElement('tr');
    const idCell = document.createElement('td'); idCell.className = 'order-id'; idCell.textContent = p.code;
    idCell.title = `${p.product} · ${p.originCountry} → ${p.destinationPort}`;
    const customerCell = document.createElement('td'); const customer = document.createElement('a'); customer.className = 'customer-cell';
    customer.href = `/internal/clients#${encodeURIComponent(p.clientId)}`;
    const avatar = document.createElement('span'); avatar.className = 'customer-avatar';
    avatar.textContent = p.clientName.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const name = document.createElement('span'); name.textContent = p.clientName; customer.append(avatar, name); customerCell.append(customer);
    const dateCell = document.createElement('td'); dateCell.className = 'date-cell'; dateCell.textContent = fullDate.format(parseDate(p.orderedAt));
    const amountCell = document.createElement('td'); amountCell.className = 'amount-cell'; amountCell.textContent = currencyCents.format(p.revenueBrl);
    const statusCell = document.createElement('td'); const badge = document.createElement('span');
    const [label, cls] = statusInfo[p.status] || [p.status, 'pendente'];
    badge.className = `status ${cls}`; badge.textContent = label; statusCell.append(badge);
    const actionCell = document.createElement('td'); const action = document.createElement('button'); action.type = 'button'; action.className = 'row-more';
    action.setAttribute('aria-label', `Detalhes do embarque ${p.code}`); action.textContent = '···';
    action.addEventListener('click', () => showToast(`${p.code}: ${p.product} · ${p.originPort} (${p.originCountry}) → ${p.destinationPort} · ${p.transportMode} · ETA ${p.eta ? fullDate.format(parseDate(p.eta)) : '—'}`));
    actionCell.append(action); row.append(idCell, customerCell, dateCell, amountCell, statusCell, actionCell); body.append(row);
  });
  byId('table-count').textContent = `Exibindo ${shown.length} de ${filtered.length} embarques`;
  byId('more-orders').hidden = shown.length >= filtered.length;
}

async function loadDashboard() {
  const days = byId('period').value;
  try {
    const response = await fetch(`/api/internal/dashboard?days=${encodeURIComponent(days)}`, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o painel.');
    const { kpis, current, series, byStatus, recent, clientStats } = data;
    byId('total-pedidos').textContent = number(kpis.total);
    byId('pedidos-entregues').textContent = number(kpis.delivered);
    byId('pedidos-atrasados').textContent = number(current.delayed);
    byId('pedidos-pendentes').textContent = number(current.open);
    byId('nav-open-count').textContent = number(current.open);
    const feet = document.querySelectorAll('.kpi-foot .trend');
    const deliveredRate = kpis.total ? Math.round((kpis.delivered / kpis.total) * 100) : 0;
    [`${number(kpis.activeClients)} clientes atendidos`, `${deliveredRate}% do período`, 'Prazo previsto vencido', `${number(clientStats.active)} clientes ativos`]
      .forEach((t, i) => { if (feet[i]) feet[i].textContent = t; });
    const counts = Object.fromEntries(byStatus.map((s) => [s.status, s.count]));
    const delivered = counts.delivered || 0; const late = (counts.delayed || 0) + (counts.cancelled || 0);
    const open = (counts.pending || 0) + (counts.in_transit || 0) + (counts.customs || 0);
    const total = delivered + late + open;
    byId('donut-total').textContent = number(total);
    byId('qtd-entregues').textContent = number(delivered);
    byId('qtd-atrasados').textContent = number(late);
    byId('qtd-pendentes').textContent = number(open);
    const dp = (delivered / (total || 1)) * 100; const lp = (late / (total || 1)) * 100;
    byId('donut').style.background = `conic-gradient(#35ad83 0 ${dp}%, #e8767b ${dp}% ${dp + lp}%, #e3a747 ${dp + lp}% 100%)`;
    byId('chart-total').textContent = compact.format(kpis.revenueBrl).replace(/^/, 'R$ ');
    byId('chart-subtitle').textContent = `Recebidos e entregues por dia · ${currency.format(kpis.revenueBrl)} faturados`;
    renderChart(series);
    pedidos = recent;
    visibleLimit = 25;
    renderOrders();
  } catch (error) {
    showToast(error.message);
  }
}

byId('search').addEventListener('input', () => { visibleLimit = 25; renderOrders(); });
byId('status-filter').addEventListener('change', () => { visibleLimit = 25; renderOrders(); });
byId('more-orders').addEventListener('click', () => { visibleLimit += 25; renderOrders(); });
byId('period').addEventListener('change', loadDashboard);

let toastTimer;
function showToast(message) {
  const toast = byId('toast'); toast.textContent = message; toast.classList.add('show');
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4000);
}
byId('dismiss-notice').addEventListener('click', () => document.querySelector('.demo-notice').remove());
byId('export-btn').addEventListener('click', () => {
  const header = ['Embarque', 'Cliente', 'Data', 'Origem', 'Destino', 'Modal', 'Produto', 'NCM', 'Valor mercadoria (USD)', 'Faturamento (BRL)', 'Status'];
  const rows = pedidos.map((p) => [p.code, p.clientName, p.orderedAt, `${p.originPort} (${p.originCountry})`, p.destinationPort, p.transportMode, p.product, p.ncm,
    Number(p.goodsValueUsd).toFixed(2).replace('.', ','), Number(p.revenueBrl).toFixed(2).replace('.', ','), (statusInfo[p.status] || [p.status])[0]]);
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `embarques-${byId('period').value}-dias.csv`; link.click(); URL.revokeObjectURL(url);
  showToast(`Relatório exportado com ${rows.length} embarques.`);
});
loadDashboard();

const openChat = () => { document.body.classList.add('chat-open'); byId('chat-drawer').setAttribute('aria-hidden', 'false'); window.setTimeout(() => byId('chat-input').focus(), 250); };
const closeChat = () => { document.body.classList.remove('chat-open'); byId('chat-drawer').setAttribute('aria-hidden', 'true'); };
byId('open-chat').addEventListener('click', openChat);
document.querySelectorAll('a[href="#assistente"]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); openChat(); }));
byId('close-chat').addEventListener('click', closeChat);
byId('chat-backdrop').addEventListener('click', closeChat);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeChat(); });

const conversation = [];
function addMessage(text, role, actions = []) {
  const wrapper = document.createElement('div'); wrapper.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  if (role !== 'user') { const avatar = document.createElement('span'); avatar.className = 'message-avatar'; avatar.textContent = '✳'; wrapper.append(avatar); }
  const content = document.createElement('div'); const paragraph = document.createElement('p'); paragraph.textContent = text; paragraph.style.whiteSpace = 'pre-wrap'; content.append(paragraph);
  if (actions.length) {
    const list = document.createElement('ul'); list.style.cssText = 'margin:6px 0 0;padding-left:16px;color:#287b59;font-size:10px';
    actions.forEach((a) => { const li = document.createElement('li'); li.textContent = `✓ ${a}`; list.append(li); });
    content.append(list);
  }
  const time = document.createElement('small'); time.textContent = 'Agora'; content.append(time); wrapper.append(content); byId('chat-messages').append(wrapper); byId('chat-messages').scrollTop = byId('chat-messages').scrollHeight;
  return wrapper;
}
async function sendChatMessage(text) {
  const clean = text.trim(); if (!clean) return;
  document.querySelector('.suggestions')?.remove();
  conversation.push({ role: 'user', content: clean }); addMessage(clean, 'user'); byId('chat-input').value = '';
  const submit = byId('chat-form').querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = '…';
  const thinking = addMessage('Pensando e consultando o banco…', 'assistant');
  try {
    const csrfResponse = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!csrfResponse.ok) throw new Error('Sua sessão precisa ser atualizada. Recarregue a página e entre novamente.');
    const { token } = await csrfResponse.json();
    const response = await fetch('/api/internal/assistant', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ messages: conversation.slice(-10) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'O assistente não conseguiu responder.');
    thinking.remove();
    conversation.push({ role: 'assistant', content: result.answer }); addMessage(result.answer, 'assistant', result.actions || []);
    if (result.actions?.length) loadDashboard();
  } catch (error) {
    thinking.remove();
    addMessage(error.message || 'Ocorreu um erro ao consultar o assistente.', 'assistant');
  } finally { submit.disabled = false; submit.textContent = '↑'; byId('chat-input').focus(); }
}
byId('chat-form').addEventListener('submit', (event) => { event.preventDefault(); sendChatMessage(byId('chat-input').value); });
document.querySelectorAll('.suggestions button').forEach((button) => button.addEventListener('click', () => sendChatMessage(button.textContent)));
byId('mobile-menu').addEventListener('click', () => byId('sidebar').classList.toggle('mobile-open'));
document.querySelectorAll('.main-nav a[href^="#"]').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.main-nav .nav-link').forEach((item) => item.classList.remove('active'));
  link.classList.add('active'); byId('sidebar').classList.remove('mobile-open');
}));
