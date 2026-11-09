(() => {
  const launcher = document.getElementById('chatbot-launcher');
  const panel = document.getElementById('chatbot-panel');
  const closeButton = document.getElementById('chatbot-close');
  const messagesElement = document.getElementById('chatbot-messages');
  const actionsElement = document.getElementById('chatbot-actions');
  const form = document.getElementById('chatbot-form');
  const input = document.getElementById('chatbot-input');
  const sendButton = document.getElementById('chatbot-send');
  if (!launcher || !panel || !messagesElement || !actionsElement || !form || !input || !sendButton) return;

  const quoteFields = [
    { key: 'contactName', label: 'Nome completo', prompt: 'Qual é o seu nome completo?', placeholder: 'Seu nome', max: 120 },
    { key: 'companyName', label: 'Empresa', prompt: 'Qual é o nome da empresa?', placeholder: 'Nome da empresa', max: 160 },
    { key: 'email', label: 'E-mail', prompt: 'Qual e-mail podemos usar para o retorno?', placeholder: 'nome@empresa.com', max: 254, validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) },
    { key: 'phone', label: 'Telefone', prompt: 'Qual telefone podemos usar para contato?', placeholder: '+55 (00) 00000-0000', max: 40, validate: (value) => value.replace(/\D/g, '').length >= 7 },
    { key: 'originCountry', label: 'País de origem', prompt: 'De qual país a mercadoria será enviada?', placeholder: 'Ex.: China', max: 100 },
    { key: 'productSummary', label: 'Produto ou tipo de carga', prompt: 'Qual produto ou tipo de carga você pretende importar?', placeholder: 'Descreva o produto ou carga', max: 240 },
    { key: 'destination', label: 'Destino no Brasil', prompt: 'Qual é o destino no Brasil? Informe cidade e estado, se possível.', placeholder: 'Cidade / estado', max: 120 },
    { key: 'estimatedVolume', label: 'Volume aproximado (opcional)', prompt: 'Você sabe o volume aproximado? Pode informar quantidade, peso ou dimensões. Se não souber, digite “pular”.', placeholder: 'Volume, peso ou dimensões', max: 120, optional: true },
    { key: 'details', label: 'Detalhes adicionais (opcional)', prompt: 'Deseja acrescentar algum detalhe importante? Se não, digite “pular”.', placeholder: 'Informações adicionais', max: 2000, optional: true }
  ];

  let history = [];
  let quoteState = null;
  let busy = false;
  let welcomed = false;

  function scrollMessages() {
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }

  function appendMessage(role, content, remember = false) {
    const item = document.createElement('div');
    item.className = `chat-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = content;
    item.append(bubble);
    messagesElement.append(item);
    if (remember && ['user', 'assistant'].includes(role)) {
      history.push({ role, content: String(content).slice(0, 1000) });
      history = history.slice(-8);
    }
    scrollMessages();
  }

  function renderActions(items = []) {
    actionsElement.replaceChildren();
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      if (item.primary) button.classList.add('primary');
      button.addEventListener('click', () => handleAction(item.action));
      actionsElement.append(button);
    }
  }

  function setBusy(value) {
    busy = value;
    input.disabled = value || Boolean(quoteState?.confirming);
    sendButton.disabled = value || Boolean(quoteState?.confirming);
    messagesElement.setAttribute('aria-busy', String(value));
  }

  async function getCsrfToken() {
    const response = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível validar a solicitação. Atualize a página e tente novamente.');
    const result = await response.json();
    if (!result.token) throw new Error('Não foi possível validar a solicitação.');
    return result.token;
  }

  function openPanel() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', 'Fechar assistente virtual');
    if (!welcomed) {
      welcomed = true;
      appendMessage('assistant', 'Olá! Sou o B2B Assistente. Posso esclarecer dúvidas sobre o processo de importação ou ajudar a iniciar uma solicitação de cotação. Como posso ajudar?');
      renderActions([
        { label: 'Quero solicitar cotação', action: 'start-quote', primary: true },
        { label: 'Quais informações preciso?', action: 'faq-info' },
        { label: 'Como acompanho a solicitação?', action: 'faq-tracking' }
      ]);
    }
    closeButton?.focus({ preventScroll: true });
  }

  function closePanel() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Abrir assistente virtual');
    launcher.focus();
  }

  function startQuote() {
    quoteState = { index: 0, data: {}, confirming: false };
    appendMessage('assistant', 'Vamos iniciar sua solicitação. Vou perguntar alguns dados necessários para que a equipe possa analisar a operação. Nada será enviado até você conferir o resumo e confirmar.');
    askQuoteField();
  }

  function askQuoteField() {
    if (!quoteState) return;
    const field = quoteFields[quoteState.index];
    if (!field) return showQuoteSummary();
    input.placeholder = field.placeholder;
    input.maxLength = field.max;
    appendMessage('assistant', field.prompt);
    renderActions(field.optional
      ? [{ label: 'Pular esta pergunta', action: 'skip' }, { label: 'Cancelar cotação', action: 'cancel' }]
      : [{ label: 'Cancelar cotação', action: 'cancel' }]);
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
  }

  function processQuoteAnswer(rawValue) {
    if (!quoteState || busy || quoteState.confirming) return;
    const field = quoteFields[quoteState.index];
    const value = String(rawValue || '').trim();
    if (/^(cancelar|desistir|sair)$/i.test(value)) {
      handleAction('cancel');
      return;
    }
    const skip = field.optional && /^(pular|nao sei|não sei|nao|não)$/i.test(value);
    if (!value && !field.optional) {
      appendMessage('assistant', `O campo “${field.label}” é necessário. ${field.prompt}`);
      return;
    }
    if (!skip && value.length > field.max) {
      appendMessage('assistant', `Esse campo aceita até ${field.max} caracteres. Envie uma versão mais curta.`);
      return;
    }
    if (!skip && field.validate && !field.validate(value)) {
      appendMessage('assistant', field.key === 'email' ? 'Esse e-mail parece inválido. Confira o endereço e tente novamente.' : 'Informe um telefone com pelo menos 7 números.');
      return;
    }
    if (!skip && !field.optional && value.length < 2) {
      appendMessage('assistant', `Informe pelo menos 2 caracteres para “${field.label}”.`);
      return;
    }
    quoteState.data[field.key] = skip ? '' : value;
    quoteState.index += 1;
    askQuoteField();
  }

  function showQuoteSummary() {
    if (!quoteState) return;
    quoteState.confirming = true;
    const data = quoteState.data;
    const lines = quoteFields.map((field) => `${field.label}: ${data[field.key] || 'Não informado'}`);
    appendMessage('assistant', `Confira os dados antes de enviar:\n\n${lines.join('\n')}\n\nAo confirmar, seus dados serão enviados à equipe para tratar esta solicitação. O registro não representa uma cotação final.`);
    input.disabled = true;
    sendButton.disabled = true;
    input.placeholder = 'Confira o resumo acima';
    renderActions([
      { label: 'Confirmar envio da solicitação', action: 'confirm-quote', primary: true },
      { label: 'Cancelar', action: 'cancel' }
    ]);
  }

  async function submitQuote() {
    if (!quoteState?.confirming || busy) return;
    setBusy(true);
    renderActions([]);
    appendMessage('assistant', 'Enviando sua solicitação com segurança…');
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/public/quote', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ ...quoteState.data, submissionChannel: 'chatbot' })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a solicitação agora.');
      if (typeof result.requestId !== 'string' || !result.requestId) throw new Error('O servidor não confirmou o protocolo. Verifique a área de solicitações antes de tentar novamente.');
      const protocol = result.requestId.slice(0, 8).toUpperCase();
      quoteState = null;
      appendMessage('assistant', `Solicitação registrada com sucesso! Seu protocolo é ${protocol}. A equipe poderá entrar em contato pelos dados informados para conversar sobre a análise e os próximos passos.`, false);
      input.placeholder = 'Digite sua pergunta…';
      input.maxLength = 1000;
      renderActions([
        { label: 'Fazer outra pergunta', action: 'new-question' },
        { label: 'Abrir formulário tradicional', action: 'open-form' }
      ]);
    } catch (error) {
      appendMessage('assistant', `${error.message || 'Ocorreu um erro.'} Seus dados continuam nesta conversa. Você pode tentar novamente ou usar o formulário tradicional.`);
      renderActions([
        { label: 'Tentar enviar novamente', action: 'confirm-quote', primary: true },
        { label: 'Abrir formulário tradicional', action: 'open-form' },
        { label: 'Cancelar', action: 'cancel' }
      ]);
    } finally {
      setBusy(false);
      if (!quoteState?.confirming) input.disabled = false;
      actionsElement.querySelector('button')?.focus({ preventScroll: true });
    }
  }

  async function askAssistant(message) {
    if (busy) return;
    const content = String(message || '').trim();
    if (!content) return;
    const restoreInputFocus = document.activeElement === input;
    appendMessage('user', content, true);
    renderActions([]);
    setBusy(true);
    const loading = document.createElement('div');
    loading.className = 'chat-message assistant';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = 'Estou consultando as informações…';
    loading.append(bubble);
    messagesElement.append(loading);
    scrollMessages();
    try {
      const token = await getCsrfToken();
      const response = await fetch('/api/public/chatbot', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ messages: history })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'O assistente não conseguiu responder agora.');
      loading.remove();
      appendMessage('assistant', result.answer || 'Não encontrei uma resposta para essa pergunta.', true);
      renderActions([
        { label: 'Solicitar cotação', action: 'start-quote', primary: true },
        { label: 'Usar formulário', action: 'open-form' }
      ]);
    } catch (error) {
      loading.remove();
      appendMessage('assistant', `${error.message || 'O assistente está temporariamente indisponível.'} Você ainda pode solicitar uma cotação pelo formulário tradicional.`);
      renderActions([{ label: 'Abrir formulário de cotação', action: 'open-form', primary: true }]);
    } finally {
      setBusy(false);
      if (restoreInputFocus) input.focus({ preventScroll: true });
      else actionsElement.querySelector('button')?.focus({ preventScroll: true });
    }
  }

  function handleAction(action) {
    if (busy) return;
    if (action === 'start-quote') {
      appendMessage('user', 'Quero solicitar uma cotação.');
      renderActions([]);
      startQuote();
    } else if (action === 'faq-info') {
      void askAssistant('Quais informações preciso para importar um produto?');
    } else if (action === 'faq-tracking') {
      void askAssistant('Como faço para acompanhar minha solicitação?');
    } else if (action === 'skip' && quoteState) {
      appendMessage('user', 'Pular esta pergunta.');
      processQuoteAnswer('pular');
    } else if (action === 'cancel') {
      quoteState = null;
      input.disabled = false;
      input.placeholder = 'Digite sua pergunta…';
      input.maxLength = 1000;
      appendMessage('assistant', 'Tudo bem. Não enviamos os dados coletados. Se quiser, você pode iniciar uma nova conversa ou usar o formulário da página.');
      renderActions([{ label: 'Iniciar cotação', action: 'start-quote', primary: true }, { label: 'Abrir formulário', action: 'open-form' }]);
      actionsElement.querySelector('button')?.focus({ preventScroll: true });
    } else if (action === 'confirm-quote') {
      void submitQuote();
    } else if (action === 'open-form') {
      const partialData = quoteState?.data;
      if (partialData) {
        const quoteForm = document.getElementById('quote-form');
        for (const [key, value] of Object.entries(partialData)) {
          const field = quoteForm?.elements.namedItem(key);
          if (field && typeof value === 'string') field.value = value;
        }
        appendMessage('assistant', 'Preenchi o formulário tradicional com as informações que você já forneceu. Confira os campos restantes e envie por lá quando estiver pronto.');
      }
      quoteState = null;
      input.disabled = false;
      input.placeholder = 'Digite sua pergunta…';
      input.maxLength = 1000;
      window.location.hash = 'cotacao';
      closePanel();
      document.querySelector('#quote-form input[name="contactName"]')?.focus({ preventScroll: true });
    } else if (action === 'new-question') {
      appendMessage('assistant', 'Claro! Qual é a sua dúvida sobre o processo de importação?');
      renderActions([{ label: 'Solicitar cotação', action: 'start-quote', primary: true }]);
      input.disabled = false;
      input.placeholder = 'Digite sua pergunta…';
      input.maxLength = 1000;
      input.focus();
    }
  }

  launcher.addEventListener('click', () => panel.hidden ? openPanel() : closePanel());
  closeButton?.addEventListener('click', closePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    if (quoteState) {
      appendMessage('user', value);
      processQuoteAnswer(value);
    } else {
      void askAssistant(value);
    }
  });
})();
