# Supabase — Fase 1

Projeto: `irxsaladqhbzhkoaclxy`

Este diretório versiona a infraestrutura da Fase 1 que já foi aplicada ao Supabase compartilhado durante o desenvolvimento.

## Migrations aplicadas

| Versão | Migration |
|---|---|
| 20260923230511 | phase1_foundation |
| 20260923230605 | phase1_foundation_hardening |
| 20260923230736 | phase1_quote_experiences |
| 20260923230825 | phase1_payment_settings |
| 20260923231619 | enable_pg_net_for_internal_qa |
| 20260923231817 | grant_service_role_phase1 |
| 20260923232040 | schedule_hold_expiration |
| 20260923232247 | move_btree_gist_extension |
| 20260923232327 | move_admin_helper_private |
| 20260923232417 | phase1_post_booking_history |
| 20260923233705 | phase1_cover_foreign_keys |
| 20260924001601 | remove_pg_net_after_internal_qa |
| 20260924005001 | phase1_experience_media_and_modification_guard |
| 20260924011905 | simplify_experience_admin_model |

O arquivo `phase1_schema_snapshot.sql` é um snapshot idempotente e documentado da estrutura alvo da Fase 1. As migrations originais permanecem registradas no histórico do Supabase. O `pg_net` foi utilizado exclusivamente para QA interno e removido ao final dos testes.

## Regras importantes

- Frontend novo permanece apenas na branch `desenvolvimento`.
- Banco é compartilhado com produção durante desenvolvimento.
- Dados de QA devem ser identificados e removidos após testes.
- Nenhum pagamento real está ativo; provider atual é `mock`.
- Nenhum GO-LIVE sem aprovação explícita.

- booking_price_breakdown_and_upsell_snapshot — snapshots financeiros separados e regra de upsell por pacote.
