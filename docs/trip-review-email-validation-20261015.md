# Avisos de aprovação de Trips por e-mail

Destinatário autorizado: roldneicosta@gmail.com, confirmado pelo cadastro administrativo ativo de produção e pela solicitação do proprietário. Nenhum outro administrador recebe o aviso.

Ao enviar uma publicação de hóspede para aprovação, a transação insere um aviso na notification_outbox com chave por publicação/versão/destinatário. Um worker exclusivo verifica a fila a cada minuto, revalida responsável e versão pendente e envia pelo Brevo já configurado. Repetições não duplicam o aviso. Versões já decididas são canceladas; falhas temporárias usam as tentativas da fila. Os workers genéricos excluem estes dois modelos para preservar o destino e a política de teste do worker dedicado.

O e-mail contém link HTTPS para `villegram-admin.html?review=pending&trip=ID`. O administrador precisa entrar com sua conta e decidir explicitamente. O link não concede acesso nem publica conteúdo por si só. As publicações ainda têm validade de 7 dias a partir da aprovação.

Segurança: chave exclusiva aleatória em tabela privada com RLS, sem acesso anon/authenticated. Claims e gatilho consultam o e-mail de Auth em funções com privilégios do proprietário e search_path vazio, sem conceder leitura de auth.users ao service_role. RPCs privilegiadas revogadas para clientes. O worker valida a chave antes de processar e nunca recebe destinatário ou URL de envio do navegador. O scheduler envia apenas para o projeto configurado entre DEV e PROD.

Validação:

- Suíte completa: 792 testes passaram, zero falhas.
- 42 testes direcionados de editor/e-mail e 4 testes posteriores de isolamento passaram; incluem destinatário, duplicidade, versão obsoleta, retry, escape HTML, credencial incorreta, modo DEV e deep link sem aprovação automática.
- DEV: inserção de Trip com role service_role gerou exatamente um aviso e foi revertida por rollback. Disparo HTTP real do worker retornou 200 e sandbox_dropped, sem entrega real nesse ensaio final.
- Durante a validação inicial, o worker genérico preexistente capturou um aviso de ativação DEV e entregou ao proprietário com link da conta. A captura indevida foi corrigida pela migração de isolamento, validada em testes. O registro de auditoria foi preservado.
- PROD: envio real autorizado de confirmação, dedupe `trip-review-enabled-20261015`, aceito e confirmado como delivered pelo webhook em 15/10/2026 17:27 Brasília. Sem reservas, pagamentos, hospedagens ou Trips fictícios criados em produção.
- Scheduler `trip-review-emails` ativo nos dois ambientes. DEV força descarte no provedor. Worker `trip-review-mailer` v1 em DEV e PROD, com verificação própria da credencial.
- Advisor DEV: apenas o novo INFO esperado da tabela privada RLS sem políticas (acesso somente backend) e avisos preexistentes; sem nova exposição pública.

Migrações aplicadas DEV e PROD: `20261015202058_trip_review_email_notifications.sql`, `20261015202354_trip_review_delivery_schema_access.sql`, `20261015202509_trip_review_delivery_isolation.sql`.

Configuração por ambiente: `private.trip_review_delivery_settings.project_url` foi definida para o respectivo projeto Supabase após publicar o worker. A chave gerada não foi exibida ou salva no repositório. Nenhuma mudança foi feita nos e-mails financeiros existentes além de excluir os dois modelos do worker genérico.
