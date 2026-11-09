const $ = (id) => document.getElementById(id);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brlCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num = (v) => Number(v || 0).toLocaleString('pt-BR');
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const parseDate = (v) => new Date(String(v).replace(' ', 'T') + (String(v).length > 10 ? 'Z' : 'T12:00:00'));
const fmtDate = (v) => (v ? dateFmt.format(parseDate(v)) : '—');
const statusLabels = { active: 'Ativo', prospect: 'Prospect', inactive: 'Inativo', blocked: 'Bloqueado' };
const sizeLabels = { micro: 'Microempresa', pequena: 'Pequena', media: 'Média', grande: 'Grande' };
const shipmentStatus = { delivered: ['Entregue', 'entregue'], delayed: ['Atrasado', 'atrasado'], pending: ['Aguardando', 'pendente'], in_transit: ['Em trânsito', 'pendente'], customs: ['Desembaraço', 'pendente'], cancelled: ['Cancelado', 'atrasado'] };
const modeLabels = { maritimo: 'Marítimo', aereo: 'Aéreo', rodoviario: 'Rodoviário' };
const kindLabels = { ligacao: 'Ligação', email: 'E-mail', reuniao: 'Reunião', visita: 'Visita', whatsapp: 'WhatsApp' };
let clients = [];
let limit = 40;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => { if (k === 'class') node.className = v; else if (k === 'text') node.textContent = v ?? '—'; else node.setAttribute(k, v); });
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

function filtered() {
  const q = $('client-search').value.trim().toLocaleLowerCase('pt-BR');
  const st = $('client-status').value; const seg = $('client-segment').value; const uf = $('client-state').value;
  return clients.filter((c) => (st === 'all' || c.status === st) && (seg === 'all' || c.segment === seg) && (uf === 'all' || c.state === uf)
    && (!q || `${c.tradeName} ${c.legalName} ${c.cnpj} ${c.city} ${c.primaryContact} ${c.code}`.toLocaleLowerCase('pt-BR').includes(q)));
}

function render() {
  const list = filtered();
  const body = $('clients-body');
  body.replaceChildren();
  if (!list.length) body.append(el('tr', {}, Object.assign(el('td', { class: 'empty-state', text: 'Nenhum cliente encontrado.' }), { colSpan: 8 })));
  list.slice(0, limit).forEach((c) => {
    const nameBtn = el('button', { class: 'client-link', type: 'button' }, el('strong', { text: c.tradeName }), el('small', { text: `${c.code} · ${c.cnpj}` }));
    nameBtn.addEventListener('click', () => openClient(c.id));
    body.append(el('tr', {},
      el('td', {}, nameBtn),
      metaCell( el('span', { text: c.segment }), el('small', { text: sizeLabels[c.companySize] })),
      metaCell( el('span', { text: `${c.city}/${c.state}` })),
      metaCell( el('span', { text: c.primaryContact }), el('small', { text: c.primaryEmail })),
      el('td', { class: 'num-cell', text: num(c.shipments) }),
      el('td', { class: 'num-cell', text: brl.format(c.revenueBrl) }),
      el('td', { class: 'date-cell', text: fmtDate(c.lastShipmentAt) }),
      el('td', {}, el('span', { class: `client-status ${c.status}`, text: statusLabels[c.status] }))
    ));
  });
  $('client-total').textContent = `${num(list.length)} de ${num(clients.length)} clientes`;
  $('client-page-info').textContent = `Exibindo ${num(Math.min(limit, list.length))} de ${num(list.length)}`;
  $('client-more').hidden = limit >= list.length;
}

