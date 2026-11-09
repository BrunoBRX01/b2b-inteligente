async function getCsrfToken() {
  const response = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível validar a sessão.');
  return (await response.json()).token;
}
window.getB2BCsrfToken = getCsrfToken;

const authResponse = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
if (!authResponse.ok) {
  window.location.replace('/login');
} else {
  const { user } = await authResponse.json();
  window.b2bUser = user;
  document.querySelectorAll('.user-name').forEach((element) => { element.textContent = user.fullName; });
  const roleName = user.role === 'admin' ? 'Administrador' : 'Funcionário';
  document.querySelectorAll('.user-role').forEach((element) => { element.textContent = roleName; });
  const initials = user.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  document.querySelectorAll('.user-initials').forEach((element) => { element.textContent = initials || 'U'; });
  document.querySelectorAll('[data-admin-only]').forEach((element) => { element.hidden = user.role !== 'admin'; });
}

document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const token = await getCsrfToken();
    const response = await fetch('/api/auth/logout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'X-CSRF-Token': token }
    });
    if (!response.ok) throw new Error('Não foi possível encerrar a sessão.');
    window.location.assign('/login');
  } catch {
    button.disabled = false;
    window.alert('Não foi possível encerrar a sessão agora. Tente novamente.');
  }
}));
