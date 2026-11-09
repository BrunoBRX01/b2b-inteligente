# Entregas do B2B Inteligente

Legenda: `[x]` implementado no código recebido ou nesta entrega; `[ ]` pendente. A documentação deve ser atualizada junto com cada mudança funcional.

## Base atual
- [x] Site institucional público e responsivo.
- [x] Formulário público de solicitação de cotação integrado ao backend e MySQL.
- [x] Login corporativo sem cadastro público.
- [x] Sessões protegidas, validação CSRF e autorização por perfil.
- [x] Área interna com dashboard, lista de solicitações e gestão administrativa de usuários.
- [x] Assistente de IA restrito ao painel, com contexto demonstrativo identificado.
- [x] Registro de ações administrativas relevantes.
- [x] Notificação ao responsável pela plataforma, quando configurada.
- [x] Documentação inicial de arquitetura, infraestrutura, dados, fluxos e alterações.

## Chatbot público — implementação concluída; validação integrada pendente
- [x] Criar widget de conversa no site público, responsivo e acessível.
- [x] Ajustar a janela móvel para não cobrir toda a página nem abrir o teclado automaticamente.
- [x] Substituir o recurso de imagem incorreto por um logotipo vetorial próprio (`public/assets/logo.svg`).
- [x] Criar rota de backend específica para o chatbot público, separada do assistente interno.
- [x] Preparar base de conhecimento com conteúdo institucional aprovado e respostas determinísticas para as perguntas principais.
- [x] Responder às três perguntas da atividade: informações para importar, como solicitar cotação e como acompanhar a solicitação.
- [x] Implementar fluxo guiado para coletar os dados necessários à cotação.
- [x] Mostrar resumo e solicitar confirmação antes de enviar dados pessoais.
- [x] Reutilizar validação e persistência seguras do fluxo de cotação.
- [x] Retornar protocolo somente após gravação confirmada.
- [x] Manter o formulário tradicional disponível quando a IA estiver indisponível; as respostas institucionais principais também usam a base local aprovada.
- [x] Impedir acesso do chatbot público a dados internos, dashboard, sessões e solicitações de terceiros.
- [x] Adicionar rate limit, validação de entrada e testes específicos.

## Banco de dados e integrações
- [x] Criar migration aditiva para identificar a origem da solicitação (`website_form` ou `chatbot`), preservando registros anteriores.
- [x] Definir o evento candidato: `quote.created`, disparado após a gravação confirmada de uma nova cotação; entrega externa ainda depende do receptor.
- [ ] Implementar Webhook externo assinado e configurável quando a empresa indicar o sistema receptor/URL.
- [x] Documentar que o Webhook externo é distinto da notificação Manus já existente.
- [ ] Definir com a empresa o texto/versão do aviso de privacidade, eventual registro de consentimento e política de retenção.

## Infraestrutura e produção
- [ ] Confirmar domínio corporativo e configurar HTTPS.
- [ ] Confirmar domínios de e-mail autorizados para `ALLOWED_EMAIL_DOMAINS`.
- [ ] Configurar primeiro administrador por procedimento seguro.
- [ ] Confirmar provedor MySQL, backups e teste de restauração.
- [ ] Definir monitoramento, alertas e responsável operacional.
- [ ] Configurar segredos no ambiente de execução, sem incluí-los no Git.
- [ ] Validar notificações e integrações no ambiente final.
- [ ] Integrar dados operacionais reais ao dashboard somente quando a fonte oficial estiver definida.

## Apresentação da atividade
- [ ] Preparar slides com cenário, fluxo, três perguntas/respostas, API, Webhook e segurança.
- [ ] Demonstrar o chatbot em execução no ambiente publicado/de demonstração.
- [ ] Demonstrar uma solicitação criada e persistida, incluindo o canal de origem.
- [ ] Demonstrar o evento/integração de Webhook em ambiente de teste após configurar um receptor externo.

## Regras de desenvolvimento
1. Não remover nem reescrever funcionalidades existentes sem justificativa e registro.
2. Não alterar migrations já aplicadas; criar novas migrations numeradas.
3. Toda alteração deve atualizar `docs/registro-de-alteracoes.md`.
4. Atualizar o dicionário de dados quando houver mudança no banco.
5. Atualizar a documentação de API/fluxo quando houver mudança de comportamento.
6. Nunca expor credenciais no navegador, no Git ou em documentação.
7. Não apresentar dados demonstrativos como dados operacionais reais.
8. Manter clientes sem login e sem rastreamento nesta fase.
