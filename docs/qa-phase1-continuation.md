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
- ativar Leaked Password Protection no Supabase Auth;
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

### Lacunas encontradas que ainda fazem parte da Fase 1

- O backend de analytics existe, mas o frontend ainda não dispara os eventos definidos.
- A Área do Hóspede mostra experiências compradas, porém ainda não oferece compra de novas experiências pós-reserva.
- Termos de Hospedagem, Regras da Propriedade e Política de Privacidade continuam em rascunho e dependem de aprovação antes do GO-LIVE.
- Gateway real continua não escolhido; pagamentos seguem em modo mock.
- Leaked Password Protection do Supabase Auth continua desativado.
- QA visual automatizado não pôde ser executado neste ambiente porque o navegador headless disponível não completa a navegação do Preview protegido; inspeção visual final permanece pendente.
