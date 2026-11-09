# Relatório de validação — B2B Inteligente Local

**Data:** 06/11/2026  
**Ambiente de validação:** Linux, Node.js 22.16.0 (módulo nativo `node:sqlite`).  
**Resultado:** 15 testes automatizados aprovados (`node --test`).

## Verificações realizadas

- Criação das tabelas SQLite e aplicação idempotente de migrações.
- Inicialização real do servidor HTTP e acesso ao site e CSS.
- Bloqueio de páginas internas sem autenticação.
- Proteção CSRF nas operações de escrita.
- Login válido/inválido, cookies de sessão e logout.
- Recebimento de cotação, registro de canal de origem e alteração de status.
- Criação de usuário, rejeição de e-mail duplicado e restrição de administrador.
- Proteção contra desativação da própria conta administrativa.
- Chatbot institucional sem chave de IA externa.
- Backup SQLite com o servidor ativo, integridade do snapshot e persistência após encerramento.
- Validação `PRAGMA integrity_check = ok`.
- Criação do primeiro administrador via terminal interativo com senha oculta, testada separadamente.
- Conferência de existência dos recursos CSS/JS referenciados nas páginas.

## Limitações desta validação

- Os atalhos `.bat` foram preparados para Windows, mas **não foram executados em um Windows real** neste ambiente. Teste-os no computador de destino.
- Não houve teste visual interativo em navegador nem teste de integração com serviços de IA externos.
- O dashboard ainda contém dados demonstrativos, como na versão original.
- Esta edição é para uso local em `127.0.0.1`, não para publicação direta na Internet.
