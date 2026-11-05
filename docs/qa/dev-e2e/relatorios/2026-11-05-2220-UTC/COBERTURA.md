# Cobertura — 2026-11-05-2220-UTC

Camadas: `LOCAL`, `UI DEV`, `API DEV`, `BANCO DEV`. Nenhum caso foi confirmado no PagBank sandbox. `BLOCKED` indica ausência de conta autorizada, caixa de teste, preço isolado ou navegador da suíte; `NOT_RUN` indica etapa ainda não executada.

| Caso | Prioridade | Camada comprovada | Observado nesta rodada | Estado |
|---|---|---|---|---|
| ENV-01 | P0 | UI DEV + API DEV + BANCO DEV | SHA da prévia, perfil DEV, projeto e versões de funções confirmados; imóvel QA sem integrações; gateway sandbox não confirmado por transação. | BLOCKED |
| AUTH-01 | P0 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| AUTH-02 | P0 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| AUTH-03 | P0 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| AUTH-04 | P1 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| PUB-01 | P1 | UI DEV | Ville Moments → Chalés → Reserva CH1 funcionou em celular emulado; demais links não percorridos. | NOT_RUN |
| RES-01 | P0 | UI DEV + BANCO DEV | Imóvel QA apareceu na busca; 17–19/11/2026 retornou 0 opções e tarifa indisponível por falta de preço. | FAIL |
| RES-02 | P0 | UI DEV | Não foi possível abrir comparação de tarifas do imóvel QA sem preço. | BLOCKED |
| RES-03 | P0 | LOCAL | Jornada hospedada não completada: faltam contas e caixa de teste autorizadas e preço para o imóvel QA isolado. | BLOCKED |
| RES-04 | P0 | LOCAL | Jornada hospedada não completada: faltam contas e caixa de teste autorizadas e preço para o imóvel QA isolado. | BLOCKED |
| RES-05 | P1 | LOCAL | Jornada hospedada não completada: faltam contas e caixa de teste autorizadas e preço para o imóvel QA isolado. | BLOCKED |
| PAY-01 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| PAY-02 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| PAY-03 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| PAY-04 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| PAY-05 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| PAY-06 | P1 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAN-01 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAN-02 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAN-03 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAN-04 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAN-05 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAN-06 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAN-07 | P1 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAU-01 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAU-02 | P0 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| CAU-03 | P1 | LOCAL | Sem reserva paga sintética do imóvel QA; não houve cobrança, estorno ou caução no sandbox. | BLOCKED |
| SEC-01 | P0 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| SEC-02 | P0 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| SEC-03 | P0 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| SEC-04 | P0 | LOCAL + API DEV | Configuração pública aponta DEV; replay/webhook e ausência de exposição em sessão autenticada não comprovados. | BLOCKED |
| SEC-05 | P1 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| UX-01 | P1 | UI DEV | Navegação mobile em viewport 465 px aproximados; demais dimensões, toque e teclado não concluídos. | NOT_RUN |
| UX-02 | P1 | UI DEV | Busca sem check-in mostrou “Escolha a data de entrada”; inventário completo de controles não executado. | NOT_RUN |
| UX-03 | P1 | LOCAL | Jornada hospedada não completada: faltam contas e caixa de teste autorizadas e preço para o imóvel QA isolado. | BLOCKED |
| UX-04 | P2 | LOCAL | Playwright: 105 falhas de infraestrutura por executável Chromium ausente; WebKit não executado. | BLOCKED |
| OPS-01 | P1 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| OPS-02 | P1 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| OPS-03 | P1 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| OPS-04 | P2 | LOCAL | Sem contas de teste com papel e caixa de e-mail autorizadas; não houve ação autenticada. | BLOCKED |
| FIN-01 | P0 | BANCO DEV | Imóvel QA sem integrações e sem cobrança criada; conciliação financeira não iniciada. | BLOCKED |

## Variações exigidas

| Variação | Camada | Estado | Motivo |
|---|---|---|---|
| AUTH-01 A/B/C confirmação e recuperação | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| AUTH-03 administrador/anfitrião/equipe | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| PAY-01 Pix criado/confirmado/expirado/abandonado | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| PAY-02 cartão aprovado/recusado/erro | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| PAY-03 cartão 1×/6×/8×/máximo | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| PAY-05 webhook duplicado/atrasado/inválido | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| CAN-04 Pix parcial/integral | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| CAN-04 cartão parcial/integral e 8× com juros | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| CAN-06 pacote no checkout/pós-reserva, item prestado/não prestado | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| CAU-01/02 autorização/captura/liberação | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| SEC-01 hóspede A/B e papéis PMS | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
| UX-01 320/390/desktop/WebKit | Nenhuma confirmação ponta a ponta | BLOCKED | Conta, preço, papel ou sandbox não preparado. |
