# Cobertura — continuação DEV 06/11/2026

Esta matriz registra **somente a execução de 06/11**. Resultados financeiros e de permissões de 05/11 permanecem no [relatório anterior](../2026-11-05-2329-UTC/COBERTURA.md) e não são promovidos a PASS nesta rodada sem repetição. `BLOCKED` indica dependência concreta; `NOT_RUN` indica cenário não iniciado. As variações com sufixo separam a prova parcial do caso completo.

| Caso/variação | Papel e tela | Camada comprovada | Esperado | Observado | Estado | Evidência sanitizada / achado |
|---|---|---|---|---|---|---|
| ENV-01 | QA, Vercel/DEV | UI DEV + metadados Vercel | Prévia, SHA, perfil, projeto, sandbox e isolamento completos | Preview READY e SHA conferido; banner DEV/sandbox; imóvel QA sem calendários conectados, mas endpoint de exportação não inspecionado | BLOCKED | RELATORIO, ambiente |
| AUTH-01 | Hóspedes, cadastro/login | — | Cadastro, confirmação e login | Não repetido hoje | NOT_RUN | Ver rodada anterior |
| AUTH-02 | Hóspedes, sessão | — | Logout/expiração/recuperação | Não executado | NOT_RUN | — |
| AUTH-03 | Papéis, PMS | UI DEV parcial | Permissões de admin, anfitrião e equipe | Admin operou imóvel QA; outros papéis não testados hoje | BLOCKED | Faltam papéis sintéticos anfitrião/equipe |
| AUTH-04 | Navegação/auth | — | Retorno seguro | Não executado | NOT_RUN | — |
| PUB-01 | Público, reserva | UI DEV | Vitrine e CTAs completos | Página de reserva QA aberta por link; cartão sem foto mostra imagem quebrada; demais entradas não percorridas | BLOCKED | DEVQA-004 |
| RES-01 | Público, busca | UI DEV + API DEV | Disponibilidade, capacidade, mínimos e datas válidos | Sexta de 1 noite bloqueada por mínimo 2; segunda de 1 noite permitida; 3 hóspedes retornou erro genérico | FAIL | DEVQA-002 |
| RES-01a | Público, 1 e 2 noites | UI DEV + API DEV | Disponibilidade coerente | Imóvel QA oferecido em 17–18 e 17–19/11 | PASS | R$ 108 não reembolsável em 1 noite; R$ 196 em 2 |
| RES-01b | Público, 3 hóspedes | UI DEV | Capacidade 2 respeitada com mensagem útil | Nenhuma reserva oferecida, mas “Consulta indisponível” | FAIL | DEVQA-002 |
| RES-01c | Público, mínimo por dia | UI DEV + API DEV | Regras refletidas na busca | 20–21/11 mostra mínimo 2; 23–24/11 oferece 1 noite | PASS | Mesmo imóvel QA, sem canais |
| RES-02 | Público, duas tarifas | UI DEV + API DEV | Preços e composição, adicionais/descontos | R$ 212 reembolsável e R$ 196 não reembolsável; adicionais não disponíveis | BLOCKED | Tabela própria PMS R$ 80/100; limpeza R$ 20 |
| RES-02a | Público, escolha de tarifa | UI DEV | Nenhuma opção pré-selecionada | Duas opções com rádio vazio até escolha | PASS | 17–19/11 |
| RES-03 | Admin, checkout | UI DEV + API DEV parcial | Aceite/cotação/expiração e persistência | Dois aceites e reservas Pix persistidos; expiração de cotação não exercitada | BLOCKED | Pix R$ 212 pendente e Pix R$ 80 concluído |
| RES-04 | Público, concorrência | UI DEV parcial | Sem dupla reserva/cobrança | Datas do Pix pendente ficaram indisponíveis e depois voltaram; conta ainda mostrava pagamento pendente; segunda reserva não tentada | BLOCKED | DEVQA-005 |
| RES-04a | Público, busca durante Pix pendente | UI DEV | Retenção impede segunda venda | 0 opções no mesmo período | PASS | Pix R$ 212 pendente |
| RES-05 | Pacote/experiência | UI DEV parcial | Pacote de 2 itens e avulso no checkout | Formulário preenchido, upload obrigatório não concluído, nada salvo | BLOCKED | Ferramenta de arquivo nesta sessão |
| PAY-01 | Pix | UI DEV + API DEV parcial | Criado/pago/expirado/abandonado | Pix R$ 212 criado e pendente na conta após liberação das datas; Pix R$ 80 aprovado e estornado; estado final da cobrança pendente não comprovado | BLOCKED | DEVQA-005; simulador mantém R$ 200–300 em espera |
| PAY-01a | Conta e checkout | UI DEV | Pix criado sem confirmação indevida | R$ 212 em espera; recebido R$ 0 na conta | PASS | Pagamento pendente, datas retidas temporariamente |
| PAY-01b | Conta, checkout e PMS | UI DEV + API DEV | Pix de até R$ 100 aprovado | R$ 80 confirmado na conta, PMS e financeiro; R$ 80 recebidos | PASS | QA 23–24/11; provedor não consultado diretamente |
| PAY-01c | Público e hóspede | UI DEV + API DEV parcial | Liberar datas após expiração do bloqueio sem pagamento | Busca passou de 0 a 1 opção em 17–19/11; conta ainda exibia “aguardando pagamento” imediatamente após | PASS | Só a liberação do bloqueio; estado final do Pix segue aberto |
| PAY-02 | Cartão | UI DEV parcial | Aprovado/recusado/erro | Checkout 1× de R$ 212 preparado com cartão de teste; sem aceite e sem envio | BLOCKED | Confirmação específica de novo aceite pendente |
| PAY-03 | Parcelas | UI DEV + API DEV | 1×/6×/8×/12×, juros e cobrança | Opções 1–12 retornadas com BIN de teste; 1× confirmado no checkout por R$ 212 sem juros; nenhuma cobrada | BLOCKED | 6× total R$ 212; 12× total R$ 238,63 |
| PAY-03a | Cartão QA novo | UI DEV + API DEV | Condições gravadas no cadastro | 1×/6× sem juros e até 12× com juros disponíveis | PASS | `payment_terms` do novo imóvel funcionais |
| PAY-04 | Repetição/rede | — | Idempotência | Não executado | NOT_RUN | — |
| PAY-05 | Webhooks | — | Assinatura/replay/ordem | Não executado | NOT_RUN | — |
| PAY-06 | Pós-reserva | — | Adicional/upgrade | Não executado | BLOCKED | Sem pacote sintético salvo |
| CAN-01 | Políticas por reserva | UI DEV parcial | Duas versões e aceite antigo | Versões vigentes exibidas; política global não alterada | BLOCKED | Exige instância isolada para publicar |
| CAN-02 | Pedido hóspede | UI DEV + API DEV parcial | Pedido/protocolo/repetição | Pedido de cancelamento Pix R$ 80 gerou protocolo; repetição não tentada | BLOCKED | QA 23–24/11 |
| CAN-02a | Hóspede | UI DEV | Pedido e protocolo | Formulário aceito; protocolo e pedido apareceram no PMS | PASS | Dados do protocolo omitidos do relatório |
| CAN-03 | Fronteiras de política | — | 24h/7d/20d e tarifas | Não executado | NOT_RUN | — |
| CAN-04 | Estorno Pix/cartão | UI DEV + API DEV parcial | Integral/parcial no PMS e provedor | Pix R$ 80 estornado integralmente no PMS, conta confirma; parcial/provedor direto não verificados | BLOCKED | 1 integral cartão comprovado em 05/11 |
| CAN-04a | PMS e hóspede | UI DEV + API DEV | Estorno integral Pix e reserva cancelada após conciliação | PMS: R$ 80 estornado, R$ 0 líquido; hóspede: reembolsado; datas liberadas | PASS | Provedor não consultado diretamente |
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
| UX-01 | Viewports/teclado | — | Mobile/desktop acessíveis | Controle de viewport solicitado em 390 px, mas largura real continuou 1280 px; sem prova móvel | NOT_RUN | Limitação da ferramenta de navegador nesta sessão |
| UX-02 | PMS e checkout | UI DEV | Formulários, erros e recuperação | Cadastro ativo mostra erro de duplicidade sem duplicata; caminho em etapas funciona | FAIL | DEVQA-001 |
| UX-03 | Checkout | UI DEV | Valores e mensagens claros | Valores/parcelas claros; capacidade inválida gera erro genérico, uma noite usa “1 noites”, imóvel sem foto mostra imagem quebrada | FAIL | DEVQA-002/003/004 |
| UX-04 | Navegadores | — | Chromium/WebKit/desempenho | Só Chromium embutido, sem comparação | NOT_RUN | — |
| OPS-01 | Admin, imóvel/preços | UI DEV + API DEV | Cadastro ativo, tabela, taxas e calendário | Ativo direto falha; pausado→preço→taxas→ativo funciona | FAIL | DEVQA-001; CH1 sem base própria |
| OPS-01a | Admin, QA em etapas | UI DEV + API DEV | Imóvel isolado e apto para cotar | Ativo, R$ 80/100, limpeza R$ 20, garantia R$ 500, nenhum calendário conectado | PASS | Cotação 17–19/11 comprovada |
| OPS-02 | Admin, filas/financeiro | UI DEV + API DEV parcial | Trilha e papéis completos | Pedido do hóspede entrou na reserva; PMS calculou e conciliou estorno Pix | BLOCKED | Demais filas, papéis e trilha completa não executados |
| OPS-03 | Comunicações/anexos/custos | — | Ciclo completo | Não executado | NOT_RUN | — |
| OPS-04 | Perfil/Moments | — | Perfil/mídia/moderação | Não executado | NOT_RUN | — |
| FIN-01 | Conciliação final | UI DEV + API DEV parcial | Todas as operações em centavos | Pix R$ 80: recebido R$ 80, estornado R$ 80, líquido R$ 0; Pix R$ 212 ainda pendente na conta, datas liberadas | BLOCKED | DEVQA-005; sem consulta direta ao provedor e demais modalidades |
| FIN-01a | PMS e hóspede | UI DEV + API DEV | Conciliar reserva Pix cancelada | R$ 80 pagos, R$ 80 estornados, R$ 0 líquido e R$ 0 pendente | PASS | QA 23–24/11 |

## Comandos e limites

Nenhum teste local foi repetido porque o SHA de produto servido não mudou desde a rodada anterior. A consulta de parcelas na UI/API não comprova cobrança. A imagem sintética de pacote não foi enviada; o pacote não foi salvo. Os dois aceites contratuais ocorreram com autorização do usuário. A pré-autorização da garantia de R$ 500 não ocorreu; a conta informa programação para perto do check-in. A confirmação de estorno é da conciliação do PMS e da conta, sem consulta independente ao PagBank nesta rodada.
