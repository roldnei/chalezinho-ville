# Fase 1 — Evidência de testes técnicos

Data: 2026-09-23

## Testes automatizados / integração executados

1. RLS anônimo: propriedades ativas visíveis — PASS.
2. RLS anônimo: reservas invisíveis — PASS.
3. Usuário autenticado sem identidade correspondente não lê reservas — PASS.
4. Tarifa referência = PriceLabs × 1,28 — PASS.
5. Tarifa reembolsável = PriceLabs × 1,20 — PASS.
6. Tarifa não reembolsável = PriceLabs × 1,10 — PASS.
7. Limpeza separada por propriedade — PASS.
8. Quote server-side com expiração de 15 min — PASS.
9. Quote expirada é recusada — PASS.
10. Duas reservas concorrentes na mesma propriedade/período — segunda bloqueada no banco — PASS.
11. Intervalo [check-in, check-out): próximo check-in pode coincidir com checkout anterior — PASS.
12. Busca integra PriceLabs + iCal Airbnb + reservas diretas — PASS.
13. Hold só é criado no início do pagamento — PASS.
14. Expiração automática de hold via pg_cron — configurada a cada 5 min.
15. Pagamento mock aprovado confirma reserva — PASS.
16. Reserva confirmada gera garantia mock — PASS.
17. RLS: hóspede autenticado lê sua própria reserva — PASS.
18. Solicitação de alteração preserva reserva original — PASS.
19. Alteração gera nova cotação de referência — PASS.
20. Nova condição mais barata não gera reembolso automático — PASS.
21. Admin define adicional integral/parcial/zero — PASS (E2E exercitou zero).
22. Hóspede aceita condição antes de aplicação — PASS.
23. Troca de propriedade/data aplica somente após aceite — PASS.
24. Histórico before/after e eventos preservados — PASS.
25. Ocorrência de garantia — PASS.
26. Captura parcial de R$ 30 sobre garantia de R$ 500 — PASS.
27. Saldo não capturado calculado corretamente — PASS.
28. Usuário QA e dados QA removidos após E2E — PASS.
29. Supabase Auth: email habilitado, signup habilitado, confirmação obrigatória — PASS por configuração.
30. Backend temporário de QA removido depois do teste — PASS.

## Ainda exige QA visual / aprovação humana

- responsividade visual em todos os viewports obrigatórios;
- ergonomia dos fluxos auth/reserva/conta;
- textos jurídicos finais de Termos de Hospedagem, Regras e Privacidade;
- cobertura Booking.com direta ou confirmação de sincronização do Booking no calendário usado;
- escolha do gateway real antes do GO-LIVE.

Nenhum pagamento real foi executado.

31. Final smoke da booking-engine v10: config 200 — PASS.
32. Final smoke da booking-engine v10: search 200 — PASS.
33. Extensão pg_net temporária de QA removida após os testes — PASS.
34. Resposta pública da Edge Function não expõe diagnóstico interno detalhado — PASS.
