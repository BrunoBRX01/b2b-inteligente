# B2B Inteligente — registro de alterações

Este arquivo é o histórico oficial das alterações técnicas realizadas no projeto. Cada entrega deve registrar o comportamento anterior, o novo comportamento esperado, os arquivos afetados, os dados/infraestrutura envolvidos e os testes executados.

## Modelo obrigatório para novas alterações

```markdown
## AAAA-MM-DD — [ID] Título da alteração
- **Tipo:** documentação | funcionalidade | correção | segurança | infraestrutura | banco de dados
- **Motivo:** problema ou necessidade atendida.
- **Comportamento anterior:** como o sistema funcionava antes.
- **Comportamento novo:** como o sistema deve funcionar depois.
- **Arquivos alterados:** lista de arquivos.
- **Banco de dados:** tabelas/campos/migrations afetados ou "sem alteração".
- **APIs/integrações:** rotas, serviços e eventos afetados ou "sem alteração".
- **Configuração/infraestrutura:** variáveis, serviços e ambientes afetados ou "sem alteração".
- **Segurança e privacidade:** validações e dados envolvidos.
- **Testes:** comandos e resultados.
- **Riscos e reversão:** como identificar falha e como voltar à versão anterior.
- **Status:** planejado | em desenvolvimento | implementado | validado | pendente de ambiente externo.
```

## 2026-10-30 — DOC-001 Documentação técnica inicial

- **Tipo:** documentação.
- **Motivo:** estabelecer uma referência confiável antes de ampliar o B2B Inteligente.
- **Comportamento anterior:** documentação concentrada principalmente no README e TODO; não havia dicionário de dados nem descrição completa dos fluxos e da infraestrutura.
- **Comportamento novo:** documentação separada para arquitetura/infraestrutura, modelo de dados, comportamento do site e registro de alterações.
- **Arquivos criados:**
  - `docs/arquitetura-e-infraestrutura.md`
  - `docs/modelo-de-dados.md`
  - `docs/fluxos-e-comportamento.md`
  - `docs/registro-de-alteracoes.md`
- **Arquivos atualizados:** `README.md`, `TODO.md`.
- **Banco de dados:** sem alteração. A documentação descreve a migration `001_initial.sql` existente.
- **APIs/integrações:** sem alteração.
- **Configuração/infraestrutura:** sem alteração.
- **Segurança e privacidade:** documentados os controles existentes e as pendências que dependem de decisão da empresa.
- **Testes:** `node --test` — 5 testes aprovados. `pnpm` não estava instalado no ambiente de auditoria; os testes foram executados diretamente pelo Node.js 22.16.0.
- **Riscos e reversão:** alteração documental, sem impacto no comportamento da aplicação; reverter removendo os documentos e restaurando README/TODO anteriores.
- **Status:** implementado e validado como documentação. Nenhuma funcionalidade do site foi modificada nesta entrega.

## Próximas alterações previstas

| ID | Alteração | Status |
|---|---|---|
| CHAT-001 | Widget e atendimento público no site | Implementado; validação integrada pendente |
| CHAT-002 | Fluxo guiado de solicitação de cotação pelo chatbot | Implementado; validação integrada pendente |
| DB-002 | Identificação do canal de origem da cotação | Implementado no código; migration pendente de aplicação no banco de ambiente |
| WEB-001 | Webhook externo para evento de nova cotação | Planejado; depende de sistema receptor, URL e segredo |
| PRIV-001 | Formalização de aviso/consentimento e retenção de dados | Pendente de decisão da empresa |


## 2026-10-30 — CHAT-001 / CHAT-002 / DB-002 Chatbot público e origem das cotações

