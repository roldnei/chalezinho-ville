# Entrega de e-mails transacionais

## Arquitetura

Os eventos de negócio continuam sendo gravados em `notification_outbox`. Eles não conhecem Brevo, Resend, Postmark ou SMTP.

`notification-dispatcher`:

1. reivindica mensagens vencidas com lock e `skip locked`;
2. resolve destinatário, template e variáveis no servidor;
3. envia pelo adaptador selecionado em `EMAIL_PROVIDER`;
4. grava `provider_message_id` e conclui a mensagem;
5. devolve falhas transitórias à fila com retry limitado.

O adaptador atual é `brevo`. Para trocar de fornecedor, implemente `EmailProvider` em `_shared/email-provider.ts` e altere `EMAIL_PROVIDER`; produtores, templates e fila permanecem iguais.

`notification-webhook` recebe eventos de entrega, bounce e spam e os registra de forma idempotente em `notification_delivery_events`.

## Secrets da Edge Function

- `EMAIL_PROVIDER=brevo`
- `BREVO_API_KEY`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_FROM_NAME=Chalezinho Ville`
- `EMAIL_REPLY_TO`
- `EMAIL_SITE_URL`
- `EMAIL_SANDBOX=true|false`
- `BREVO_WEBHOOK_SECRET`
- `NOTIFICATION_DISPATCH_SECRET`

Nunca guardar a chave Brevo no GitHub, frontend, banco público ou logs.

## Autenticação

Confirmação de conta e recuperação de senha continuam gerenciadas pelo Supabase Auth. O SMTP personalizado do Auth pode usar as credenciais SMTP do Brevo e pode ser trocado independentemente do adaptador operacional.

## Operação

- Dispatcher: invocação autenticada por JWT e segredo dedicado a cada minuto.
- Webhook: endpoint público protegido por segredo dedicado na URL/header.
- `sent`: aceito pelo provedor.
- `delivery_status=delivered`: confirmado pelo webhook.
- hard bounce, bloqueio e spam ficam registrados para auditoria.

## Ambiente de homologação

Em FINANCE_ENVIRONMENT=development, EMAIL_TEST_RECIPIENT é obrigatório. O claim filtra esse destinatário no banco e o dispatcher verifica novamente antes de enviar, processando uma mensagem por execução. Não se deve usar essa configuração para redirecionar mensagens de hóspedes reais.

O cron notification-dispatcher chama dispatch_notification_outbox a cada minuto. Provisionar separadamente no Vault finance_project_url, notification_dispatch_secret e notification_anon_jwt. O JWT é a chave pública anon do projeto, e o segredo dedicado continua obrigatório no handler. A função de agendamento não é executável por anon/authenticated. Sem configuração, não envia requisição. Credenciais não são incluídas em migrações nem na definição do job.

Na instância isolada, SMTP/API, entrega via webhook e execução real pelo cron foram comprovados em 29/09/2026. Chaves Brevo exclusivas de testes expiram em 29/10/2026; renovação precisa preservar o escopo autorizado.
