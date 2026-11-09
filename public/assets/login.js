const loginForm = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const passwordInput = document.getElementById('password');
const showPassword = document.getElementById('show-password');
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());
showPassword?.addEventListener('click', () => {
  const visible = passwordInput.type === 'password';
  passwordInput.type = visible ? 'text' : 'password';
  showPassword.textContent = visible ? 'Ocultar' : 'Mostrar';
  showPassword.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
});
loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  const submit = loginForm.querySelector('button[type="submit"]');
  const data = new FormData(loginForm);
  submit.disabled = true;
  errorBox.className = 'login-error';
  try {
    const csrfResponse = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!csrfResponse.ok) throw new Error('Não foi possível iniciar a sessão segura. Atualize a página e tente novamente.');
    const { token } = await csrfResponse.json();
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify({ email: data.get('email'), password: data.get('password') })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível entrar. Confira os dados e tente novamente.');
    window.location.assign('/internal');
  } catch (error) {
    errorBox.textContent = error.message || 'Ocorreu um erro. Tente novamente.';
    errorBox.classList.add('show');
  } finally {
    submit.disabled = false;
  }
});
