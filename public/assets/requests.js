const statusLabels = { new: 'Nova', reviewing: 'Em análise', contacted: 'Contatada', closed: 'Encerrada' };
const channelLabels = { website_form: 'Formulário do site', chatbot: 'Chatbot' };
let requests = [];
const body = document.getElementById('requests-body');
const search = document.getElementById('request-search');
const filter = document.getElementById('request-status');
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

function makeCell(text, className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text || '—';
  return cell;
}
function render() {
  const q = search.value.trim().toLocaleLowerCase('pt-BR');
  const selected = filter.value;
  const visible = requests.filter((request) => {
    const haystack = `${request.companyName} ${request.contactName} ${request.email} ${request.productSummary} ${channelLabels[request.submissionChannel] || ''}`.toLocaleLowerCase('pt-BR');
    return (!q || haystack.includes(q)) && (selected === 'all' || request.status === selected);
  });
  body.replaceChildren();
  if (!visible.length) {
    const row = document.createElement('tr');
    const cell = makeCell(requests.length ? 'Nenhuma solicitação combina com o filtro.' : 'Ainda não há solicitações cadastradas.', 'empty-state');
    cell.colSpan = 6;
    row.append(cell);
    body.append(row);
  } else {
    visible.forEach((request) => {
      const row = document.createElement('tr');
      const contactCell = document.createElement('td');
      const company = document.createElement('div'); company.className = 'request-company';
      const name = document.createElement('strong'); name.textContent = request.companyName;
      const contact = document.createElement('small'); contact.textContent = request.contactName;
      const links = document.createElement('div'); links.className = 'request-meta';
      const email = document.createElement('a'); email.href = `mailto:${encodeURIComponent(request.email)}`; email.textContent = request.email;
      const phone = document.createElement('span'); phone.textContent = request.phone;
      links.append(email, phone); company.append(name, contact, links); contactCell.append(company);
      const route = document.createElement('td'); route.className = 'request-meta';
      const from = document.createElement('span'); from.textContent = `Origem: ${request.originCountry}`;
      const to = document.createElement('span'); to.textContent = `Destino: ${request.destination}`; route.append(from, to);
      const product = document.createElement('td'); product.className = 'request-meta request-product';
      const summary = document.createElement('span'); summary.textContent = request.productSummary;
      const volume = document.createElement('small'); volume.textContent = request.estimatedVolume ? `Volume: ${request.estimatedVolume}` : '';
      const details = document.createElement('small'); details.textContent = request.details ? `Observações: ${request.details}` : '';
      const aiNote = document.createElement('small'); aiNote.className = 'request-ai-note'; aiNote.textContent = request.aiNotes || '';
      product.append(summary, volume, details, aiNote);
      const received = document.createElement('td'); received.className = 'date-cell';
      const date = new Date(request.createdAt); received.textContent = Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date);
      const channelCell = document.createElement('td');
      const channelBadge = document.createElement('span'); channelBadge.className = 'request-channel';
      channelBadge.textContent = channelLabels[request.submissionChannel] || 'Canal não identificado';
      channelCell.append(channelBadge);
      const statusCell = document.createElement('td');
      const select = document.createElement('select'); select.className = 'request-status-select'; select.setAttribute('aria-label', `Status da solicitação ${request.companyName}`);
      Object.entries(statusLabels).forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = value === request.status; select.append(option); });
      select.addEventListener('change', () => updateStatus(request, select));
      statusCell.append(select);
      row.append(contactCell, route, product, received, channelCell, statusCell); body.append(row);
    });
  }
  document.getElementById('request-total').textContent = `${visible.length} de ${requests.length} solicitações`;
}
async function loadRequests() {
  body.replaceChildren();
  const row = document.createElement('tr'); const cell = makeCell('Carregando solicitações…', 'empty-state'); cell.colSpan = 6; row.append(cell); body.append(row);
  try {
    const response = await fetch('/api/internal/requests', { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as solicitações.');
    requests = result.requests || [];
    render();
  } catch (error) {
    const tr = document.createElement('tr'); const td = makeCell(error.message, 'empty-state'); td.colSpan = 6; tr.append(td); body.replaceChildren(tr);
  }
}
async function updateStatus(request, select) {
  select.disabled = true;
  try {
    const csrf = await window.getB2BCsrfToken();
    const response = await fetch(`/api/internal/requests/${encodeURIComponent(request.id)}`, {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ status: select.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível alterar o status.');
    request.status = select.value;
    render();
  } catch (error) {
    window.alert(error.message);
    await loadRequests();
  } finally { select.disabled = false; }
}
search.addEventListener('input', render);
filter.addEventListener('change', render);
document.getElementById('refresh-requests').addEventListener('click', loadRequests);
await loadRequests();
