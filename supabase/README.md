# Supabase — Fase 1

Projeto de desenvolvimento: `irxsaladqhbzhkoaclxy`.

A pasta versiona a estrutura aplicada durante a Fase 1. O snapshot inicial e as migrations incrementais devem ser preservados; não reaplicar manualmente migrations registradas.

## Estado atual

- `booking-engine` v37 na reconciliação de 25/09/2026.
- Provider de pagamento: `mock`.
- Quotes, holds, pagamentos, ledger, garantia, experiências, carrinho, cobranças e alterações atômicas.
- Cron a cada 5 minutos para holds e prazos pós-reserva.
- Outbox transacional com templates, dedupe, claim/retry/complete.
- PriceLabs e Airbnb configurados.
- Slots de Booking.com registrados para `ICAL_BOOKING_CH1/2/3`, ainda sem URLs.
- RLS ativa; RPCs financeiras somente service_role.
- Guests só podem alterar `profiles.full_name`, `profiles.phone` e criar sua solicitação de exclusão.

## Regras

- Banco compartilhado: QA sempre marcado `[DEV]` e removido ao final.
- Nenhum gateway ou e-mail real ativo.
- Nenhuma mudança em `main`, produção ou GO-LIVE sem autorização.
- Termos jurídicos permanecem draft.
