export async function notifyOwnerOfNewRequest({ id, companyName, productSummary, submissionChannel }) {
  const apiUrl = process.env.MANUS_API_URL;
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiUrl || !apiKey) return { accepted: false, reason: 'service_unavailable' };

  const title = 'Nova solicitação de cotação — B2B Inteligente';
  const content = [
    `Solicitação: ${id}`,
    `Empresa: ${companyName}`,
    `Produto/carga: ${productSummary}`,
    `Canal de entrada: ${submissionChannel === 'chatbot' ? 'Chatbot público' : 'Formulário do site'}`,
    'Os dados de contato completos estão disponíveis na área interna autenticada.'
  ].join('\n');
  if (title.length > 1200 || content.length > 20000) return { accepted: false, reason: 'payload_too_long' };

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/webdevtoken.v1.WebDevService/SendNotification`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'connect-protocol-version': '1'
    },
    body: JSON.stringify({ title, content }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Notificação do proprietário falhou: HTTP ${response.status} ${body.slice(0, 300)}`);
  }
  return { accepted: true };
}
