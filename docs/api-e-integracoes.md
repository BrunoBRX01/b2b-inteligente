# B2B Inteligente — contrato das APIs públicas e integrações

**Documento:** API-001  
**Revisão:** 1.0  
**Data:** 30/10/2026  
**Status:** contrato das rotas implementadas; Webhook externo apenas proposto.

## 1. Convenções

- Base local: `/api`.
- Formato de entrada e saída: JSON, salvo `/healthz`.
- Requisições `POST` públicas exigem token CSRF.
- Para obter o token, chamar `GET /api/csrf`; o servidor define o cookie `b2b_csrf` e retorna `{ "token": "..." }`.
- Enviar o token no cabeçalho `X-CSRF-Token` e manter `credentials: 'same-origin'` no navegador.
- Não enviar chaves de IA ou credenciais de integração pelo navegador.

## 2. `POST /api/public/chatbot`

**Objetivo:** responder perguntas gerais sobre os serviços, o processo de importação e a solicitação de cotação. Não consulta banco de dados, dashboard, usuários, sessões ou solicitações existentes.

**Acesso:** público, com CSRF e limite de 10 mensagens por minuto por IP.

### Requisição

```json
{
  "messages": [
    { "role": "user", "content": "Quais informações preciso para importar um produto?" }
  ]
}
```

Regras:

- `messages` deve conter ao menos uma mensagem válida e terminar com `role: "user"`.
- São aceitos os papéis `user` e `assistant`.
- O servidor considera no máximo as últimas 8 mensagens.
- Cada conteúdo é limitado a 1.000 caracteres.
- A conversa não é persistida no banco.
- Os dados coletados no fluxo guiado de cotação não são enviados a esta rota.

### Resposta de sucesso

```json
{
  "answer": "Para iniciar a análise de uma importação...",
  "mode": "knowledge"
}
```

`mode` pode ser:

- `knowledge`: resposta determinística da base institucional aprovada;
- `ai`: resposta produzida pela IA server-side, quando configurada;
- `fallback`: resposta segura quando não há credenciais de IA disponíveis para uma pergunta aberta.

### Erros esperados

| HTTP | Situação |
|---|---|
| 400 | Histórico ausente ou inválido |
| 403 | Token CSRF ausente ou inválido |
| 429 | Limite de mensagens excedido |
| 502 | Serviço externo de IA indisponível para uma pergunta que depende dele |

O frontend deve mostrar uma mensagem simples e manter o formulário tradicional acessível. Não deve exibir detalhes técnicos da falha.

## 3. `POST /api/public/quote`

**Objetivo:** registrar uma nova solicitação de cotação. É utilizado pelo formulário tradicional e pelo fluxo guiado do chatbot.

**Acesso:** público, com CSRF e limite de 5 solicitações por 15 minutos por IP.

### Campos

| Campo | Obrigatório | Limite | Observação |
|---|---:|---:|---|
| `contactName` | Sim | 120 | Nome da pessoa de contato |
| `companyName` | Sim | 160 | Empresa |
| `email` | Sim | 254 | E-mail válido; normalizado para minúsculas |
| `phone` | Sim | 40 | Pelo menos 7 caracteres no servidor |
| `originCountry` | Sim | 100 | País de origem |
| `productSummary` | Sim | 240 | Produto ou tipo de carga |
| `destination` | Sim | 120 | Destino no Brasil |
| `estimatedVolume` | Não | 120 | Quantidade, peso ou dimensões |
| `details` | Não | 2.000 | Observações adicionais |
| `submissionChannel` | Não | — | `website_form` ou `chatbot`; padrão `website_form` quando omitido. Outros valores são rejeitados com HTTP 400. |

### Resposta de sucesso

HTTP `201`:

```json
{
  "ok": true,
  "requestId": "UUID-GERADO-PELO-SERVIDOR",
  "message": "Solicitação recebida. Nossa equipe poderá entrar em contato pelos dados informados."
}
```

O frontend pode mostrar um protocolo curto derivado dos primeiros oito caracteres de `requestId`. Só deve mostrar o protocolo após receber a resposta de sucesso do backend.

### Erros esperados

| HTTP | Situação |
|---|---|
| 400 | Campos obrigatórios ou e-mail inválidos |
| 403 | Token CSRF ausente ou inválido |
| 429 | Limite de solicitações excedido |
| 500 | Falha interna ao registrar a solicitação |

O backend grava a solicitação em `quote_requests` e registra `submission_channel`. O aviso Manus é assíncrono, identifica o canal de entrada e não equivale a uma confirmação enviada ao cliente.

## 4. `GET /api/internal/requests`

**Objetivo:** listar as solicitações para a equipe autenticada.

O retorno inclui `submissionChannel`, com os valores:

- `website_form`: formulário tradicional do site;
- `chatbot`: fluxo guiado do B2B Assistente.

A rota exige sessão válida. Clientes não têm permissão para consultá-la.

## 5. Evento candidato para Webhook externo — `quote.created`

**Status: não implementado.** O evento deverá ocorrer somente depois da gravação confirmada em `quote_requests`.

Payload mínimo proposto:

```json
{
  "event": "quote.created",
  "occurredAt": "2026-10-30T15:00:00.000Z",
  "data": {
    "requestId": "UUID-DA-SOLICITACAO",
    "companyName": "Empresa Exemplo",
    "productSummary": "Descrição resumida da carga",
    "submissionChannel": "chatbot"
  }
}
```

O payload é uma proposta de contrato, não uma chamada já ativa. Por padrão, não incluir nome pessoal, e-mail, telefone, detalhes completos ou outros dados pessoais.

Antes da implementação, a empresa precisa informar:

1. Sistema que receberá o evento e URL HTTPS de destino.
2. Responsável técnico pelo receptor.
3. Segredo compartilhado e formato de assinatura HMAC.
4. Política de timeout, repetição, tentativas máximas e prevenção de eventos duplicados.
5. Política de armazenamento e retenção dos eventos.

A notificação existente em `src/notifications.mjs` é enviada à plataforma Manus e não deve ser descrita como Webhook externo.

## 6. Regras de comportamento do frontend

- Não pedir dados pessoais em conversa livre; usar o fluxo guiado de cotação.
- Exibir resumo dos dados e pedir confirmação antes do envio.
- Permitir cancelar sem gravar os dados.
- Se o visitante migrar para o formulário tradicional durante a coleta, preencher os campos já informados e permitir que ele revise o restante.
- Não afirmar que a solicitação foi registrada sem resposta de sucesso do backend.
- Não oferecer rastreamento, login de cliente, consulta de status ou cotação comercial calculada.
- Em caso de indisponibilidade da IA, manter o formulário tradicional acessível.
