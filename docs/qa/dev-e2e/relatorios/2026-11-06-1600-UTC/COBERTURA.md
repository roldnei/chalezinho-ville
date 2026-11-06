# Cobertura — continuação DEV 06/11/2026

Esta matriz registra **somente a execução de 06/11**. Resultados financeiros e de permissões de 05/11 permanecem no [relatório anterior](../2026-11-05-2329-UTC/COBERTURA.md) e não são promovidos a PASS nesta rodada sem repetição. `BLOCKED` indica dependência concreta; `NOT_RUN` indica cenário não iniciado. As variações com sufixo separam a prova parcial do caso completo.

| Caso/variação | Papel e tela | Camada comprovada | Esperado | Observado | Estado | Evidência sanitizada / achado |
|---|---|---|---|---|---|---|
| ENV-01 | QA, Vercel/DEV | UI DEV + metadados Vercel | Prévia, SHA, perfil, projeto, sandbox e isolamento completos | Preview READY e SHA conferido; banner DEV/sandbox; imóvel QA sem calendários conectados, mas endpoint de exportação não inspecionado | BLOCKED | RELATORIO, ambiente |
| AUTH-01 | Hóspedes, cadastro/login | — | Cadastro, confirmação e login | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| AUTH-02 | Hóspedes, sessão | — | Logout/expiração/recuperação | Não executado | NOT_RUN | — |
| AUTH-03 | Papéis, PMS | UI DEV parcial | Permissões de admin, anfitrião e equipe | Admin operou imóvel QA; outros papéis não testados hoje | BLOCKED | Faltam papéis sintéticos anfitrião/equipe |
| AUTH-04 | Navegação/auth | — | Retorno seguro | Não executado | NOT_RUN | — |
| PUB-01 | Público, reserva | UI DEV | Vitrine e CTAs completos | Vitrine em 320 px e CTA “Escolher datas” abriram a busca; cartão QA sem foto mostra imagem quebrada; demais entradas não percorridas | BLOCKED | DEVQA-004 |
| RES-01 | Público, busca | UI DEV + API DEV | Disponibilidade, capacidade, mínimos e datas válidos | Sexta de 1 noite bloqueada por mínimo 2; segunda de 1 noite permitida; 3 hóspedes retornou erro genérico | FAIL | DEVQA-002 |
| RES-01a | Público, 1 e 2 noites | UI DEV + API DEV | Disponibilidade coerente | Imóvel QA oferecido em 17–18 e 17–19/11 | PASS | R$ 108 não reembolsável em 1 noite; R$ 196 em 2 |
| RES-01b | Público, 3 hóspedes | UI DEV | Capacidade 2 respeitada com mensagem útil | Nenhuma reserva oferecida, mas “Consulta indisponível” | FAIL | DEVQA-002 |
| RES-01c | Público, mínimo por dia | UI DEV + API DEV | Regras refletidas na busca | 20–21/11 mostra mínimo 2; 23–24/11 oferece 1 noite | PASS | Mesmo imóvel QA, sem canais |
| RES-02 | Público, duas tarifas | UI DEV + API DEV | Preços e composição, adicionais/descontos | R$ 212 reembolsável e R$ 196 não reembolsável; pacote QA R$ 60 somou R$ 272 reembolsável; descontos não exercitados | BLOCKED | Tabela própria PMS R$ 80/100; limpeza R$ 20 |
| RES-02a | Público, escolha de tarifa | UI DEV | Nenhuma opção pré-selecionada | Duas opções com rádio vazio até escolha | PASS | 17–19/11 |
| RES-03 | Admin, checkout | UI DEV + API DEV parcial | Aceite/cotação/expiração e persistência | Dois Pix e cinco cartões de reserva persistidos; expiração de cotação não exercitada | BLOCKED | Aceites autorizados nos sete checkouts sintéticos |
| RES-04 | Público, concorrência | UI DEV parcial | Sem dupla reserva/cobrança | Datas do Pix pendente ficaram indisponíveis e depois voltaram; conta ainda mostrava pagamento pendente; segunda reserva não tentada | BLOCKED | DEVQA-005 |
| RES-04a | Público, busca durante Pix pendente | UI DEV | Retenção impede segunda venda | 0 opções no mesmo período | PASS | Pix R$ 212 pendente |
| RES-05 | Pacote/experiência | UI DEV + API DEV parcial | Pacote de 2 itens e avulso no checkout | Pacote de 2 itens R$ 60 e café avulso R$ 40 ativos somente no imóvel QA; pacote somado a R$ 212 e cobrado por R$ 272; café comprado depois por R$ 40; item individual do pacote não testado | BLOCKED | PMS/conta confirmaram os dois estornos; café Cancelado no portal; valor parcial do pacote não aparece no portal |
| RES-05a | Admin e checkout QA | UI DEV + API DEV | Cadastro e cotação do pacote próprio | Foto sintética enviada; 2 itens, entrega na chegada/saída, estoque 10; R$ 212 + R$ 60 = R$ 272 | PASS | QA 07–09/12, pagamento aprovado |
| RES-05b | Checkout, PMS e hóspede | UI DEV + API DEV | Pacote de dois itens cobrado e retirado sem cancelar hospedagem | Cartão 1× R$ 272 aprovado; crédito de R$ 60 confirmado no PMS e na conta; reserva ativa, líquido R$ 212 | PASS | Portal mostra cobrança “Pago” e webhook HTTP 200, sem discriminar o estorno parcial |
| PAY-01 | Pix | UI DEV + API DEV + PagBank DEV | Criado/pago/expirado/abandonado | Pix R$ 212 não pago: datas liberadas, provedor Cancelado, PMS NÃO CONFIRMADA e conta “Pix expirado”; Pix R$ 80 aprovado e estornado | PASS | DEVQA-005 registra apenas defasagem temporária antes da baixa |
| PAY-01a | Conta e checkout | UI DEV | Pix criado sem confirmação indevida | R$ 212 em espera; recebido R$ 0 na conta | PASS | Pagamento pendente, datas retidas temporariamente |
| PAY-01b | Conta, checkout, PMS e PagBank DEV | UI DEV + API DEV + provedor | Pix de até R$ 100 aprovado | R$ 80 confirmado na conta/PMS; cobrança Cancelado no portal após estorno | PASS | QA 23–24/11 |
| PAY-01c | Público, conta, PMS e PagBank DEV | UI DEV + API DEV + provedor | Liberar datas após expiração sem pagamento | Busca passou de 0 a 1 opção em 17–19/11; conta “Pix expirado”, provedor Cancelado, PMS NÃO CONFIRMADA | PASS | Conta ficou defasada até antes da notificação das 13h35; DEVQA-005 |
| PAY-02 | Cartão | UI DEV + API DEV + PagBank DEV parcial | Aprovado/recusado/erro | 1×/6×/12× aprovados no checkout/conta e depois Cancelado no provedor após estorno; recusa/erro não testados | BLOCKED | Variantes positivas PAY-02a, PAY-03b/c |
| PAY-02a | Checkout, conta, PMS e PagBank DEV | UI DEV + API DEV + provedor | Cartão 1× aprovado | Log de ordem 201, cobrança PAID de 21.200 centavos, reserva confirmada | PASS | QA 25–27/11 |
| PAY-03 | Parcelas | UI DEV + API DEV + PagBank DEV parcial | 1×/6×/8×/12×, juros e cobrança | 1×/6×/12× cobrados no checkout e conciliados no PMS, com transações finais conferidas no provedor; 8× na rodada anterior, não repetido hoje | BLOCKED | 6× total R$ 212; 12× total R$ 238,63, juros R$ 26,63 |
| PAY-03a | Cartão QA novo | UI DEV + API DEV | Condições gravadas no cadastro | 1×/6× sem juros e até 12× com juros disponíveis | PASS | `payment_terms` do novo imóvel funcionais |
| PAY-03b | Hóspede, checkout, PMS e PagBank DEV | UI DEV + API DEV + provedor | Cartão 6× sem juros cobrado | R$ 212 aprovados; conta mostrou 6×, PMS recebeu R$ 212 e provedor conferiu 6 parcelas/total R$ 212 | PASS | QA 30/11–02/12; status final Cancelado após estorno |
| PAY-03c | Hóspede, checkout, PMS e PagBank DEV | UI DEV + API DEV + provedor | Cartão 12× com juros cobrado | R$ 212 de hospedagem/limpeza + R$ 26,63 de juros; total R$ 238,63 recebido; provedor conferiu 12 parcelas/total | PASS | QA 02–04/12; status final Cancelado após estorno |
| PAY-04 | Repetição/rede | — | Idempotência | Não executado | NOT_RUN | — |
| PAY-05 | Webhooks | — | Assinatura/replay/ordem | Não executado | NOT_RUN | — |
| PAY-06 | Pós-reserva | UI DEV + API DEV parcial | Adicional/upgrade | Café avulso R$ 40 comprado após reserva de R$ 212 em cobrança separada; PMS/conta mostram R$ 252 recebidos, depois R$ 40 estornados | BLOCKED | Upgrade não testado; café Cancelado no portal; DEVQA-006 |
| PAY-06a | Hóspede e PMS | UI DEV + API DEV | Experiência posterior em cobrança própria | Cartão 1× R$ 40 aprovado, café incluído na reserva e total atualizado para R$ 252 | PASS | QA 09–11/12 |
| CAN-01 | Políticas por reserva | UI DEV parcial | Duas versões e aceite antigo | Versões vigentes exibidas; política global não alterada | BLOCKED | Exige instância isolada para publicar |
| CAN-02 | Pedido hóspede | UI DEV + API DEV parcial | Pedido/protocolo/repetição | Pedidos Pix R$ 80 e cartão 1×/6×/12× geraram protocolo; repetição não tentada | BLOCKED | Dados dos protocolos omitidos |
| CAN-02a | Hóspede | UI DEV | Pedido e protocolo | Formulário aceito; protocolo e pedido apareceram no PMS | PASS | Dados do protocolo omitidos do relatório |
| CAN-03 | Fronteiras de política | — | 24h/7d/20d e tarifas | Não executado | NOT_RUN | — |
| CAN-04 | Estorno Pix/cartão | UI DEV + API DEV + PagBank DEV parcial | Integral/parcial no PMS e provedor | Pix R$ 80 e cartões 1× R$ 212, 6× R$ 212 e 12× R$ 238,63 estornados e Cancelado no portal; parcial de pacote R$ 60 confirmado no PMS/conta, portal não detalha montante | BLOCKED | Também 1 integral cartão 8× comprovado em 05/11 |
| CAN-04a | PMS, hóspede e PagBank DEV | UI DEV + API DEV + provedor | Estorno integral Pix e reserva cancelada após conciliação | PMS: R$ 80 estornado, R$ 0 líquido; hóspede reembolsado; provedor Cancelado; datas liberadas | PASS | QA 23–24/11 |
| CAN-04b | PMS, hóspede e PagBank DEV | UI DEV + API DEV + provedor | Estorno integral cartão 1× | PMS: R$ 212 estornado, R$ 0 líquido; hóspede reembolsado; provedor Cancelado e webhook HTTP 200 | PASS | QA 25–27/11 |
| CAN-04c | PMS, hóspede, busca e PagBank DEV | UI DEV + API DEV + provedor | Estorno integral cartão 6× | PMS: R$ 212 estornado, R$ 0 líquido; hóspede reembolsado; datas disponíveis; provedor Cancelado e webhook HTTP 200 | PASS | QA 30/11–02/12 |
| CAN-04d | PMS, hóspede, busca e PagBank DEV | UI DEV + API DEV + provedor | Estorno integral cartão 12× inclusive juros | PMS: R$ 238,63 estornado, R$ 0 líquido; hóspede reembolsado; datas disponíveis; provedor Cancelado e webhook HTTP 200 | PASS | QA 02–04/12 |
| CAN-04e | PMS e hóspede | UI DEV + API DEV | Estorno parcial de pacote | R$ 60 devolvidos da cobrança de R$ 272; R$ 212 líquidos, reserva confirmada | PASS | QA 07–09/12; portal mostra cobrança original “Pago” e webhook HTTP 200, sem valor parcial exposto |
| CAN-04f | PMS, hóspede e PagBank DEV | UI DEV + API DEV + provedor | Estorno integral de cobrança posterior | R$ 40 devolvidos da cobrança própria; hospedagem R$ 212 permanece paga; portal mostra café “Cancelado” e webhook HTTP 200 | PASS | QA 09–11/12 |
| CAN-05 | Estorno repetido/excedente | — | Sem duplicidade | Não executado | NOT_RUN | — |
| CAN-06 | Serviços prestados/não prestados | UI DEV + API DEV parcial | Classificar/estornar só elegíveis | Pacote QA e café retirados antes da prestação; PMS calculou/conciliou créditos R$ 60 e R$ 40; retirada de componente isolado e serviço prestado não testados | BLOCKED | Reserva permaneceu ativa |
| CAN-07 | Análise/rejeição | — | Fluxo completo | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| CAU-01 | Pré-autorização | UI DEV parcial | Autorização/recusa/liberação | Garantia nominal R$ 500 exibida, sem autorização | BLOCKED | Check-in futuro e sem nova reserva |
| CAU-02 | Captura/saldo | — | Captura parcial/total | Não executado | NOT_RUN | — |
| CAU-03 | Vencimento/troca | — | Renovação/exceções | Não executado | NOT_RUN | — |
| SEC-01 | A/B, dados | — | Acesso cruzado negado | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| SEC-02 | Hóspede/anônimo, PMS | — | Ações negadas | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| SEC-03 | Alteração de cliente | — | Servidor rejeita adulteração | Não executado | NOT_RUN | — |
| SEC-04 | Segredos/webhook | — | Sigilo/replay | Não executado | NOT_RUN | — |
| SEC-05 | Entrada/redirect/upload | UI DEV parcial | Upload e redirecionamento seguros | PNG sintético enviado e salvo em dois produtos QA; validações de tipo/tamanho, conteúdo e redirecionamento não testadas | BLOCKED | Sem evidência de exposição |
| UX-01 | Viewports/teclado | UI DEV parcial | Mobile/desktop acessíveis | Vitrine e entrada da reserva verificadas em 320/390 px; CTA móvel funcionou, sem rolagem horizontal; checkout completo/teclado não percorridos | BLOCKED | UX-01a; viewport padrão restaurado |
| UX-01a | Público, vitrine e busca | UI DEV | Layout básico em 320/390 px | Larguras úteis 305/375 px, `scrollWidth` igual à largura útil; CTA abriu a reserva; campos com rótulos | PASS | Verificação visual Chromium; não prova toda a jornada móvel |
| UX-02 | PMS e checkout | UI DEV | Formulários, erros e recuperação | Cadastro ativo mostra erro de duplicidade sem duplicata; caminho em etapas funciona | FAIL | DEVQA-001 |
| UX-03 | Checkout | UI DEV | Valores e mensagens claros | Valores/parcelas claros; capacidade inválida gera erro genérico, uma noite usa “1 noites”, imóvel sem foto mostra imagem quebrada | FAIL | DEVQA-002/003/004 |
| UX-04 | Navegadores | — | Chromium/WebKit/desempenho | Só Chromium embutido, sem comparação | NOT_RUN | — |
| OPS-01 | Admin, imóvel/preços | UI DEV + API DEV | Cadastro ativo, tabela, taxas e calendário | Ativo direto falha; pausado→preço→taxas→ativo funciona | FAIL | DEVQA-001; CH1 sem base própria |
| OPS-01a | Admin, QA em etapas | UI DEV + API DEV | Imóvel isolado e apto para cotar | Ativo, R$ 80/100, limpeza R$ 20, garantia R$ 500, nenhum calendário conectado | PASS | Cotação 17–19/11 comprovada |
| OPS-02 | Admin, filas/financeiro | UI DEV + API DEV parcial | Trilha e papéis completos | Pedido do hóspede entrou na reserva; PMS calculou e conciliou estorno Pix | BLOCKED | Demais filas, papéis e trilha completa não executados |
| OPS-03 | Comunicações/anexos/custos | — | Ciclo completo | Não executado | NOT_RUN | — |
| OPS-04 | Perfil/Moments | — | Perfil/mídia/moderação | Não executado | NOT_RUN | — |
| FIN-01 | Conciliação final | UI DEV + API DEV + PagBank DEV parcial | Todas as operações em centavos | Pix R$ 80 e cartões 1×/6×/12×: recebido=estornado no PMS, líquido R$ 0, provedor Cancelado; pacote parcial R$ 60 e café R$ 40 conciliados no PMS/conta, cada hospedagem com R$ 212 líquidos | BLOCKED | DEVQA-005/006; portal não discrimina estorno parcial, caução e demais cenários pendentes |
| FIN-01a | PMS e hóspede | UI DEV + API DEV | Conciliar reserva Pix cancelada | R$ 80 pagos, R$ 80 estornados, R$ 0 líquido e R$ 0 pendente | PASS | QA 23–24/11 |
| FIN-01b | PMS e PagBank DEV | UI DEV + API DEV + provedor | Conciliar reserva cartão 1× cancelada | 21.200 centavos pagos, R$ 212 estornados, R$ 0 líquido e R$ 0 pendente | PASS | QA 25–27/11 |
| FIN-01c | PMS, hóspede e PagBank DEV | UI DEV + API DEV + provedor | Conciliar reserva cartão 6× cancelada | R$ 212 pagos/estornados, R$ 0 líquido e R$ 0 pendente; provedor Cancelado | PASS | QA 30/11–02/12; notificações HTTP 200 |
| FIN-01d | PMS, hóspede e PagBank DEV | UI DEV + API DEV + provedor | Conciliar reserva cartão 12× cancelada | R$ 238,63 pagos/estornados inclusive juros, R$ 0 líquido e R$ 0 pendente; provedor Cancelado | PASS | QA 02–04/12; notificações HTTP 200 |
| FIN-01e | PMS e hóspede | UI DEV + API DEV | Conciliar crédito de pacote sem cancelar estadia | R$ 272 recebidos, R$ 60 estornados, R$ 0 pendente, R$ 212 líquidos | PASS | QA 07–09/12; portal não discrimina valor do estorno parcial |
| FIN-01f | PMS, hóspede e PagBank DEV | UI DEV + API DEV + provedor | Conciliar café posterior sem afetar hospedagem | R$ 252 recebidos, R$ 40 estornados, R$ 0 pendente, R$ 212 líquidos; café “Cancelado” no portal | PASS | QA 09–11/12; DEVQA-006 |

## Comandos e limites

Nenhum teste local foi repetido porque o SHA de produto servido não mudou desde a rodada anterior. As parcelas 1×/6×/12× foram cobradas e conciliadas na UI/PMS; o portal PagBank DEV confirmou os totais/parcelas de 6×/12× e o status final Cancelado. A imagem sintética foi enviada somente aos dois produtos QA. Os sete aceites contratuais ocorreram com autorização do usuário. A pré-autorização da garantia de R$ 500 não ocorreu; a conta informa programação para perto do check-in. O portal confirmou status Cancelado nas quatro cobranças estornadas anteriormente, no café avulso de R$ 40 e no Pix não pago. Para o pacote, mostrou a cobrança original de R$ 272 como Pago e notificações HTTP 200, sem discriminar R$ 60 de estorno parcial. As notificações dos cartões 6×/12× também receberam HTTP 200.
