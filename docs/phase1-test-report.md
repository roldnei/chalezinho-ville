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
12. Busca integra PriceLabs + iCal Airbnb + iCal Booking.com + reservas diretas — PASS.
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
- escolha do gateway real antes do GO-LIVE.

Nenhum pagamento real foi executado.

31. Final smoke da booking-engine v10: config 200 — PASS.
32. Final smoke da booking-engine v10: search 200 — PASS.
33. Extensão pg_net temporária de QA removida após os testes — PASS.
34. Resposta pública da Edge Function não expõe diagnóstico interno detalhado — PASS.
35. Booking.com configurado por secret para CH1/CH2/CH3; `availability_coverage.booking=true` — PASS (2026-09-25).
36. Período ocupado no feed do CH1 bloqueia somente o Ville Signature; CH2/CH3 permanecem independentes — PASS (2026-09-25).
37. Logs da booking-engine após os smokes de Booking.com: zero respostas 4xx/5xx — PASS (2026-09-25).
38. Preview protegido aberto em navegador real; Home e reserva carregam sem bloqueio de autenticação da Vercel — PASS (2026-09-25).
39. Busca real 10/12/2026 → 12/12/2026 retornou três propriedades e preços server-side — PASS (2026-09-25).
40. Seleção de tarifa gera quote de 15 minutos sem bloquear datas — PASS (2026-09-25).
41. Pacote romântico de R$ 300 permanece marcado como fonte de upsell; próximo ativo da categoria é R$ 549 e diferença server-side é R$ 249 — PASS.
42. Carrinho pós-reserva não cria cobrança ao adicionar; cobrança nasce apenas no checkout do item — PASS.
43. Trigger de notificação reconhece os tipos reais `experience_add` e `experience_upgrade` — PASS com rollback.
44. Eventos `payment_refunded`, `modification_rejected`, `modification_approved_confirmation` e `modification_confirmed` — PASS com rollback.
45. Contrato do outbox: claim incrementa tentativa, falha transitória volta para fila e o limite leva a `failed` — PASS com rollback.
46. RPCs financeiras críticas: `anon=false`, `authenticated=false`, `service_role=true` — PASS.
47. URL Configuration do Auth: Site URL de produção e redirects de produção/Preview — PASS por inspeção do painel.
48. Leaked Password Protection — BLOQUEADO EXTERNAMENTE pelo plano Supabase Free; requer Pro ou superior.
49. Área do Hóspede ordena reservas por `created_at` decrescente, com a reserva recém-criada no topo — PASS (2026-09-25).
50. Reserva `A296A1F6C0`: Noite Romântica ativa por R$ 549 encontra Ultra Premium por R$ 599 como próximo upgrade e calcula somente R$ 50 de diferença — PASS (2026-09-25).
51. Migração dos estados históricos: 13 reservas confirmadas preservadas; tentativas nunca confirmadas reclassificadas para `not_confirmed` conforme o pagamento — PASS (2026-09-25).
52. Cartão recusado: reserva `not_confirmed/payment_refused` e pagamento `refused`, sem falso cancelamento — PASS com rollback.
53. Fechamento antes da confirmação: reserva `not_confirmed/payment_cancelled` e pagamento `cancelled` — PASS com rollback.
54. Pagamento em análise: reserva permanece `pending_payment`, datas protegidas sem expiração automática, pagamento `under_review` — PASS com rollback.
55. Pagamento aprovado: pagamento `paid`, reserva `confirmed`, `confirmed_at` preenchido e garantia criada idempotentemente — PASS com rollback.
56. RPCs da nova máquina de estados: execução revogada de `anon` e `authenticated`, concedida apenas a `service_role` — PASS.
57. Invariante no banco impede marcar como `cancelled` ou `no_show` uma tentativa que nunca foi confirmada — PASS.
58. Reserva inicial com R$ 300: recusa do upsell mantém o pacote; aceite troca somente para R$ 549 e acrescenta exatamente R$ 249 — PASS no navegador real (2026-09-25).
59. Fechar checkout Pix gera tentativa `not_confirmed/payment_cancelled`; cartão recusado e cartão em análise exibem estados distintos — PASS no navegador real.
60. Upgrade pós-reserva R$ 549 → R$ 599 cobra somente R$ 50, retry reutiliza a mesma cobrança e a aplicação mantém `total_amount = pagamentos pagos = ledger` — PASS.
61. Alteração sem diferença exige confirmação explícita; alteração paga de R$ 707,30 aplica datas e total automaticamente após pagamento — PASS.
62. Alteração não paga expira, libera o hold, mantém as datas originais e enfileira `modification_cancelled_unpaid` — PASS.
63. Carrinho pós-reserva sobrevive ao reload sem criar cobrança; cobrança só nasce em `Ir para pagamento` e permanece recuperável após abandono — PASS.
64. Pagamento pós-reserva em análise bloqueia retry e cancelamento; após recusa, cancelamento volta a ficar disponível — PASS.
65. Painel operacional voltou a listar solicitações após remoção de relacionamento PostgREST inválido; datas solicitadas são exibidas corretamente na pendência — PASS.
66. Quatro reservas `[DEV]` desta rodada, seus pagamentos, ledger, eventos, quotes e dependências foram removidos; nenhum carrinho ou órfão financeiro permaneceu — PASS.
67. Edge Function v40: zero respostas 4xx/5xx nos logs do período; Preview `e4a2159` READY; produção e `main` não alteradas — PASS.
68. PMS final `c6eeb131`: autenticação administrativa, visão de hoje, checklists, equipe e calendário unificado exercitados no Preview — PASS (2026-09-26).
69. Horários operacionais convertidos de America/Sao_Paulo para UTC sem deslocamento indevido — PASS automatizado (`12:00 -03:00 = 15:00Z`).
70. Sete tabelas `pms_*`: RLS ativo, `anon`/`authenticated` sem leitura direta e `service_role` autorizado — PASS.
71. Limpeza de QA: zero tarefas, ocorrências e modelos `[DEV]`; modelo padrão ativo com 7 itens preservado — PASS.
72. Edge Functions atuais: `booking-engine` v45 e `pms-operations` v3, ambas ACTIVE — PASS.
73. Deployment Preview final `dpl_2vJQ4ACdTJUVmX536BS3YV8SWi6e` READY; produção e `main` não alteradas — PASS.
74. Migração `pms_full_cycle_operations`: bloqueios operacionais, escopo por imóvel, permissões e tempos de execução/vistoria aplicados — PASS (2026-09-26).
75. Bloqueio `[DEV]` criado pela tela tornou somente o imóvel selecionado indisponível no motor; demais imóveis permaneceram disponíveis — PASS.
76. Calendário administrativo exibiu o bloqueio operacional na faixa e imóvel corretos, junto das fontes Site/Airbnb/Booking — PASS.
77. Reserva `A296A1F6C0`: experiência Noite Romântica e tarefas independentes de preparação da experiência e limpeza exibidas na ficha operacional — PASS.
78. Designação, início, checklist com dois itens, vistoria e aprovação final foram executados pelas telas; `started_at`, `submitted_at` e `completed_at` persistidos — PASS.
79. Atribuição, solicitação de vistoria e liberação geraram três notificações administrativas; seis eventos operacionais preservaram a trilha do teste — PASS.
80. Endpoint PMS sem sessão retornou 403; tabela de bloqueios manteve RLS ativo e zero grants para `anon`/`authenticated` — PASS.
81. Smokes finais da `booking-engine` v46: config 200, search 200, três imóveis e cobertura Booking.com ativa — PASS.
82. QA `[DEV]` removido: zero tarefas, itens, notificações e bloqueios temporários remanescentes — PASS.
83. Preview de desenvolvimento `0dd47a87` aberto em navegador real; PMS, reserva, tarefas e calendário administrativo exercitados — PASS.
84. Migração `pms_team_access_management`: convites e perfis operacionais permanecem server-only, com RLS e sem grants para `anon`/`authenticated` — PASS (2026-09-26).
85. Acesso por imóvel deixa de interpretar escopo vazio como acesso global; operadores existentes foram migrados explicitamente para os imóveis já disponíveis — PASS.
86. Proteções administrativas impedem auto-rebaixamento, auto-suspensão e remoção do último proprietário administrador — PASS.
