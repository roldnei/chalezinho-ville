# Revisão financeira — desenvolvimento

Base: b20abf5 (inclui a correção de garantias dentro da reserva); branch refactor/reservation-finance.
Nenhuma migração deste trabalho pode ser aplicada ao projeto compartilhado irxsaladqhbzhkoaclxy sem ambiente isolado. Não publicar main/home.

## Mapa encontrado
| Domínio | Banco | API / regras | UI |
|---|---|---|---|
| Cotação/reserva | quotes, quote_options, quote_experience_items, reservations, reservation_policy_acceptances | booking-engine: search, quote, start_payment; RPC de hold | booking.js / reservar.html |
| Pagamento/PIX/cartão | payments, payment_settings | pagbank.ts, startPayment, startPostBookingPayment, reconcile_pagbank_* | booking.js, account.js, admin.js |
| Parcelamento | properties.features.payment_terms; payments.metadata | chargeInstallments, installmentOptions, Fees API | booking.js, account.js, adminProperty |
| Cancelamento/estorno | reservation_cancellations, reservation_refunds, attempts, provider_observations, cancel_requests | reservationRefundAction + SQL de reserva/claim/confirm | admin.js e account.js |
| Caução/danos | guarantees, guarantee_card_tokens, incidents, bucket privado guarantee-evidence | guarantee-preview; duplicate guaranteeAction; duplicate reconciliation webhook | admin.js reserva + account.js |
| Experiências | products, variants, eligibility, orders/items, post_booking_cart_items | purchasePostBookingExperience, checkoutExperienceCartItem, applyUpsell | account.js, booking.js, experiencias-admin.js |
| Cobranças posteriores | post_booking_charges | start_post_booking_payment_atomic, finalize_post_booking_charge_* | account.js, admin.js |
| Alterações | modification_requests, reservation_change_events | modificationAction e RPC atômica | account.js / admin.js |
| Avisos | notification_outbox, delivery_events, admin_notifications | jobs e provedor email | administrativo |
| Histórico | financial_entries, audit_events + vários históricos parciais | múltiplos pontos de gravação | financeiro/reserva |

## Defeitos comprovados na leitura
- Motor monolítico de 2.400+ linhas, mistura HTTP, disponibilidade, financeiro, administração e catálogo.
- Conciliação de caução duplicada entre webhook e guarantee-preview; caminho antigo guarantee_action continua implementado.
- Captura não possui caminho reverso de estorno de caução na UI/API/banco.
- Ocorrência exige autorização válida e troca o estado da caução; impede registrar ocorrências sem cobrança.
- UI exibe valor autorizado com rótulo Capturada; não discrimina valor efetivamente capturado na listagem.
- financial_entries não é imutável por regra de banco e permite reservation_id nulo.
- Pagamentos, cauções, cobranças e estornos usam vocabulários diferentes; não há projeção financeira única.
- Parcelamento pré-cartão usa BIN de referência 552100; total é indicativo e pode mudar. Não satisfaz preço firme pré-cartão.
- Prazo PIX adicional usa 900000 ms; limites duplicados; ativo='mock' autoriza sandbox.
- Endpoint legado de garantia pode registrar ocorrência sem o mesmo contrato de evidências.
- admin_hub ignora erros nas consultas financeiras secundárias, apresentando arrays vazios como sucesso.
- Histórico de saldo não distingue juros, recebimentos, obrigação e bloqueio de limite.
- Configuração e todos os previews usam o mesmo projeto de banco, sem branch.

## Arquitetura alvo e migração
1. Reserva como identificador obrigatório em todo evento financeiro.
2. finance_events: eventos append-only com sequência global, entidade, versão observada e valores mínimos sem cartão/token/PII. Baseline explícita para legado; não inventar eventos históricos.
3. Projeção única deriva saldos de registros identificados, devoluções confirmadas e obrigações; pedido de estorno não altera saldo recebido.
4. PaymentGateway: criação, pré-autorização, captura, cancelamento, devolução, consulta e validação de webhook. PagBankSandbox implementa; dados do gateway não decidem regras de hospedagem.
5. Reconciliação compartilhada entre consulta e webhook; só evidência autenticada do provedor confirma dinheiro.
6. Comandos de caução e estorno serializados por row locks, idempotência durável e limite cumulativo; incerteza impede novo POST e exige GET.
7. Ocorrência independente da decisão; vínculo obrigatório à reserva e registro de responsável/decisão.
8. Detalhe financeiro e histórico dentro da reserva; UI informa total autorizado, capturado, devolvido e saldo.
9. Preservar registros e IDs existentes; migração aditiva com baseline, sem apagar operações ou inventar liberação não comprovada.

## Limites de homologação
PASS exige integração UI → API → regra → banco → gateway → reconciliação, quando aplicável.
Testes com gateway simulado são identificados como locais, não homologação PagBank.
40008 não equivale a estorno. Captura parcial não comprova por si só a liberação no emissor.
7–12 parcelas com valor firme pré-cartão exigem contrato de cotação não dependente do BIN ou tabela comercial aprovada; não inventar taxa nem mudar valor silenciosamente.
