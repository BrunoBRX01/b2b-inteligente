# Modelo de dados — SQLite local

O banco `data/b2b.sqlite` é criado automaticamente. O esquema é aplicado por migrações idempotentes e versionadas.

| Tabela | Conteúdo |
|---|---|
| `users` | Identificador, e-mail único (sem distinção de maiúsculas/minúsculas), nome, hash de senha, perfil `admin`/`employee`, status e datas |
| `sessions` | Hash do token, usuário, criação e expiração; exclusão em cascata quando usuário é excluído |
| `quote_requests` | Identificação do contato/empresa, origem/destino, produto, volume, detalhes, canal `website_form`/`chatbot`, status e datas |
| `audit_events` | Usuário responsável, ação, alvo, detalhes JSON e data |
| `clients` | Carteira de clientes: código, razão social, nome fantasia, CNPJ, IE, segmento, porte, funcionários, faturamento anual, limite de crédito, prazo de pagamento, endereço, contatos gerais, gerente de conta, status (`prospect`/`active`/`inactive`/`blocked`), classificação A–D, NPS, origem do lead e observações |
| `client_contacts` | Pessoas de contato de cada cliente: nome, cargo, departamento, e-mail, telefones e indicação de contato principal |
| `shipments` | Embarques de importação: código, cliente, origem/porto, destino, modal, Incoterm, produto, NCM, peso, volume, contêineres, valor da mercadoria (USD), frete e taxa de serviço (BRL), status (`pending`/`in_transit`/`customs`/`delivered`/`delayed`/`cancelled`) e datas |
| `client_interactions` | Histórico de relacionamento: ligação, e-mail, reunião, visita ou WhatsApp, com resumo, data e responsável |
| `schema_migrations` | Versão e data de cada migração aplicada |

Status válidos das solicitações: `new`, `reviewing`, `contacted`, `closed`. A criação do primeiro administrador é interativa e não há senha inicial no pacote.

As datas são armazenadas em UTC como texto `YYYY-MM-DD HH:MM:SS` (padrão `CURRENT_TIMESTAMP` do SQLite). Índices são criados para e-mail, sessão, status da cotação, empresa e auditoria. Chaves estrangeiras são ativadas na conexão. O banco distribuído está **vazio** (sem usuários ou cotações).


## Dados fictícios de demonstração

`node --env-file=.env scripts/seed-demo-data.mjs` (ou `npm run seed:demo`) gera 160 clientes, ~380 contatos, ~3.100 embarques dos últimos 18 meses, ~800 interações e 70 solicitações de cotação. Os dados são determinísticos e inventados; os e-mails usam domínios `*.exemplo.com.br`. Use `--reset` para apagar e gerar novamente (usuários não são afetados). Os CNPJs têm dígitos verificadores válidos, mas foram gerados em sequência e não correspondem a empresas cadastradas propositalmente.
