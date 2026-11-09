const usersBody = document.getElementById('users-body');
const usersMessage = document.getElementById('users-message');
const createForm = document.getElementById('create-user-form');
const dialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-user-form');
const editMessage = document.getElementById('edit-message');
let currentUsers = [];
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

function showMessage(target, text, kind) { target.textContent = text; target.className = `admin-message show ${kind}`; }
function addCell(row, text) { const cell = document.createElement('td'); cell.textContent = text ?? '—'; row.append(cell); return cell; }
function rolePill(role) { const badge = document.createElement('span'); badge.className = `role-pill ${role}`; badge.textContent = role === 'admin' ? 'Administrador' : 'Funcionário'; return badge; }
function activePill(active) { const badge = document.createElement('span'); badge.className = `active-pill ${active ? 'active' : 'inactive'}`; badge.textContent = active ? 'Ativa' : 'Desativada'; return badge; }
function renderUsers() {
  usersBody.replaceChildren();
  if (!currentUsers.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 6; cell.className = 'empty-state'; cell.textContent = 'Nenhuma conta cadastrada.'; row.append(cell); usersBody.append(row); return; }
  currentUsers.forEach((user) => {
    const row = document.createElement('tr');
    addCell(row, user.fullName); addCell(row, user.email);
    const roleCell = document.createElement('td'); roleCell.append(rolePill(user.role)); row.append(roleCell);
    const activeCell = document.createElement('td'); activeCell.append(activePill(Boolean(user.isActive))); row.append(activeCell);
    const date = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
    addCell(row, date && !Number.isNaN(date.getTime()) ? dateFormat.format(date) : 'Ainda não acessou');
    const actions = document.createElement('td');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'edit-user-button'; button.textContent = 'Editar'; button.addEventListener('click', () => openEdit(user));
    actions.append(button); row.append(actions); usersBody.append(row);
  });
}
async function loadUsers() {
  usersBody.replaceChildren();
  try {
    const response = await fetch('/api/admin/users', { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os usuários.');
    currentUsers = result.users || []; renderUsers();
  } catch (error) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 6; cell.className = 'empty-state'; cell.textContent = error.message; row.append(cell); usersBody.append(row);
  }
}
createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!createForm.reportValidity()) return;
  const button = createForm.querySelector('button[type="submit"]'); button.disabled = true;
  const data = new FormData(createForm);
  try {
    const csrf = await window.getB2BCsrfToken();
    const response = await fetch('/api/admin/users', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(Object.fromEntries(data.entries())) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível criar a conta.');
    createForm.reset(); showMessage(usersMessage, 'Conta criada. Compartilhe a senha inicial com a pessoa por um canal seguro.', 'success'); await loadUsers();
  } catch (error) { showMessage(usersMessage, error.message, 'error'); }
  finally { button.disabled = false; }
});
function openEdit(user) {
  editForm.elements.id.value = user.id;
  editForm.elements.fullName.value = user.fullName;
  editForm.elements.email.value = user.email;
  editForm.elements.role.value = user.role;
  editForm.elements.isActive.checked = Boolean(user.isActive);
  editForm.elements.password.value = '';
  editForm.elements.isActive.disabled = window.b2bUser?.id === user.id;
  editMessage.className = 'admin-message';
  dialog.showModal();
}
async function saveEdit(event) {
  event.preventDefault();
  if (!editForm.reportValidity()) return;
  const data = new FormData(editForm);
  const payload = { fullName: data.get('fullName'), email: data.get('email'), role: data.get('role'), isActive: editForm.elements.isActive.checked };
  if (String(data.get('password') || '').length) payload.password = data.get('password');
  const button = editForm.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const csrf = await window.getB2BCsrfToken();
    const response = await fetch(`/api/admin/users/${encodeURIComponent(data.get('id'))}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a conta.');
    dialog.close(); showMessage(usersMessage, 'Alterações salvas. As sessões dessa conta foram encerradas.', 'success'); await loadUsers();
  } catch (error) { showMessage(editMessage, error.message, 'error'); }
  finally { button.disabled = false; }
}
editForm.addEventListener('submit', saveEdit);
document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
document.getElementById('cancel-dialog').addEventListener('click', () => dialog.close());
document.getElementById('refresh-users').addEventListener('click', loadUsers);
await loadUsers();
