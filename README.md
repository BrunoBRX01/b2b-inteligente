# B2B Inteligente — edição local portátil (SQLite)

Versão local do site institucional de logística, com página pública, chatbot de respostas institucionais, formulário de cotação e área privada de gerenciamento. Esta edição substitui o MySQL gerenciado por **SQLite**, armazenado em `data/b2b.sqlite`, e remove as dependências npm do servidor. A estrutura visual e os arquivos públicos foram preservados da versão 1.1 corrigida.

## Executar no Windows

**Requisito:** Node.js **22.16 ou superior**. O MySQL, o pnpm e o npm não são necessários. Se preferir, coloque um `node.exe` oficial do Windows x64 em `runtime/` e os atalhos `.bat` o usarão sem instalar Node no Windows. O executável não é distribuído neste ZIP.

1. Extraia o ZIP em uma pasta, sem executar arquivos dentro do ZIP.
2. Execute `CRIAR_ADMIN.bat` **uma vez** para cadastrar o primeiro administrador. Informe nome, e-mail e senha exclusiva de pelo menos 14 caracteres. Não existe usuário/senha padrão.
3. Execute `INICIAR.bat` e mantenha a janela aberta.
4. Acesse `http://127.0.0.1:3000/` para o site e `http://127.0.0.1:3000/login` para o painel.
5. Para parar, pressione `Ctrl+C` na janela do servidor.

### Pelo terminal do VS Code

```powershell
node --version
node --env-file=.env scripts/create-admin.mjs  # somente no primeiro acesso
node --env-file=.env src/server.mjs
```

Em outro terminal, `node --test` executa os testes, sem modificar o banco real.

## Começando a partir do GitHub

O repositório não inclui o banco (`data/b2b.sqlite`), backups nem senhas. Depois de clonar:

```bash
node --env-file=.env scripts/create-admin.mjs        # cria o primeiro administrador
node --env-file=.env scripts/seed-demo-data.mjs      # opcional: gera a base fictícia (160 clientes, ~3.100 embarques)
node --env-file=.env src/server.mjs                  # ou INICIAR.bat / ./INICIAR.sh
```

Para a IA: instale o [Ollama](https://ollama.com) e rode `ollama pull qwen2.5:7b`.

Para guardar o banco em um repositório **privado** separado, clone-o ao lado desta pasta como `b2b-inteligente-dados` e rode `node --env-file=.env scripts/salvar-banco-github.mjs`.

## Transferir o projeto entre computadores

1. **Pare o servidor** no computador de origem.
2. Copie **toda a pasta**, principalmente `data/b2b.sqlite`, para o destino.
3. Instale Node.js 22.16+ no destino ou coloque o `node.exe` oficial em `runtime/`.
4. Execute `INICIAR.bat`. O banco, as cotações e os usuários serão os mesmos; use as credenciais existentes.

**Atenção:** isso é *transferência*, não sincronização. Dois computadores executando cópias distintas não compartilham novos registros. Não abra o mesmo arquivo SQLite simultaneamente por compartilhamento de rede. Para vários usuários em computadores diferentes ao mesmo tempo, será necessária uma implantação centralizada com controles de acesso e HTTPS.

## Banco e backups

- Arquivo principal: `data/b2b.sqlite` (inicialmente vazio, com tabelas criadas).
- Migrações automáticas e versionadas: `migrations/001_initial.sql`, `migrations/002_quote_submission_channel.sql`.
- Tabelas: `users`, `sessions`, `quote_requests`, `audit_events`, `schema_migrations`.
- Senhas: derivadas com `scrypt` e salt, sem texto puro no banco.
- Backup seguro: execute `FAZER_BACKUP.bat`; os arquivos são gravados em `backups/`.
- Restauração: pare o servidor, guarde o banco atual e copie um backup `.sqlite` para `data/b2b.sqlite`.
- **Privacidade:** o arquivo SQLite e os backups contêm dados de usuários e de solicitações. Proteja-os como dados confidenciais.

## Funcionalidades e limites

**Funcionam localmente:** site e assets CSS/JS, login/logout, proteção de sessão e CSRF, gerenciamento de usuários por administrador, registro de solicitações, alteração de status, auditoria, respostas institucionais do chatbot e backups. O servidor escuta apenas em `127.0.0.1` por padrão.

**Não são funcionalidades reais nesta edição:** partes do dashboard ainda exibem dados demonstrativos; o assistente interno com IA e notificações da antiga plataforma dependem de credenciais externas que não foram incluídas. O chatbot público oferece respostas institucionais locais e fallback seguro para perguntas sem resposta aprovada. O webhook genérico para terceiros ainda não foi implementado.

As páginas ainda referenciam fontes opcionais do Google Fonts; sem Internet, o navegador usa fontes de sistema e as funções locais continuam disponíveis.

O pacote é para **uso local**, não para publicação direta na Internet. O transporte HTTP local usa cookies sem `Secure` (`COOKIE_TRANSPORT=http-local`); uma implantação pública exigiria HTTPS e revisão de segurança e infraestrutura.


## IA integrada (Ollama, local)

A IA roda no próprio computador com o [Ollama](https://ollama.com) e o modelo `qwen2.5:7b` (configurável em `.env`: `AI_MODEL`, `OLLAMA_URL`, `AI_AUTOPILOT`). Sem o Ollama, o site funciona normalmente e a IA aparece como offline. O servidor tenta iniciar o Ollama sozinho se ele estiver instalado.

- **Chat no painel** (Central da IA e botão "Conversar com a IA"): consulta clientes, embarques e cotações e **executa alterações direto** — muda status de cotações e embarques, registra interações, atualiza clientes e escreve e-mails — e depois informa o que fez.
- **Piloto automático** (`AI_AUTOPILOT=on`): vigia atrasos (30 min), tria cotações novas (10 min), encontra clientes parados e escreve abordagem (diário) e gera o resumo diário com riscos e dicas de crescimento.
- **Registro**: tudo o que a IA faz aparece na Central da IA (aba Atividades) e em `audit_events`. E-mails ficam na **Caixa de saída** para revisar, abrir no seu programa de e-mail e marcar como enviados — nada é enviado automaticamente.
- **Chatbot do site público**: responde visitantes só com o conteúdo institucional, sem acesso ao banco.

Com placa NVIDIA, cada resposta leva de 10 a 30 s; só na CPU, de 30 s a 2 min. Instalação: `ollama pull qwen2.5:7b`. No Linux, use `./INICIAR.sh`.

## Organização

```text
B2B-Inteligente-Local/
├── INICIAR.bat, CRIAR_ADMIN.bat, FAZER_BACKUP.bat, TESTAR.bat
├── .env, package.json, README.md, LEIA_PRIMEIRO.txt
├── public/                # site público, CSS, JavaScript e chatbot
├── private/               # telas internas protegidas
├── src/                   # servidor HTTP, SQLite, segurança e assistentes
├── scripts/               # cadastro inicial de admin e backup
├── migrations/            # criação e atualização das tabelas SQLite
├── data/b2b.sqlite        # banco local (inicialmente vazio)
├── backups/               # criado automaticamente quando fizer backup
├── test/                  # testes automatizados
├── docs/                  # documentação atual e histórico da edição cloud
└── runtime/               # opcional: node.exe oficial do Windows x64
```

Mais detalhes: `docs/arquitetura-local.md` e `docs/modelo-de-dados-local.md`.
