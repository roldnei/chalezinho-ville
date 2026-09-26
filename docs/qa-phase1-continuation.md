# QA técnico — Fase 1 (continuação)

Validações automatizadas executadas em desenvolvimento:

- busca válida, datas inválidas, capacidade e mínimo de noites;
- mínimo de noites individual por propriedade conforme PriceLabs;
- multiplicadores 1,28 / 1,20 / 1,10;
- taxa de limpeza mantida somente internamente e hospedagem consolidada para o hóspede;
- quote de 15 minutos e preço congelado;
- quote não bloqueia inventário;
- hold somente ao iniciar pagamento;
- double booking bloqueado no banco;
- checkout de uma reserva pode coincidir com check-in da próxima;
- expiração de pending_payment libera inventário;
- upsell usa o próximo preço maior do mesmo tipo e diferença real;
- upsell preserva hospedagem e substitui apenas a experiência;
- experiência sem estoque é recusada;
- antecedência mínima de experiência é respeitada;
- RLS: hóspede não lê reserva/pagamento de outro hóspede;
- endpoints sensíveis exigem autenticação/admin;
- uma única alteração ativa por reserva;
- garantia parcial aceita; captura acima do autorizado bloqueada também no banco;
- config e busca receberam retry server-side para falhas transitórias do Supabase;
- config stress: 10/10 respostas 200 após retry;
- busca stress: 10/10 respostas 200 após retry.

Pendências pré-GO-LIVE:
- decidir sobre plano Supabase Pro ou superior para habilitar Leaked Password Protection; o recurso não existe no plano Free atual;
- aprovar/publicar Termos de Hospedagem, Regras da Propriedade e Política de Privacidade;
- configurar definitivamente gateway real e testar seus webhooks/refunds/pré-autorização.


## Continuação — hardening final

Validações adicionais concluídas após o marco acima:

- RLS real ampliado: perfil, garantia, alteração, pedidos/itens de experiência e aceite de políticas ficam visíveis somente ao dono — PASS.
- Endpoints de hóspede sem autenticação retornam 401 e endpoints administrativos retornam 403 — PASS.
- Sintaxe dos JavaScripts de Home, Auth, Callback, Reserva e Conta — PASS.
- Varredura das telas do hóspede: nenhuma exposição de "taxa de limpeza"/"limpeza" — PASS.
- Reservas confirmadas de QA: ledger = pagamento aprovado = total da reserva — PASS.
- Aceite da política de cancelamento versionada persistido por reserva — PASS.
- Aplicação de alteração agora é atômica: conflito de datas não gera pagamento nem lançamento financeiro órfão — PASS.
- Reaplicação da mesma alteração não duplica cobrança — PASS.
- Captura de garantia mock agora é atômica e idempotente — PASS.
- Captura parcial de R$ 30 sobre R$ 500: saldo R$ 470; retry sem duplicar ledger — PASS.
- Tentativa de captura acima de R$ 500: bloqueada sem alterar estado/ledger — PASS.
- RPCs críticas não podem ser executadas por anon/authenticated; somente service_role — PASS.
- booking-engine atual: v38; smoke config 200 e search 200 — PASS.
- Booking.com configurado para os três chalés por secrets da Edge Function; cobertura reportada como ativa — PASS.
- Bloqueio real do feed do CH1 validado na busca, sem bloquear CH2/CH3 — PASS.
- pg_net temporário removido novamente após o QA — PASS.

### Lacunas externas e de aprovação

- Analytics da jornada já é disparado no frontend e persistido pelo backend — PASS.
- Compra pós-reserva usa carrinho antes da cobrança e separa “Experiências no carrinho” de “Pagamentos pendentes” — PASS.
- Termos de Hospedagem, Regras da Propriedade e Política de Privacidade continuam em rascunho e dependem de aprovação antes do GO-LIVE.
- Gateway real continua não escolhido; pagamentos seguem em modo mock.
- A entrega transacional usa contrato desacoplado `EmailProvider`; o adaptador Brevo está configurado em desenvolvimento. Antes do GO-LIVE ainda é necessário validar o domínio remetente e a entrega real.
- Leaked Password Protection continua desativado porque o projeto está no plano Supabase Free e o painel exige Pro ou superior.
- O Preview protegido foi aberto em navegador real e a jornada pública de busca, tarifa e experiência foi exercitada em 1366×768 equivalente. A aprovação visual humana final e os demais dispositivos físicos permanecem pré-GO-LIVE.

### Continuação — notificações e Auth (2026-09-25)

- Site URL do Auth corrigido de localhost para `https://chalezinhoville.com.br` — PASS.
- Redirects autorizados para produção e Preview `desenvolvimento` — PASS.
- Eventos de pagamento reembolsado e decisões de alteração adicionados ao catálogo — PASS.
- Correção dos tipos reais `experience_add` e `experience_upgrade` no trigger de notificação — PASS.
- Eventos de experiência paga e upgrade pago exercitados em transação com rollback — PASS.
- Outbox: `queued → processing → queued` no retry e `failed` ao atingir o limite — PASS com rollback.
- RPCs financeiras e de entrega continuam bloqueadas para `anon`/`authenticated` e disponíveis somente para `service_role` — PASS.
- Nenhum resíduo `[DEV]` dos testes de outbox — PASS.

### Consolidação do PMS operacional (2026-09-26)

- Preview final `c6eeb131` aberto em navegador real com autenticação administrativa — PASS.
- Visão de hoje carregou 3 imóveis, prontidão operacional, entradas, saídas, hóspedes e ocorrências — PASS.
- Calendário unificado carregou reservas do site, Airbnb e Booking.com e exibiu pacotes associados — PASS.
- Checklists reutilizáveis: modelo padrão ativo com 7 itens e rótulos operacionais revisados — PASS.
- Equipe e papéis operacionais carregaram com atribuição de administrador/anfitrião/equipe — PASS.
- Datas e horários de tarefa são convertidos explicitamente de America/Sao_Paulo para UTC; 12:00 local = 15:00Z — PASS automatizado.
- Sintaxe dos JavaScripts do Preview final — PASS.
- Tabelas `pms_*` com RLS ativo, sem SELECT para `anon`/`authenticated` e acesso de `service_role` — PASS.
- Nenhum registro temporário `[DEV]` de tarefa, ocorrência ou checklist permaneceu no banco — PASS.
- Vercel deployment `dpl_2vJQ4ACdTJUVmX536BS3YV8SWi6e` em estado READY, sem promoção para produção — PASS.
