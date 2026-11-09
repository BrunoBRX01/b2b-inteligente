const nav = document.getElementById('main-nav');
const menuToggle = document.getElementById('menu-toggle');
menuToggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

const form = document.getElementById('quote-form');
const message = document.getElementById('form-message');
function showFormMessage(text, kind) {
  message.textContent = text;
  message.className = `form-message show ${kind}`;
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  if (String(data.get('website') || '').trim()) return;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.querySelector('.submit-label').textContent = 'Enviando…';
  message.className = 'form-message';
  try {
    const csrfResponse = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!csrfResponse.ok) throw new Error('Não foi possível validar a solicitação. Atualize a página e tente novamente.');
    const { token } = await csrfResponse.json();
    const payload = Object.fromEntries(['contactName', 'companyName', 'email', 'phone', 'originCountry', 'productSummary', 'estimatedVolume', 'destination', 'details'].map((key) => [key, String(data.get(key) || '').trim()]));
    const response = await fetch('/api/public/quote', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Não foi possível enviar agora. Tente novamente.');
    form.reset();
    showFormMessage(`${result.message} Protocolo ${result.requestId.slice(0, 8).toUpperCase()}.`, 'success');
  } catch (error) {
    showFormMessage(error.message || 'Ocorreu um erro. Tente novamente.', 'error');
  } finally {
    submit.disabled = false;
    submit.querySelector('.submit-label').textContent = 'Enviar solicitação';
  }
});
