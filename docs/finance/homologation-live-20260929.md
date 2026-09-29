# Validação financeira — Chalezinho Ville

29/09/2026, ambiente de desenvolvimento. **NO-GO para produção.**

O backend isolado é `pxfqmnhqodqyaaqeyjgr` (Supabase gratuito). O site público e seu banco não foram alterados. As operações abaixo usam cartões fictícios e o sandbox do PagBank.

Código e revisão: [PR 4, em rascunho](https://github.com/roldnei/chalezinho-ville/pull/4). [Preview da branch](https://chalezinho-ville-git-fix-reservation-f-9818b3-roldneicosta-4140.vercel.app).

## Resultados comprovados

| Cenário | Resultado observado |
|---|---|
| Crédito à vista | Reserva 57BBF31A42 confirmada; R$ 1.470,80 pagos em 1x. |
| Crédito em 6x sem juros para o hóspede | Reserva 5F7627F740 confirmada; R$ 1.750,40 pagos. Verificado na tela, API e portal: 6 parcelas, R$ 1.750,40, status Pago. |
| Crédito em 12x com juros do comprador | Reserva 51F976D690 confirmada; base R$ 1.226,00 + juros R$ 153,99 = R$ 1.379,99. Portal confirma 12 parcelas e status Pago. |
| Pré-autorização de caução | R$ 500 autorizados e vinculados à reserva. O processamento automático também autorizou a caução da reserva 51F976D690. |
| Captura parcial da caução | R$ 180 efetivamente capturados da autorização de R$ 500, reserva 57BBF31A42. API informa `paid=18000`; portal mostra Pago e mantém o valor original autorizado de R$ 500. |
| Captura integral da caução | Reserva 51F976D690: R$ 500 capturados; API, banco e portal confirmaram. Saldo para nova captura zerado. Foto e recibo fictícios anexados manualmente. |
| Liberação sem danos | Reserva 09AA5303C8: R$ 500 pré-autorizados e depois integralmente liberados, sem captura. API e portal CANCELED/Cancelado; site confirmou R$ 500 liberados. |
| Saldo não capturado | R$ 320 não foram cobrados. **A liberação desse restante não foi comprovada pelo provedor.** |
| Pix | Reserva 1002EC1C31: cobrança de R$ 1.342,40 criada, código copia e cola disponível e portal Aguardando. Sem pagamento, expirou; reserva ficou não confirmada e pagamento expirado. **Liquidação Pix ainda não homologada.** |
| Webhook | Reenvio no Portal Dev passou de HTTP 401 para 200. O sandbox não enviou nenhum dos dois cabeçalhos de assinatura documentados. |
| Proteção contra aviso forjado | Aviso que declarava falsamente o Pix pago por R$ 0,01 não alterou o saldo nem confirmou a reserva: o servidor consultou o PagBank e manteve o valor real e o estado pendente. Assinatura inválida retornou 401. |
| Permissões | Com a conta fictícia no papel de hóspede: leitura do próprio financeiro permitida; painel administrativo, estorno da reserva e estorno da caução retornaram 403. O papel administrativo da conta de teste foi restaurado para concluir a homologação. |

## Devoluções: solicitadas, ainda não confirmadas

| Operação | Resultado do provedor | Confirmado como devolvido |
|---|---|---:|
| R$ 30 da caução capturada de R$ 180 | 40008; reenvio com a mesma chave recebeu 40005 | R$ 0 |
| R$ 30 da hospedagem 57BBF31A42 | 40008; reenvio com a mesma chave recebeu 40005 | R$ 0 |
| R$ 1.750,40, estorno integral da compra em 6x | 40008; reenvio cerca de 20 minutos depois com a mesma chave recebeu 40005 | R$ 0 |
| R$ 500, estorno integral da caução da reserva 51F976D690 | 40008 | R$ 0 |
| R$ 1.342,40, novo ciclo completo em 1x, reserva 09AA5303C8 | 40008 | R$ 0 |
| R$ 1.379,99, estorno integral da compra em 12x com juros | 40008, descrição exata Transaction is not found. | R$ 0 |

O código 40008 significa reembolso temporariamente indisponível; 40005 significa chave de idempotência em uso. [Referência oficial de erros PagBank](https://developer.pagbank.com.br/reference/codigos-de-erro-order).

O sistema mantém essas solicitações pendentes, reserva seus valores e consulta novamente o provedor. Não cria outra devolução para contornar a chave em uso. As reservas continuam ativas até confirmação do cancelamento financeiro. A devolução integral de R$ 1.379,99 da reserva em 12x, incluindo juros, foi solicitada após a captura integral da caução; também permanece pendente.

## Captura integral comprovada

A reserva 51F976D690 teve R$ 500 autorizados e depois R$ 500 capturados. A ocorrência foi aprovada somente após salvar foto e recibo de simulação enviados manualmente. A cobrança `CHAR_BBFDBFE8-FAF0-4385-81BF-6C6607334D6A` consta como paga no PagBank. O estorno integral foi solicitado, recebeu 40008 e segue sem confirmação; devolvido continua R$ 0.

A documentação da API Order permite devolução total e parcial. A limitação a estorno integral da API de assinaturas refere-se a outro produto. Os testes integrais acima também falharam, portanto não há evidência de que o valor parcial seja a causa. [Serviços de pedidos e pagamentos](https://developer.pagbank.com.br/docs/servicos-de-pedidos-e-pagamentos), [API de assinaturas](https://developer.pagbank.com.br/reference/criar-estorno-de-pagamento).

Na tentativa de estorno integral da compra em 12x, às 03:01:59 BRT, o provedor retornou exatamente `40008` com `Transaction is not found.`. O diagnóstico retém somente a etiqueta fixa `transaction_not_found`; não guarda a descrição bruta. A consulta autenticada da mesma cobrança retornou `PAID`, `paid=137999` e `refunded=0`. Um novo ciclo de venda (nova reserva e nova cobrança) também recebeu 40008. Repetir o pedido de estorno da compra em 6x com a mesma chave cerca de 20 minutos depois recebeu 40005.

Há um [relato na comunidade PagBank](https://developer.pagbank.com.br/discuss/69e638642b52c98604db0033) com essa mesma mensagem em sandbox, sem resposta oficial visível explicando a causa. O resultado aponta para inconsistência no ambiente de teste, mas não comprova a causa interna, instabilidade de adquirente ou insuficiência de saldo da conta PF real.

Os anexos de ambos os testes representam apenas simulações, sem dano real nem comprovante fiscal.

## Correções publicadas no desenvolvimento

- Corrigida a ausência de políticas de cancelamento no banco novo, preservando documentos e escolhas existentes.
- Corrigida a consulta administrativa que falhava por ambiguidade entre duas relações de ocorrências e cauções.
- Validação do nome do comprador antes de criar a reserva; mensagem de recusa não culpa automaticamente o cartão.
- Reenvio de estorno somente após recusa temporária explícita, espera mínima, consulta do saldo e liberação atômica da tentativa. A intenção e a chave original são preservadas. Resultado desconhecido não é reenviado.
- Job a cada cinco minutos consulta pagamentos pendentes e estornos, reconcilia garantias e pré-autoriza cartões vinculados na janela de chegada. Uma operação atômica bloqueia a liberação manual ou automática enquanto existe ocorrência aberta na reserva, inclusive sem vínculo específico com a caução. A liberação automática exige reserva cancelada.
- Avisos sem assinatura são aceitos apenas no backend isolado sandbox como gatilho limitado para consultar cobrança já registrada. Status e valores vêm exclusivamente da API autenticada do PagBank. Assinaturas presentes e inválidas são recusadas.
- A tela separa valor da reserva, cobrança, caução, captura e estorno. Os controles de parcelas ficam ocultos no Pix.

## Verificação técnica e limites

- 111 testes automatizados passaram, incluindo banco local PostgreSQL/PGlite, valores cumulativos, idempotência, imutabilidade e rejeição de operações administrativas.
- 9 testes de interface passaram em celular, notebook e desktop. Esses nove usam respostas simuladas e são distintos das transações sandbox descritas acima.
- Sintaxe, TypeScript e build do preview passaram.
- Execução do job no Supabase retornou HTTP 200, consultou os pagamentos e estornos e autorizou a caução esperada.
- O advisor do Supabase não encontrou erro crítico; sinalizou tabelas internas sem políticas de acesso direto (restrição intencional) e proteção de senhas vazadas desativada. [Orientação Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Ainda falta comprovar a liquidação Pix e devoluções efetivas no sandbox. A revisão ampla de experiências, remarcações, casos legados, recuperação de autorização sem identificador após falha de transporte, concorrência com sessões PostgreSQL independentes e habilitação/homologação da conta em produção permanece necessária. Nenhum desses pontos está marcado como concluído por existir um teste local ou uma resposta HTTP 200.

## Identificadores para conferência no PagBank

| Operação | Pedido |
|---|---|
| Hospedagem 1x | `ORDE_3E20E99E-99FB-427B-A7D9-BBF3F5F0EC70` |
| Caução com captura de R$ 180 | `ORDE_1E21B6EA-BC2A-4947-8BEC-7BF88A5C1F39` |
| Hospedagem 12x com juros | `ORDE_ACA61354-B0A9-45FA-8F26-06BD9FE53902` |
| Caução da reserva 12x | `ORDE_532E20F2-E46B-4918-B25A-2014724F6170` |
| Hospedagem 6x sem juros | `ORDE_39F2B1C0-4F95-4670-ACFC-F1E629CA71FF` |
| Pix | `ORDE_067569AB-43E8-4E20-9353-C70E706E6E6C` |
| Caução liberada sem captura | `ORDE_655835C2-3F6C-4D81-9AF6-4853F4AE9B06` |
| Hospedagem do cenário de liberação | `ORDE_673A7134-B057-4C99-8FDD-FEBA34799E68` |

Esses identificadores permitem investigar com o suporte do provedor sem compartilhar tokens, senhas ou dados de cartão.
