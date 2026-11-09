# Arquitetura — edição local portátil

## Execução

- Node.js 22.16+ com módulos nativos `node:http`, `node:sqlite`, `node:crypto`, `node:fs`.
- **Sem dependências npm**, MySQL, Docker ou servidor de banco externo.
- A camada HTTP específica do projeto fica em `src/http.mjs`; mantém as rotas da edição anterior e aplica parser JSON (32 KiB), limitação de requisições e entrega de arquivos públicos.
- O servidor padrão usa `HOST=127.0.0.1`, `PORT=3000` e `COOKIE_TRANSPORT=http-local`, definidos em `.env` e carregados com `node --env-file=.env`.
- Arquivos públicos em `public/`; páginas privadas em `private/` exigem sessão; endpoints em `src/server.mjs`.

## Segurança

- Senhas com `scrypt` e salt aleatório; sessão aleatória armazenada somente como SHA-256; CSRF com cookie e cabeçalho; validação de dados; queries parametrizadas.
- Perfis `admin` e `employee`, com proteção para manter pelo menos um administrador ativo.
- O arquivo SQLite tem `PRAGMA foreign_keys=ON`, `journal_mode=DELETE`, `synchronous=FULL` e `busy_timeout=5000`.
- O acesso é apenas local por padrão. Não há TLS, identidade de domínio nem configuração para publicação externa.
- Não inclua bancos de dados ou backups em repositórios públicos.

## Portabilidade

- `data/b2b.sqlite` é um arquivo SQLite; para transportar o banco completo, **encerre o processo** e copie a pasta.
- `FAZER_BACKUP.bat` usa a API oficial de backup SQLite do Node.js e pode ser executado enquanto o site está em uso.
- O mesmo banco **não deve** ser acessado simultaneamente por dois servidores via rede compartilhada.
- Em outro computador Windows, execute com Node.js 22.16+ ou coloque o `node.exe` oficial em `runtime/`.

## Dependências externas ainda não configuradas

- Assistente operacional com IA e notificações dependem de `MANUS_API_URL` e `MANUS_API_KEY`, não incluídas.
- O chatbot público responde localmente a perguntas institucionais; questões abertas recebem resposta de fallback se a API não estiver configurada.
- O dashboard possui dados demonstrativos; não é um ERP conectado à operação real.