- **Tipo:** funcionalidade, banco de dados, segurança e documentação.
- **Motivo:** atender à atividade de integração de chatbot com plataformas virtuais e permitir que visitantes iniciem uma solicitação de cotação pelo site.
- **Comportamento anterior:** o site público possuía formulário de cotação; o único assistente de IA era interno, autenticado e baseado em dados fictícios. O banco não identificava o canal de entrada da cotação.
- **Comportamento novo:** o site apresenta o widget B2B Assistente. O chatbot responde às perguntas institucionais principais por uma base aprovada, pode usar IA server-side para perguntas abertas, e oferece um fluxo guiado com conferência e confirmação antes do envio. O cliente recebe protocolo somente após o backend confirmar a gravação. O painel interno exibe se a solicitação veio do formulário ou do chatbot.
- **Arquivos criados:** `src/public-assistant.mjs`, `migrations/002_quote_submission_channel.sql`, `public/assets/chatbot.css`, `public/assets/chatbot.js`, `test/public-assistant.test.mjs` e `docs/api-e-integracoes.md`.
- **Arquivos alterados:** `src/server.mjs`, `src/db.mjs`, `src/notifications.mjs`, `public/index.html`, `private/requests.html`, `public/assets/requests.js`, `public/assets/internal-pages.css`, `.env.example`, `README.md`, `TODO.md` e documentos técnicos em `docs/`.
- **Banco de dados:** migration aditiva `002_quote_submission_channel` adiciona `quote_requests.submission_channel` com valores `website_form` e `chatbot`, padrão `website_form`. Registros existentes são preservados e recebem o padrão.
- **APIs/integrações:** criada `POST /api/public/chatbot` (CSRF, limite 10/min, histórico limitado); `POST /api/public/quote` passa a gravar o canal de origem; `GET /api/internal/requests` retorna o canal para exibição interna. A IA pública usa `MANUS_API_URL` e `MANUS_API_KEY` somente no servidor, quando disponíveis.
- **Configuração/infraestrutura:** não exige novo serviço ou dependência npm. A migration é executada pelo mecanismo versionado no início do servidor. A chamada de IA usa a configuração Manus já existente.
- **Segurança e privacidade:** chatbot público não consulta o banco, não usa sessão interna e não recebe histórico de dados pessoais coletados no fluxo guiado. Os dados de cotação ficam no estado da página até a confirmação. Rotas usam CSRF e rate limit. Mensagens são renderizadas como texto, sem interpretar HTML.
- **Testes:** `node --check` nos módulos JavaScript alterados; `node --test` — 11 testes aprovados (5 de segurança existentes e 6 novos testes da base de respostas e fallback). Não foi possível testar o MySQL remoto nem a API Manus sem as credenciais/ambiente correspondentes.
- **Riscos e reversão:** antes de publicar, aplicar e validar a migration em ambiente de desenvolvimento. Se for necessário reverter a interface, remover a inclusão do widget e a rota; manter a coluna `submission_channel` não prejudica os registros e pode ser deixada sem uso. Não remover a coluna em produção sem plano de migração e backup.
- **Status:** código implementado e testes locais aprovados; validação integrada depende do ambiente MySQL e da configuração da plataforma. Webhook externo continua pendente de URL e segredo fornecidos pela empresa.


## 2026-10-30 — CHAT-003 Correção visual e de interação do chatbot

- **Tipo:** correção, interface, acessibilidade e documentação.
- **Motivo:** reduzir a ocupação excessiva do widget, evitar abertura involuntária do teclado em dispositivos móveis e corrigir o recurso de marca utilizado nas páginas.
- **Comportamento anterior:** a janela móvel ocupava quase toda a altura disponível; a abertura do chatbot focava o campo de texto e podia acionar o teclado do celular antes de o visitante escolher uma ação. A imagem referenciada como logotipo não correspondia à identidade visual B2B.
- **Comportamento novo:** a janela móvel tem altura limitada e fica posicionada acima do botão flutuante; a abertura transfere o foco ao botão de fechar, sem abrir o teclado. O teclado é acionado quando o visitante escolhe uma ação que exige digitação. A interface usa um logotipo SVG próprio. O tamanho máximo do campo de entrada acompanha o limite de cada pergunta do fluxo de cotação.
- **Arquivos criados:** `public/assets/logo.svg`.
- **Arquivos alterados:** `public/assets/chatbot.css`, `public/assets/chatbot.js`, `public/index.html`, `public/login.html`, `private/dashboard.html`, `private/requests.html`, `private/users.html`, `app.config.ts`, `README.md`, `TODO.md`, `docs/arquitetura-e-infraestrutura.md` e `docs/fluxos-e-comportamento.md`.
- **Arquivos removidos:** `public/assets/logo.png`, que não correspondia à marca do projeto.
- **Banco de dados:** sem alteração.
- **APIs/integrações:** sem alteração.
- **Configuração/infraestrutura:** o ícone configurado em `app.config.ts` passou a apontar para `/assets/logo.svg`.
- **Segurança e privacidade:** nenhuma credencial ou dado pessoal foi adicionado ao frontend; mensagens continuam sendo renderizadas por `textContent`.
- **Testes:** `node --check` em todos os módulos JavaScript; `node --test` — 11 testes aprovados; análise sintática dos arquivos CSS sem erros; verificação dos caminhos dos recursos e teste visual em navegador headless em desktop e celular. A integração real com MySQL e IA permanece dependente do ambiente configurado.
- **Riscos e reversão:** a alteração é de interface e marca, sem mudança de esquema ou contrato de API. Para reverter, restaurar os arquivos de interface e a configuração anteriores.
- **Status:** correção implementada; validação de interface local concluída. Validação integrada continua pendente do ambiente de execução.

## Edição local portátil — 2026-11-06

- Removida a dependência de MySQL e variáveis `DATABASE_URL`; adicionado banco SQLite em `data/b2b.sqlite`.
- Mantidos o site, as rotas e os fluxos essenciais; o servidor passa a usar apenas módulos nativos do Node.js, sem dependências npm.
- Migrações convertidas para SQLite; transações serializadas; validações e auditoria preservadas.
- Criados atalhos Windows para inicialização, primeiro administrador, backup e testes.
- Incluído banco inicial vazio, documentação de transporte entre computadores e teste integrado da API com persistência.
- IA externa e dashboard demonstrativo continuam com as limitações anteriores.