function renderKpis() {
  const active = clients.filter((c) => c.status === 'active');
  const revenue = clients.reduce((s, c) => s + c.revenueBrl, 0);
  const shipments = clients.reduce((s, c) => s + c.shipments, 0);
  const cards = [
    ['Clientes na carteira', num(clients.length), `${num(active.length)} ativos`],
    ['Prospects', num(clients.filter((c) => c.status === 'prospect').length), 'Em negociação'],
    ['Embarques (18 meses)', num(shipments), `${num(Math.round(shipments / Math.max(1, active.length)))} por cliente ativo`],
    ['Faturamento acumulado', brl.format(revenue), 'Frete + taxas de serviço']
  ];
  $('client-kpis').replaceChildren(...cards.map(([label, value, foot]) => el('article', { class: 'kpi-card' },
    el('div', { class: 'kpi-top' }, el('span', { text: label })), el('div', { class: 'kpi-value', text: value }), el('div', { class: 'kpi-foot' }, el('span', { class: 'trend neutral', text: foot })))));
}

function fillSelect(id, values) {
  const select = $(id);
  [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((v) => select.append(el('option', { value: v, text: v })));
}

function metaCell(...children) { return el('td', {}, el('div', { class: 'request-meta' }, ...children)); }
function field(label, value) { return el('div', { class: 'field' }, el('small', { text: label }), el('span', { text: value || '—' })); }

async function openClient(id) {
  const dialog = $('client-dialog'); const box = $('client-detail');
  box.replaceChildren(el('p', { class: 'empty-state', text: 'Carregando ficha…' }));
  if (!dialog.open) dialog.showModal();
  history.replaceState(null, '', `#${encodeURIComponent(id)}`);
  try {
    const response = await fetch(`/api/internal/clients/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o cliente.');
    const { client: c, contacts, summary, shipments, interactions } = data;
    const close = el('button', { class: 'dialog-close', type: 'button', 'aria-label': 'Fechar' }, '×');
    close.addEventListener('click', () => dialog.close());
    const address = [c.street && `${c.street}, ${c.number}`, c.district, `${c.city}/${c.state}`, c.zipCode].filter(Boolean).join(' · ');
    box.replaceChildren(
      el('div', { class: 'dialog-head' },
        el('div', {}, el('p', { class: 'eyebrow', text: `${c.code} · ${c.segment}` }), el('h2', { id: 'client-dialog-title', text: c.tradeName }),
          el('p', { class: 'client-legal', text: `${c.legalName} · CNPJ ${c.cnpj}` })),
        el('div', { class: 'dialog-head-side' }, el('span', { class: `client-status ${c.status}`, text: statusLabels[c.status] }), close)),
      el('div', { class: 'client-summary' },
        ...[['Embarques', num(summary.shipments)], ['Entregues', num(summary.delivered)], ['Em andamento', num(summary.open)], ['Atrasados', num(summary.delayed)],
          ['Faturamento', brl.format(summary.revenueBrl)], ['Mercadoria importada', usd.format(summary.goodsValueUsd)]]
          .map(([l, v]) => el('div', {}, el('small', { text: l }), el('strong', { text: v })))),
      el('h3', { text: 'Dados cadastrais' }),
      el('div', { class: 'field-grid' },
        field('Inscrição estadual', c.stateRegistration), field('Porte', `${sizeLabels[c.companySize]} · ${num(c.employees)} funcionários`),
        field('Faturamento anual estimado', brl.format(c.annualRevenueBrl)), field('Limite de crédito', brl.format(c.creditLimitBrl)),
        field('Prazo de pagamento', `${c.paymentTermsDays} dias`), field('Classificação / NPS', `${c.rating || '—'} · NPS ${c.npsScore ?? '—'}`),
        field('Cliente desde', fmtDate(c.clientSince)), field('Origem do lead', c.leadSource), field('Gerente de conta', c.accountManager),
        field('Telefone', c.phone), field('E-mail', c.email), field('Site', c.website), el('div', { class: 'field wide' }, el('small', { text: 'Endereço' }), el('span', { text: address }))),
      c.notes ? el('p', { class: 'client-notes', text: `Observação: ${c.notes}` }) : null,
      el('h3', { text: `Contatos (${contacts.length})` }),
      el('div', { class: 'contact-grid' }, ...contacts.map((p) => el('div', { class: 'contact-card' },
        el('strong', { text: p.fullName }), p.isPrimary ? el('span', { class: 'primary-tag', text: 'Principal' }) : null,
        el('small', { text: `${p.jobTitle} · ${p.department}` }), el('span', { text: p.email }), el('span', { text: `${p.phone} · ${p.mobile}` })))),
      el('h3', { text: 'Últimos embarques' }),
      el('div', { class: 'table-scroll' }, el('table', { class: 'detail-table' },
        el('thead', {}, el('tr', {}, ...['Código', 'Data', 'Produto', 'Rota', 'Modal', 'Faturamento', 'Status'].map((h) => el('th', { text: h })))),
        el('tbody', {}, ...(shipments.length ? shipments.map((s) => {
          const [label, cls] = shipmentStatus[s.status] || [s.status, 'pendente'];
          return el('tr', {}, el('td', { class: 'order-id', text: s.code }), el('td', { class: 'date-cell', text: fmtDate(s.orderedAt) }),
            metaCell( el('span', { text: s.product }), el('small', { text: `NCM ${s.ncm} · ${s.incoterm}` })),
            metaCell( el('span', { text: `${s.originPort} (${s.originCountry})` }), el('small', { text: `→ ${s.destinationPort}` })),
            el('td', { text: modeLabels[s.transportMode] }), el('td', { class: 'num-cell', text: brlCents.format(s.revenueBrl) }),
            el('td', {}, el('span', { class: `status ${cls}`, text: label })));
        }) : [el('tr', {}, Object.assign(el('td', { class: 'empty-state', text: 'Sem embarques registrados.' }), { colSpan: 7 }))])))),
      el('h3', { text: 'Histórico de relacionamento' }),
      el('ul', { class: 'timeline' }, ...interactions.map((i) => el('li', {},
        el('span', { class: 'timeline-kind', text: kindLabels[i.kind] }), el('div', {}, el('span', { text: i.summary }), el('small', { text: `${fmtDate(i.occurredAt)} · ${i.userName || 'Equipe'}` })))))
    );
  } catch (error) {
    box.replaceChildren(el('p', { class: 'empty-state', text: error.message }));
  }
}

$('client-dialog').addEventListener('close', () => history.replaceState(null, '', location.pathname));
$('client-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
['client-search', 'client-status', 'client-segment', 'client-state'].forEach((id) => $(id).addEventListener(id === 'client-search' ? 'input' : 'change', () => { limit = 40; render(); }));
$('client-more').addEventListener('click', () => { limit += 40; render(); });
$('export-clients').addEventListener('click', () => {
  const rows = filtered().map((c) => [c.code, c.tradeName, c.legalName, c.cnpj, c.segment, sizeLabels[c.companySize], c.city, c.state, c.primaryContact, c.primaryEmail,
    c.shipments, Number(c.revenueBrl).toFixed(2).replace('.', ','), c.lastShipmentAt || '', statusLabels[c.status]]);
  const header = ['Código', 'Nome fantasia', 'Razão social', 'CNPJ', 'Segmento', 'Porte', 'Cidade', 'UF', 'Contato', 'E-mail', 'Embarques', 'Faturamento (BRL)', 'Último embarque', 'Status'];
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'clientes.csv'; a.click(); URL.revokeObjectURL(url);
});

try {
  const response = await fetch('/api/internal/clients', { credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os clientes.');
  clients = data.clients;
  fillSelect('client-segment', clients.map((c) => c.segment));
  fillSelect('client-state', clients.map((c) => c.state));
  renderKpis();
  render();
  if (location.hash.length > 1) openClient(decodeURIComponent(location.hash.slice(1)));
} catch (error) {
  $('clients-body').replaceChildren(el('tr', {}, Object.assign(el('td', { class: 'empty-state', text: error.message }), { colSpan: 8 })));
}
