# Validação financeira — Chalezinho Ville

29/09/2026, ambiente de desenvolvimento. **NO-GO para produção.**

O backend isolado é `pxfqmnhqodqyaaqeyjgr` (Supabase gratuito). O site público e seu banco não foram alterados. As operações abaixo usam cartões fictícios e o sandbox do PagBank.

Código e revisão: [PR 4, em rascunho](https://github.com/roldnei/chalezinho-ville/pull/4). [Preview da branch](https://chalezinho-ville-git-fix-reservation-f-9818b3-roldneicosta-4140.vercel.app).

## Atualização das 10h45 BRT

Pix liquidado e devolvido integralmente no sandbox: reserva **58930206DC**, R$ 8,08 pagos, R$ 3,08 devolvidos na primeira operação e R$ 5,00 na segunda. A consulta final do PagBank informa `CANCELED`, `paid=808`, `refunded=808`; o banco confirma reserva cancelada e pagamento reembolsado. A conciliação aguardou a atualização efetiva dos valores, sem considerar uma resposta HTTP isolada como sucesso.

A troca do cartão da caução foi executada na conta do hóspede da reserva **5F7627F740**. O token, o consentimento `guarantee-v2` e a autorização opcional de renovação ficaram vinculados à reserva, sem pré-autorização antecipada. O novo fluxo de caução tem histórico próprio de autorizações, tratamento de recusa, recuperação de resultado incerto e renovação condicionada ao consentimento e ao prazo real do provedor.

**Estornos de cartão continuam sem confirmação**, com os erros documentados abaixo. O print enviado pelo usuário às 11h01 confirma no Portal Dev o pedido ORDE_143C5D9F-DB6D-4EF9-BB15-191F8D9E9892, Pix de R$ 8,08, com status Cancelado. O recebimento e as duas devoluções foram comprovados por API autenticada e banco; a tela do site e o print do portal confirmam o estado final. O portal não discrimina neste print os valores das duas devoluções.

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
| Pix | Reserva 58930206DC: R$ 8,08 pagos e reserva confirmada. Devolução parcial de R$ 3,08 e devolução dos R$ 5,00 restantes confirmadas; total devolvido R$ 8,08 e reserva cancelada. A cobrança anterior de R$ 1.342,40 permaneceu aguardando e expirou conforme a faixa de simulação. |
| Webhook | Reenvio no Portal Dev passou de HTTP 401 para 200. O sandbox não enviou nenhum dos dois cabeçalhos de assinatura documentados. |
| Proteção contra aviso forjado | Aviso que declarava falsamente o Pix pago por R$ 0,01 não alterou o saldo nem confirmou a reserva: o servidor consultou o PagBank e manteve o valor real e o estado pendente. Assinatura inválida retornou 401. |
| Permissões | Com a conta fictícia no papel de hóspede: leitura do próprio financeiro permitida; painel administrativo, estorno da reserva e estorno da caução retornaram 403. O papel administrativo da conta de teste foi restaurado para concluir a homologação. |

O [simulador oficial PagBank](https://developer.pagbank.com.br/docs/simulador) liquida Pix de até R$ 100 automaticamente; valores acima de R$ 400 permanecem aguardando. Para a nova cotação, a tarifa foi reduzida apenas no banco isolado e restaurada antes do pagamento (limpeza do chalé 2: R$ 290; multiplicador da tarifa 3: 11000). Não houve alteração do preço público.

## Devoluções em cartão: solicitadas, ainda não confirmadas

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
- Job a cada cinco minutos consulta pagamentos pendentes e estornos, reconcilia garantias e pré-autoriza cartões vinculados na janela de chegada. Uma operação atômica bloqueia a liberação manual ou automática enquanto existe ocorrência aberta na reserva, inclusive sem vínculo específico com a caução. A liberação automática também trata autorização que deixou de ser necessária após remarcação para uma data distante.
- Avisos sem assinatura são aceitos apenas no backend isolado sandbox como gatilho limitado para consultar cobrança já registrada. Status e valores vêm exclusivamente da API autenticada do PagBank. Assinaturas presentes e inválidas são recusadas.
- A tela separa valor da reserva, cobrança, caução, captura e estorno. Os controles de parcelas ficam ocultos no Pix.
- Autorizações de caução têm identidade imutável, vínculo com a reserva/cartão, prazo real e histórico de substituições. Solicitação incerta bloqueia duplicação; recuperação manual confere pedido, cobrança, referência e valor na API.
- Recusa preserva a reserva paga e permite trocar o cartão. Rejeição definitiva de parâmetros é distinguida de timeout, rate limit e chave em uso. Não há repetição automática da mesma versão de cartão recusada.
- Pré-autorização começa na janela de 48 horas antes do check-in. Estadias longas admitem renovação explicitamente consentida; a autorização anterior só entra em liberação após confirmação da nova. A interface informa eventual sobreposição de limite.
- Cancelamento e remarcação acordam o processamento da caução; ocorrências e capturas bloqueiam operações conflitantes. Check-in exige cobertura até a saída configurada ou exceção administrativa justificada e auditada.
- Troca de cartão usa criptografia do SDK, limpa os campos e mostra confirmação. O servidor recebe somente cartão criptografado e mantém token reservado ao backend.
- Checkout preserva preço e vencimento da cotação ao avançar sem alterar experiências. Pix recusado sem QR code preserva o identificador da cobrança.
- Após estorno de cancelamento confirmado, a conta atualiza a reserva e seus botões quando a confirmação ocorre durante o carregamento. Caução que nunca bloqueou limite deixa de mostrar liberação pendente.

## Verificação técnica e limites

- 132 testes automatizados passaram, incluindo banco local PostgreSQL/PGlite, valores cumulativos, idempotência, imutabilidade e rejeição de operações administrativas.
- 9 testes de interface passaram em celular, notebook e desktop. Esses nove usam respostas simuladas e são distintos das transações sandbox descritas acima.
- Sintaxe, TypeScript e build do preview passaram.
- Execução do job no Supabase retornou HTTP 200, consultou os pagamentos e estornos e autorizou a caução esperada.
- O advisor do Supabase não encontrou erro crítico; sinalizou tabelas internas sem políticas de acesso direto (restrição intencional) e proteção de senhas vazadas desativada. [Orientação Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Permanece NO-GO para produção: devoluções de cartão aguardam solução/confirmação no PagBank; a troca de autorização foi confirmada no sandbox com disparo antecipado de teste, mas não transcorreu uma estadia de vários dias. A liberação dos R$ 320 restantes da captura parcial continua sem comprovação do PagBank. Recusas, renovação, mudança de datas, recuperação e conflitos foram cobertos por testes automatizados; esses testes não substituem a habilitação/homologação da conta PF em produção. A concorrência testada com PostgreSQL/PGlite não equivale a carga com sessões PostgreSQL remotas independentes. Os termos de hospedagem/privacidade e a revisão completa dos módulos não financeiros não fazem parte da confirmação dos pagamentos descrita aqui.

O advisor não indicou erros de segurança. Há 28 recomendações informativas de índices em chaves estrangeiras do esquema e índices ainda sem uso neste banco recém-criado; não foram removidos índices com base nesse histórico curto. [Orientação de índices Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## Identificadores para conferência no PagBank

| Operação | Pedido |
|---|---|
| Hospedagem 1x | `ORDE_3E20E99E-99FB-427B-A7D9-BBF3F5F0EC70` |
| Caução com captura de R$ 180 | `ORDE_1E21B6EA-BC2A-4947-8BEC-7BF88A5C1F39` |
| Hospedagem 12x com juros | `ORDE_ACA61354-B0A9-45FA-8F26-06BD9FE53902` |
| Caução da reserva 12x | `ORDE_532E20F2-E46B-4918-B25A-2014724F6170` |
| Hospedagem 6x sem juros | `ORDE_39F2B1C0-4F95-4670-ACFC-F1E629CA71FF` |
| Pix expirado | `ORDE_067569AB-43E8-4E20-9353-C70E706E6E6C` |
| Pix pago e integralmente devolvido | `ORDE_143C5D9F-DB6D-4EF9-BB15-191F8D9E9892` |
| Caução liberada sem captura | `ORDE_655835C2-3F6C-4D81-9AF6-4853F4AE9B06` |
| Hospedagem do cenário de liberação | `ORDE_673A7134-B057-4C99-8FDD-FEBA34799E68` |

Esses identificadores permitem investigar com o suporte do provedor sem compartilhar tokens, senhas ou dados de cartão.



## Atualização das 11h16 BRT: renovação e saldo restante

A reserva fictícia 5F7627F740 teve uma nova autorização de R$ 500 confirmada antes de cancelar a anterior. Consultas independentes retornaram anterior CANCELED/paid=0 e nova AUTHORIZED/paid=0. O histórico preservou as duas operações e a sequência de despacho. Próxima avaliação pelo sistema: 02/10 às 11:12:22 BRT; validade real recebida: 04/10 às 11:12:22 BRT, ainda anterior à saída de 05/10.

O teste antecipou somente o disparo das duas tentativas, usando o código real de autorização e conciliação; não alterou prazo nem resposta do provedor. Portanto comprova a substituição no sandbox, não uma estadia longa transcorrida. O instrumento temporário foi encerrado e verificado com HTTP 410. O disparador normal não criou terceira autorização. Foram reexecutados 19 testes de caução/liberação, todos aprovados. Os novos pedidos foram conferidos na API e no banco; a sessão do portal no computador está expirada.

Nova consulta da captura parcial confirmou total=50000, paid=18000, refunded=0, incremented=0, sem campo que comprove a liberação dos R$ 320. O sistema mantém essa liberação não confirmada. Não houve pedido de cancelamento de R$ 320 nem estorno dos R$ 180 neste teste.

Detalhes e pergunta pronta para o suporte (não enviada): [evidência da renovação e saldo restante](guarantee-renewal-live-20260929.md).


## Revisão final após os prints do usuário

Renovação confirmada também visualmente no Portal Dev. Corrigidas validade ausente/margem de captura e origem do preview fixo. 136 testes automatizados e 9 testes de interface aprovados; testes remotos de permissões e execução periódica aprovados. Revisão detalhada: final-review-20260929.md; minuta funcional: operating-copy-draft.md. Acompanhamento real programado para 02/10 às 11h20 BRT. Produção continua bloqueada pelas pendências documentadas.


Na conferência da tela, “Consultar caução” voltava à primeira reserva. Corrigido para atualizar os dados mantendo a reserva selecionada; regressão com duas reservas aprovada.
