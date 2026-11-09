# Pendências — edição local SQLite

- [x] Migrar banco MySQL gerenciado para arquivo SQLite local.
- [x] Preservar login, usuários, solicitações, auditoria, CSRF e chatbot institucional.
- [x] Incluir scripts de inicialização, criação do primeiro administrador, backup e testes.
- [x] Verificar persistência e integridade do banco por testes automatizados.
- [ ] Validar manualmente os arquivos `.bat` e o layout no Windows (Node.js 22.16+ ou 26+).
- [ ] Configurar e testar, se necessário, um provedor de IA e notificações externas (não há credenciais no pacote).
- [ ] Substituir dados demonstrativos do dashboard por indicadores reais, conforme escopo futuro.
- [ ] Definir infraestrutura HTTPS, autenticação e banco centralizado caso o sistema seja publicado ou usado por várias máquinas ao mesmo tempo.
- [ ] Definir rotina externa de cópias de segurança e política de retenção/privacidade para uso real.
