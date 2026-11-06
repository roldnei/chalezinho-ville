# Cobertura — reteste DEV 2026-11-05-2329-UTC

Estados se aplicam ao **cenário completo da matriz**. Linhas com sufixo registram a parte comprovada sem promover o caso inteiro a PASS. Horários aproximados: 05/11/2026, 20h29–21h07 Brasília. `BLOCKED` indica dependência concreta de papéis, massa ou ambiente; `NOT_RUN` indica que não se iniciou o caso nesta rodada. Evidências financeiras detalhadas permanecem restritas.

| Caso/variação | Papel e tela | Camada comprovada | Esperado | Observado | Estado | Evidência sanitizada / achado |
|---|---|---|---|---|---|---|
| ENV-01 | QA, prévia e DEV | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | Prévia, SHA, perfil, projeto e destino confirmados | Perfil, projeto, sandbox e SHA servido confirmados nos metadados Vercel | PASS | RELATORIO, ambiente |
| AUTH-01 | A/B/C, e-mail e conta | UI DEV + API DEV + BANCO DEV | Cadastro, confirmação, login e erros completos | A/B confirmados e logados; C não confirmado bloqueado; senha inválida/retorno não testados | BLOCKED | A/B HTTP 200; C HTTP 400 `email_not_confirmed` |
| AUTH-01a | C, login | API DEV + BANCO DEV | Não confirmar antes do e-mail | Login negado | PASS | HTTP 400, sem sessão |
| AUTH-02 | A/B, sessão | UI DEV + API DEV | Logout, expiração e recuperação | Não executados | NOT_RUN | — |
| AUTH-03 | A/B/admin, PMS | API DEV | Papéis e propriedades isolados | Hóspedes e anônimo recebem 403 para ação de calendário; anfitrião/equipe ausentes | BLOCKED | `admin_required`; sem matriz completa |
| AUTH-04 | A/B, navegação | UI DEV | Rotas e abas preservam contexto | Abas da mesma origem dividiram sessão; login externo não testado | NOT_RUN | Sessões de papéis exigem isolamento de navegador |
| PUB-01 | Público, vitrine/reserva | UI DEV | CTAs e datas preservados em todo site | Busca e reserva do imóvel QA funcionaram; demais páginas/links não percorridos | BLOCKED | Cotação 17–19 e 24–26/11 |
| RES-01 | A/B, busca | UI DEV + API DEV + BANCO DEV | Disponibilidade e todas as regras do servidor | Imóvel QA cota; datas ocupadas por hold somem e retornam após expiração; mínimos/capacidade não testados | BLOCKED | DEVQA-001; sem escrita nos chalés ativos |
| RES-01a | B, busca durante hold de A | UI DEV + BANCO DEV | Não oferecer datas retidas | 0 opção durante hold; datas voltaram após expiração | PASS | 17–19/11, imóvel QA |
| RES-02 | A/B, tarifas | UI DEV + API DEV + BANCO DEV | Preço próprio, tarifas e composição completos | Ambas tarifas cotadas; não reembolsável sem seleção inicial; adicionais/descontos não testados | BLOCKED | DEVQA-001 |
| RES-02a | A, checkout 17–19/11 | UI DEV + API DEV | 2 tarifas corretas | R$ 676,86 reembolsável; R$ 627,96 não reembolsável | PASS | Limpeza R$ 90 incluída |
| RES-03 | A/B, reserva e termos | UI DEV + API DEV + BANCO DEV | Aceite, versão, integridade e expiração | Aceites e reservas persistiram; cotação adulterada/vencida não testada | BLOCKED | Política 1.2 no cancelamento de B |
| RES-04 | A/B, mesma data | UI DEV + BANCO DEV | Sem dupla reserva/cobrança | Concorrência durante hold observada; clique repetido não testado | BLOCKED | RES-01a |
| RES-05 | Hóspede, pacotes | — | Seleção e combinação corretas | Não houve pacote/experiência isolado preparado | BLOCKED | Falta massa sintética de serviço e disponibilidade |
| PAY-01 | A, Pix | UI DEV + API DEV + BANCO DEV | Criado, pago, expirado e abandonado | Criado/abandonado; sem pagamento, sem expiração comprovada no provedor | BLOCKED | R$ 676,86, pagamento aguardando; hold liberado |
| PAY-01a | A, Pix criado/abandonado | UI DEV + API DEV + BANCO DEV | Estado pendente sem reserva confirmada | Reserva/pagamento pendentes, datas liberadas após hold | PASS | Sem transação Pix confirmada |
| PAY-02 | B, cartão | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | Aprovação, recusa e erro recuperável | Aprovação comprovada; recusa/erro não executados | BLOCKED | Cartão oficial de teste; R$ 648,15 aprovado |
| PAY-02a | B, cartão 8× | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | Cobrança única e valor correto | Pago 64815 centavos; reserva confirmada | PASS | Valores conciliados antes do estorno |
| PAY-03 | B, parcelas | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | 1×, 6×, 8× e máximo com centavos iguais | 8× conferido; 1×/6×/12× não cobrados; sem `payment_terms` havia HTTP 503 | FAIL | DEVQA-002 |
| PAY-03a | B, cartão 8× | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | Juros do hóspede em centavos | Principal R$ 615,76 + R$ 32,39 = R$ 648,15; 8× exibidas | PASS | Aprovado e depois integralmente estornado |
| PAY-04 | B, repetição/rede | — | Uma intenção/cobrança | Não executado | NOT_RUN | — |
| PAY-05 | Sistema, webhook | — | Válido, inválido, duplicado e atrasado | Respostas da cobrança/estorno conciliadas; testes adversariais não executados | NOT_RUN | Não simular replay em ambiente compartilhado sem isolamento |
| PAY-06 | Hóspede, pós-reserva | — | Adicional/upgrade com diferença correta | Serviços sintéticos não preparados | BLOCKED | Dependência de RES-05 |
| CAN-01 | A/B, política | UI DEV + BANCO DEV | Duas versões e leitura cruzada | Aceites da versão vigente persistiram; sem publicar versão nova no DEV compartilhado | BLOCKED | Versão 1.2; publicação requer instância isolada |
| CAN-02 | B, conta e PMS | UI DEV + API DEV + BANCO DEV | Pedido sem motivo, protocolo, repetição e pós-estadia | Pedido sem motivo/protocolo persistiu; repetição/pós-estadia não executados | BLOCKED | Pedido concluído após aprovação administrativa |
| CAN-02a | B, Minha conta | UI DEV + BANCO DEV | Sem justificativa obrigatória | Pedido aceito, protocolo emitido e estado persistido | PASS | Motivo padrão registrado pelo sistema |
| CAN-03 | B, cálculo | UI DEV + BANCO DEV | Fronteiras 24h/7d/20d e tarifas | Apenas janela integral de 24h testada | BLOCKED | Política 1.2, devolução R$ 648,15 |
| CAN-04 | B/admin, PMS estorno | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | Pix/cartão, integral/parcial | Cartão integral 8× confirmado; demais modalidades sem prova | BLOCKED | POST 201 e GET 200 `CANCELED` |
| CAN-04a | Admin, PMS cartão integral | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | Estorno iniciado no PMS e confirmado no provedor | R$ 648,15 solicitados/confirmados, saldo líquido R$ 0 | PASS | Reserva cancelada, pagamento reembolsado |
| CAN-04b | Admin, PMS Pix/parcial | — | Estorno parcial/integral Pix e cartão | Não executados | NOT_RUN | Pix de A não foi pago |
| CAN-05 | Admin, PMS | — | Sem duplicata/excedente/incerteza | Não executado | NOT_RUN | — |
| CAN-06 | Admin, serviços | — | Classificação prestado/não prestado | Serviço sintético não preparado | BLOCKED | Dependência de RES-05 |
| CAN-07 | B/admin, pedido | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | Fluxo e datas coerentes | Aprovação/estorno concluídos, datas liberadas; rejeição não testada | BLOCKED | R$ 648,15 confirmado |
| CAU-01 | B, caução | UI DEV + BANCO DEV | Pré-autorização, recusa e liberação | Linha de R$ 500 pendente; sem autorização/captura | BLOCKED | Check-in futuro; não confundir pendência com retenção |
| CAU-02 | Admin, caução | — | Captura parcial/total e saldo | Não executado | NOT_RUN | Exige caução autorizada sintética |
| CAU-03 | Hóspede/admin, caução | — | Vencimento/renovação/troca | Não executado | NOT_RUN | Exige caução autorizada sintética |
| SEC-01 | A/B, dados da reserva | API DEV + BANCO DEV | Sem leitura cruzada em todas as superfícies | A vê 1 reserva/pagamento, B vê 0 de A; aceites de A invisíveis a B; Storage não testado | BLOCKED | Amostra de RLS positiva, escopo incompleto |
| SEC-01a | A/B, REST de reservas/pagamentos/aceites | API DEV + BANCO DEV | B não vê dados de A | B 0 nos três conjuntos consultados | PASS | Sem IDs/PII publicados |
| SEC-02 | A/B/anônimo, ação PMS | API DEV | Sem elevação de privilégio | `pricing_calendar` devolveu HTTP 403 a hóspedes e anônimo; outras ações não testadas | BLOCKED | `admin_required` |
| SEC-02a | A/B/anônimo, calendário | API DEV | Ação admin negada | HTTP 403 | PASS | Requisições de baixo volume |
| SEC-03 | Cliente, preço/estado | — | Servidor rejeita adulteração | Não executado | NOT_RUN | — |
| SEC-04 | Sistema, webhook/segredos | — | Assinatura, replay e sigilo | Não executado de forma completa | NOT_RUN | Sem HAR ou segredo no repositório |
| SEC-05 | UI/arquivos | — | Entrada, redirect e upload seguros | Não executado | NOT_RUN | — |
| UX-01 | Mobile/desktop | UI DEV parcial | Viewports, teclado, foco, contraste | Jornada no navegador embutido; dimensões/teclado sem registro formal | NOT_RUN | — |
| UX-02 | Site/PMS | UI DEV parcial | Inventário de controles e recuperação | Botões principais de reserva, pedido e estorno funcionaram; cobertura de telas incompleta | BLOCKED | — |
| UX-03 | B, checkout/conta/PMS | UI DEV | Valores e estados claros | Principal/juros/total e pedido/estorno exibidos; indisponibilidade de parcelas antes da semeadura | FAIL | DEVQA-002 |
| UX-04 | Navegadores | LOCAL parcial | Chromium/WebKit e desempenho | Chrome local parcial; WebKit não executado | NOT_RUN | Suíte browser interrompida |
| OPS-01 | Admin, calendário/PMS | UI DEV + API DEV + BANCO DEV | Imóvel isolado, preços e reservas | Alteração/remoção de preço manual no QA; reservas e cancelamento; check-in/limpeza não testados | BLOCKED | DEVQA-001/002 |
| OPS-02 | Admin/B, filas/financeiro | UI DEV + BANCO DEV | Papéis e trilha completos | Pedido, cálculo, aprovação e financeiro do caso B; outros papéis ausentes | BLOCKED | Estorno integral conciliado |
| OPS-03 | Equipe/admin, anexos/custos | — | Permissões e ciclo de anexos | Não executado | NOT_RUN | Papel equipe não preparado |
| OPS-04 | Hóspede, perfil/Moments | — | Perfil/mídia/moderação | Não executado | NOT_RUN | — |
| FIN-01 | B, financeiro | UI DEV + API DEV + BANCO DEV + SANDBOX CONFIRMADO | Conciliação de todas as jornadas | Caso cartão B fecha em zero após estorno; Pix A e adicionais não conciliados até resultado final | BLOCKED | 64815 pagos = 64815 estornados; caução capturada 0 |
| FIN-01a | B, cartão integral | UI DEV + BANCO DEV + SANDBOX CONFIRMADO | Principal + juros − estorno = 0 | 61576 + 3239 − 64815 = 0 centavos | PASS | Datas devolvidas ao inventário QA |

## Testes locais

`npm run check` e `npm run typecheck` passaram. `node --test tests/property-pricing.test.mjs` passou 6/6. A suíte browser precisou instalar Chromium; uma execução parcial em Chrome produziu 15 PASS, 14 FAIL, 1 SKIP antes de ser interrompida, sem triagem das falhas. A suíte Node completa foi interrompida após cerca de 25 minutos sem resumo final. Os testes locais não substituem as camadas UI DEV, banco DEV e sandbox.
