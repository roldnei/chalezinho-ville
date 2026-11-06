# Cobertura — continuação DEV 06/11/2026

Esta matriz registra **somente a execução de 06/11**. Resultados financeiros e de permissões de 05/11 permanecem no [relatório anterior](../2026-11-05-2329-UTC/COBERTURA.md) e não são promovidos a PASS nesta rodada sem repetição. `BLOCKED` indica dependência concreta; `NOT_RUN` indica cenário não iniciado. As variações com sufixo separam a prova parcial do caso completo.

| Caso/variação | Papel e tela | Camada comprovada | Esperado | Observado | Estado | Evidência sanitizada / achado |
|---|---|---|---|---|---|---|
| ENV-01 | QA, Vercel/DEV | UI DEV + metadados Vercel | Prévia, SHA, perfil, projeto, sandbox e isolamento completos | Preview READY e SHA conferido; banner DEV/sandbox; imóvel QA sem calendários conectados, mas endpoint de exportação não inspecionado | BLOCKED | RELATORIO, ambiente |
| AUTH-01 | Hóspedes, cadastro/login | — | Cadastro, confirmação e login | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| AUTH-02 | Hóspedes, sessão | — | Logout/expiração/recuperação | Não executado | NOT_RUN | — |
| AUTH-03 | Papéis, PMS | UI DEV parcial | Permissões de admin, anfitrião e equipe | Admin operou imóvel QA; outros papéis não testados hoje | BLOCKED | Faltam papéis sintéticos anfitrião/equipe |
| AUTH-04 | Navegação/auth | — | Retorno seguro | Não executado | NOT_RUN | — |
| PUB-01 | Público, reserva | UI DEV | Vitrine e CTAs completos | Página de reserva QA aberta por link; demais entradas não percorridas | BLOCKED | Cotação QA |
| RES-01 | Público, busca | UI DEV + API DEV | Disponibilidade, capacidade, mínimos e datas válidos | 2 hóspedes/2 noites e 1 noite cotaram; 3 hóspedes retornou erro genérico; demais limites não cobertos | FAIL | DEVQA-002 |
| RES-01a | Público, 1 e 2 noites | UI DEV + API DEV | Disponibilidade coerente | Imóvel QA oferecido em 17–18 e 17–19/11 | PASS | R$ 108 não reembolsável em 1 noite; R$ 196 em 2 |
| RES-01b | Público, 3 hóspedes | UI DEV | Capacidade 2 respeitada com mensagem útil | Nenhuma reserva oferecida, mas “Consulta indisponível” | FAIL | DEVQA-002 |
| RES-02 | Público, duas tarifas | UI DEV + API DEV | Preços e composição, adicionais/descontos | R$ 212 reembolsável e R$ 196 não reembolsável; adicionais não disponíveis | BLOCKED | Tabela própria PMS R$ 80/100; limpeza R$ 20 |
| RES-02a | Público, escolha de tarifa | UI DEV | Nenhuma opção pré-selecionada | Duas opções com rádio vazio até escolha | PASS | 17–19/11 |
| RES-03 | Admin, checkout | UI DEV | Aceite/cotação/expiração e persistência | Políticas/valores exibidos; nenhum aceite ou reserva nova | BLOCKED | Confirmação de novo aceite pendente |
| RES-04 | A/B, concorrência | — | Sem dupla reserva/cobrança | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| RES-05 | Pacote/experiência | UI DEV parcial | Pacote de 2 itens e avulso no checkout | Formulário preenchido, upload obrigatório não concluído, nada salvo | BLOCKED | Ferramenta de arquivo nesta sessão |
| PAY-01 | Pix | UI DEV parcial | Criado/pago/expirado/abandonado | Pix R$ 212 ofertado; sem reserva/pagamento novo | BLOCKED | Aceite contratual pendente |
| PAY-02 | Cartão | UI DEV parcial | Aprovado/recusado/erro | Somente opções consultadas, sem envio | BLOCKED | Aceite contratual pendente |
| PAY-03 | Parcelas | UI DEV + API DEV | 1×/6×/8×/12×, juros e cobrança | Opções 1–12 reais retornadas com BIN de teste; nenhuma cobrada | BLOCKED | 6× total R$ 212; 12× total R$ 238,63 |
| PAY-03a | Cartão QA novo | UI DEV + API DEV | Condições gravadas no cadastro | 1×/6× sem juros e até 12× com juros disponíveis | PASS | `payment_terms` do novo imóvel funcionais |
| PAY-04 | Repetição/rede | — | Idempotência | Não executado | NOT_RUN | — |
| PAY-05 | Webhooks | — | Assinatura/replay/ordem | Não executado | NOT_RUN | — |
| PAY-06 | Pós-reserva | — | Adicional/upgrade | Não executado | BLOCKED | Sem pacote sintético salvo |
| CAN-01 | Políticas por reserva | UI DEV parcial | Duas versões e aceite antigo | Versões vigentes exibidas; política global não alterada | BLOCKED | Exige instância isolada para publicar |
| CAN-02 | Pedido hóspede | — | Pedido/protocolo/repetição | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| CAN-03 | Fronteiras de política | — | 24h/7d/20d e tarifas | Não executado | NOT_RUN | — |
| CAN-04 | Estorno Pix/cartão | — | Integral/parcial no PMS e provedor | Nenhum estorno novo | NOT_RUN | 1 integral cartão comprovado em 05/11 |
| CAN-05 | Estorno repetido/excedente | — | Sem duplicidade | Não executado | NOT_RUN | — |
| CAN-06 | Serviços prestados/não prestados | — | Classificar/estornar só elegíveis | Não executado | BLOCKED | Sem pacote sintético salvo |
| CAN-07 | Análise/rejeição | — | Fluxo completo | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| CAU-01 | Pré-autorização | UI DEV parcial | Autorização/recusa/liberação | Garantia nominal R$ 500 exibida, sem autorização | BLOCKED | Check-in futuro e sem nova reserva |
| CAU-02 | Captura/saldo | — | Captura parcial/total | Não executado | NOT_RUN | — |
| CAU-03 | Vencimento/troca | — | Renovação/exceções | Não executado | NOT_RUN | — |
| SEC-01 | A/B, dados | — | Acesso cruzado negado | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| SEC-02 | Hóspede/anônimo, PMS | — | Ações negadas | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| SEC-03 | Alteração de cliente | — | Servidor rejeita adulteração | Não executado | NOT_RUN | — |
| SEC-04 | Segredos/webhook | — | Sigilo/replay | Não executado | NOT_RUN | — |
| SEC-05 | Entrada/redirect/upload | UI DEV parcial | Upload e redirecionamento seguros | Upload de fixture não concluído pela ferramenta; nenhuma exposição comprovada | BLOCKED | Não classificar como defeito do produto |
| UX-01 | Viewports/teclado | — | Mobile/desktop acessíveis | Não executado formalmente | NOT_RUN | — |
| UX-02 | PMS e checkout | UI DEV | Formulários, erros e recuperação | Cadastro ativo mostra erro de duplicidade sem duplicata; caminho em etapas funciona | FAIL | DEVQA-001 |
| UX-03 | Checkout | UI DEV | Valores e mensagens claros | Valores/parcelas claros; capacidade inválida gera erro genérico | FAIL | DEVQA-002 |
| UX-04 | Navegadores | — | Chromium/WebKit/desempenho | Só Chromium embutido, sem comparação | NOT_RUN | — |
| OPS-01 | Admin, imóvel/preços | UI DEV + API DEV | Cadastro ativo, tabela, taxas e calendário | Ativo direto falha; pausado→preço→taxas→ativo funciona | FAIL | DEVQA-001; CH1 sem base própria |
| OPS-01a | Admin, QA em etapas | UI DEV + API DEV | Imóvel isolado e apto para cotar | Ativo, R$ 80/100, limpeza R$ 20, garantia R$ 500, nenhum calendário conectado | PASS | Cotação 17–19/11 comprovada |
| OPS-02 | Admin, filas/financeiro | — | Trilha e papéis completos | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| OPS-03 | Comunicações/anexos/custos | — | Ciclo completo | Não executado | NOT_RUN | — |
| OPS-04 | Perfil/Moments | — | Perfil/mídia/moderação | Não executado | NOT_RUN | — |
| FIN-01 | Conciliação final | — | Todas as operações em centavos | Nenhuma nova transação; a de 05/11 segue no relatório anterior | NOT_RUN | Sem novo estorno ou cobrança |

## Comandos e limites

Nenhum teste local foi repetido porque o SHA de produto servido não mudou desde a rodada anterior. A consulta de parcelas na UI/API não comprova cobrança. A imagem sintética de pacote não foi enviada; o pacote não foi salvo. Não se executou novo aceite contratual enquanto aguardava a confirmação solicitada para este checkout.
