# Fase 1 ampliada — estado real em desenvolvimento

Atualizado em 25/09/2026. Fonte: branch `desenvolvimento`, Supabase `irxsaladqhbzhkoaclxy` e Preview Vercel.

## Concluído

- Motor data-driven para três propriedades, preço em centavos, limpeza configurável e oculta ao hóspede.
- PriceLabs e Airbnb iCal; reservas diretas, holds e alterações aprovadas participam da disponibilidade.
- Tarifas de referência 1,28, reembolsável 1,20 e não reembolsável 1,10.
- Auth com cadastro tardio, confirmação, login, recuperação, callback, perfil e exclusão.
- Quotes de 15 minutos, hold apenas ao iniciar pagamento e barreira final contra sobreposição no banco.
- Pagamentos desacoplados por configuração; provider atual `mock`, Pix e cartão, parcelas configuráveis.
- Ledger, garantia, ocorrência e captura parcial idempotente.
- Experiências administráveis, fotos, ativar/pausar/arquivar, categoria única e upsell pelo pacote-fonte.
- Upsell oferece somente o próximo pacote ativo mais caro da mesma categoria e cobra a diferença real.
- Área do hóspede com reservas, experiências, carrinho, pagamentos pendentes, alterações e garantia.
- Adicionar pós-reserva grava carrinho, não cobrança. A cobrança nasce apenas em “Ir para pagamento”.
- Retry de pagamento recusado, bloqueio em análise, aplicação atômica e proteção contra duplicidade.
- Alteração preserva a reserva original, cria hold somente após aprovação, expira e libera datas automaticamente.
- Analytics do funil ativo.
- Operações Fase 1: alterações, pagamentos, cobranças, garantia, integrações, fila e configurações essenciais.
- Fila transacional com templates, deduplicação, claim, retry, conclusão e eventos de pré-estadia.
- RLS e RPCs financeiras service-role; mutações SQL perigosas removidas de `anon` e `authenticated`.

## Estado técnico

- Edge Function `booking-engine`: v37 no momento desta atualização.
- Cron: expiração de reservas e prazos pós-reserva a cada 5 minutos.
- Advisor de performance: nenhum FK sem índice.
- Advisor de segurança: sem alerta crítico; tabelas internas sem policy pública são deliberadamente service-only.
- Nenhum pagamento real e nenhum envio externo de e-mail estão ativos.

## Bloqueios externos pré-GO-LIVE

1. Três URLs iCal do Booking.com: `ICAL_BOOKING_CH1`, `ICAL_BOOKING_CH2`, `ICAL_BOOKING_CH3`.
2. Escolha e credenciais do gateway real para Pix, cartão, webhook, refund e pré-autorização.
3. Escolha e credenciais do provedor de e-mail; fila e contrato de entrega já estão prontos.
4. Aprovação jurídica dos documentos marcados como draft.
5. Habilitar Leaked Password Protection no Supabase Auth.
6. Aprovação visual final e autorização explícita de GO-LIVE.

Produção e `main` não foram alteradas.