## 2026-11-09 — AI-002 Instalação no Windows e correções nas ferramentas da IA
- **Tipo:** correção, infraestrutura e documentação.
- **Motivo:** primeira instalação em Windows 11 real com IA local; nos testes, o assistente do painel informou "5 clientes" (havia 160) e registrou uma interação em um cliente diferente do pedido.
- **Comportamento anterior:** `buscar_clientes` e `listar_cotacoes` devolviam `total` igual ao tamanho da página (padrão 5). Cotações não indicavam se a empresa era cliente cadastrado. Quando o cliente não era encontrado, o modelo podia escolher outro cliente e gravar a alteração nele.
- **Comportamento novo:** as duas ferramentas devolvem `total_encontrado` e `mostrando` (mesmo padrão de `listar_embarques`). `listar_cotacoes` informa `cliente_codigo` ("não é cliente cadastrado" quando não há vínculo) e devolve um aviso quando o filtro de status não encontra nada. As mensagens de cliente não encontrado/ambíguo e o prompt do agente proíbem trocar o cliente pedido por outro.
- **Arquivos alterados:** `src/ai/tools.mjs`, `src/ai/agent.mjs`, `TODO.md`, `docs/registro-de-alteracoes.md`.
- **Arquivos criados:** `test/ai-tools.test.mjs`.
- **Banco de dados:** sem alteração de esquema.
- **APIs/integrações:** sem alteração de rotas; mudou apenas o formato do retorno das ferramentas internas da IA.
- **Configuração/infraestrutura:** Ollama 0.40.15 com o modelo `qwen2.5:7b` (4,7 GB) instalado; banco copiado de `b2b-inteligente-dados` para `data/b2b.sqlite`. Com RTX 3050 (4 GB), o modelo roda ~55% CPU / 45% GPU; respostas de 15 a 50 s.
- **Segurança e privacidade:** os testes do assistente foram feitos em cópia temporária do banco, apagada ao final; nenhum dado real foi alterado pelos testes.
- **Testes:** `node --test` — 16 testes aprovados (15 anteriores + 1 novo). `INICIAR.bat`, `TESTAR.bat` e `FAZER_BACKUP.bat` executados no Windows 11 com Node.js 24.14. Chatbot público respondeu pela IA (`mode: ai`). Assistente do painel, em cópia do banco: informou 160 clientes e as 3 cotações corretas, e recusou registrar interação para empresa que não é cliente cadastrado.
- **Riscos e reversão:** modelos de 7B ainda podem errar fatos gerais (ex.: definição de Incoterms); revisar textos da IA antes de enviar a clientes. Para reverter, restaurar `src/ai/tools.mjs` e `src/ai/agent.mjs` da versão anterior e remover `test/ai-tools.test.mjs`.
- **Status:** implementado e validado localmente.

## 2026-11-09 — AUTH-002 Redefinição de senha pelo computador local
- **Tipo:** funcionalidade e segurança.
- **Motivo:** as contas da equipe foram criadas com senhas aleatórias gravadas em `CREDENCIAIS_ADMIN.local.txt`, arquivo que não vai para o GitHub; ao clonar em outro computador não havia como entrar no painel. `CRIAR_ADMIN.bat` só funciona quando ainda não existe administrador.
- **Comportamento anterior:** não havia forma de trocar a senha sem já estar logado como administrador.
- **Comportamento novo:** `REDEFINIR_SENHA.bat` (ou `node --env-file=.env scripts/redefinir-senha.mjs`) pede o e-mail e a nova senha sem exibi-la, grava apenas o hash scrypt, encerra as sessões abertas da conta e registra `user.password_reset_local` em `audit_events`.
- **Arquivos criados:** `REDEFINIR_SENHA.bat`, `scripts/redefinir-senha.mjs`, `src/password-reset.mjs`, `test/password-reset.test.mjs`.
- **Arquivos alterados:** `README.md`, `docs/registro-de-alteracoes.md`.
- **Banco de dados:** sem alteração de esquema.
- **APIs/integrações:** sem alteração.
- **Configuração/infraestrutura:** sem alteração.
- **Segurança e privacidade:** exige acesso ao computador onde está o banco (quem tem o arquivo SQLite já tem acesso total aos dados). Senha entre 14 e 128 caracteres, nunca exibida nem gravada em texto puro.
- **Testes:** `node --test` — 17 testes aprovados (1 novo). Redefinição executada no Windows 11 e login confirmado no servidor local.
- **Riscos e reversão:** remover os quatro arquivos criados e o parágrafo do README.
- **Status:** implementado e validado localmente.
