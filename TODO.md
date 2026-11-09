# Pendências — edição local SQLite

- [x] Migrar banco MySQL gerenciado para arquivo SQLite local.
- [x] Preservar login, usuários, solicitações, auditoria, CSRF e chatbot institucional.
- [x] Incluir scripts de inicialização, criação do primeiro administrador, backup e testes.
- [x] Verificar persistência e integridade do banco por testes automatizados.
- [x] Validar os arquivos `.bat` no Windows 11 (Node.js 24.14): `INICIAR.bat`, `TESTAR.bat` e `FAZER_BACKUP.bat` OK em 09/11/2026. `CRIAR_ADMIN.bat` não foi executado (exige digitar senha; o banco já tem administradores).
- [x] Configurar e testar a IA local: Ollama 0.40 + `qwen2.5:7b` (chatbot público e assistente do painel testados em 09/11/2026).
- [ ] Notificações externas (não há credenciais no pacote).
- [ ] Revisar o layout no navegador em celular e desktop (página pública verificada; painel interno ainda não foi revisado visualmente).
- [ ] Substituir dados demonstrativos do dashboard por indicadores reais, conforme escopo futuro.
- [ ] Definir infraestrutura HTTPS, autenticação e banco centralizado caso o sistema seja publicado ou usado por várias máquinas ao mesmo tempo.
- [ ] Definir rotina externa de cópias de segurança e política de retenção/privacidade para uso real.
