# Módulo financeiro — ponto de controle de desenvolvimento

Data: 29/09/2026. Branch: `refactor/reservation-finance`. Base: `b20abf5`.

**NÃO CONCLUÍDO. NÃO APROVADO PARA GO-LIVE.** Esta é uma matriz intermediária, não o aceite final solicitado.

## Implementação realizada

- Auditoria inicial e arquitetura em `architecture.md`.
- Histórico financeiro append-only com vínculo obrigatório à reserva, baseline explícita para legado e projeção de saldos. Bloqueio de reatribuição da transação a outra reserva.
- Gateway de pagamentos com criação PIX/cartão, autorização, captura, cancelamento, devolução e consulta. PagBank sandbox é a única implementação habilitada. Cotação, tokenização e alguns estados legados ainda dependem de detalhes PagBank.
- Estornos de caução com reserva de saldo, claim único, limite cumulativo, chave de idempotência, conciliação e tratamento de resultado incerto.
- Mesma conciliação de caução e estorno da reserva no webhook e na consulta administrativa. Assinatura obrigatória por padrão; repetição não confirma devolução sem evidência de valor.
- Ocorrência separada da decisão financeira; registro na reserva mesmo sem caução; captura resolve apenas a ocorrência aprovada.
- Garantia, ocorrências, estornos, juros, pagamentos e histórico dentro do detalhe da reserva. Caução de R$500 e valor capturado são apresentados separadamente.
- Oferta de parcelas persistida antes do cartão, vinculada a usuário, origem, valor e validade. O pagamento usa o total dessa oferta. Eliminado o cálculo provisório de parcelas no navegador.
- Configuração explícita de gateway, PIX/cartão ativos, duração do PIX, prazos adicionais e pagador dos juros por propriedade. Limites e parcelas gratuitas existentes são preservados pela migração.
- Bloqueio de execução das novas funções contra o projeto compartilhado e bloqueio de build de produção. `FINANCE_ENVIRONMENT=development` e projeto isolado são necessários.

## Evidência executada

`npm test`: **75 testes locais PASS, zero FAIL**. Saída completa: `local-tests.tap`.

`npm run check`, `npm run typecheck` e `git diff --check`: PASS.

O conjunto usa PostgreSQL via PGlite com fixture mínima do esquema legado, adaptador HTTP simulado e jsdom executando `admin.html`/`admin.js`. Não equivale à aplicação de todas as migrações históricas em Supabase nem a pagamento real no sandbox. O teste chamado concorrente usa a fila do PGlite; ainda requer ensaio com sessões PostgreSQL independentes.

Teste de saldo: reserva R$2.149, adicional R$180, crédito/estorno R$499, garantia R$500 e dano R$189. Confirma que autorização não entra como recebimento, adicional pendente vira saldo devido, pagamento liquida a diferença e crédito só vira devolução confirmada com o registro correspondente.

Teste de segurança: payload do histórico não inclui identidade, cartão, token ou segredo; roles de hóspede não executam comandos administrativos; limite de estorno e imutabilidade são impostos pelo banco.

## Matriz intermediária

PASS em uma coluna significa apenas o escopo local descrito acima verificado nessa camada. RESULTADO exige o ciclo inteiro solicitado. BLOCKED não encobre funcionalidade ausente: lacunas conhecidas aparecem como FAIL.

| FUNCIONALIDADE | FRONTEND | BACKEND | BANCO | GATEWAY | TESTE | RESULTADO |
|---|---|---|---|---|---|---|
| Ledger imutável e vínculo à reserva | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| Reconstrução de saldo, créditos e danos | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| Criação de PIX | BLOCKED | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| PIX pago, expiração e reconciliação | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Cartão aprovado/recusado | BLOCKED | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| Parcelamento antes do cartão e total fixo | BLOCKED | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Webhook duplicado / estorno conciliado | BLOCKED | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| Requisição de estorno duplicada | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Estorno total da reserva | BLOCKED | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| Estorno parcial e segundo estorno da reserva | BLOCKED | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| Estorno total/parcial/múltiplo da caução | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Limite cumulativo de estorno da caução | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Experiência adicionada depois do pagamento | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Remoção de experiência paga com crédito e estorno | FAIL | FAIL | FAIL | BLOCKED | FAIL | FAIL |
| Alteração de datas com diferença positiva | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Alteração com redução e crédito conforme política | FAIL | FAIL | FAIL | BLOCKED | FAIL | FAIL |
| Garantia autorizada e vinculada à reserva | PASS | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| Captura parcial R$189 da garantia R$500 | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Liberação comprovada dos R$311 restantes | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Ocorrência sem cobrança, com ou sem garantia | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| Decisão, evidências e cobrança por ocorrência | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Falha de captura / devolução incerta | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Cancelamento reembolsável/não reembolsável existente | BLOCKED | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| Política inicial de 24h e demais prazos consolidados | FAIL | FAIL | FAIL | PASS | FAIL | FAIL |
| Configuração de métodos, parcelas e juros | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Estados únicos em todas as telas e operações legadas | FAIL | FAIL | FAIL | BLOCKED | FAIL | FAIL |
| Jornada completa hóspede e administrativo | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| QA visual celular/notebook/desktop | BLOCKED | PASS | PASS | PASS | BLOCKED | BLOCKED |

Gateway PASS nas linhas puramente locais significa que nenhuma chamada ao gateway se aplica àquela operação. Não significa homologação do PagBank.

## Bloqueios comprovados

1. O conector lista somente `irxsaladqhbzhkoaclxy`, e `list_branches` retorna vazio. É o projeto usado no site público e nos previews. Nenhuma migração ou função nova foi aplicada ali. A regra do usuário proíbe alterações em produção.
2. O conector Supabase exige indicação da organização pelo usuário em `get_cost`, seguida de confirmação de custo em `confirm_cost`, antes de criar branch. Organização encontrada: `urxlygkpieieqcjfcwis`. A consulta de custo e a criação ainda não foram executadas.
3. `agent-browser` falhou ao abrir o daemon: `Failed to bind socket: Operation not permitted`. Chromium via Playwright também falhou em `process_singleton_posix.cc` com `socket() failed: Operation not permitted`. Nenhuma inspeção visual foi aprovada. Há fixture local e testes de navegador preparados para um executor compatível.
4. Nenhuma transação nova PagBank foi executada por esta refatoração. O log anterior com erro `40008` não comprova estorno. Falta validar captura parcial, restante liberado e os estornos no ambiente isolado com retorno autenticado do provedor.

## Pendências de implementação (não causadas pelo bloqueio do gateway)

- Remoção de experiência paga: decisão de crédito, política de serviço prestado/não prestado, vínculo ao item e estorno integral do ciclo.
- Redução de valor na alteração de datas: o legado usa `Math.max(0, diferença)` e retém o preço pago. Precisa do fluxo de crédito por política e preservação da reserva original até conclusão.
- Política inicial de 24h: o código existente usa direito de arrependimento configurado em dias (mínimo 7). Não foi substituído por 24h nem foram alterados contratos aceitos. É preciso representar a regra comercial separadamente e consolidar sua aplicação.
- Consolidar estados e configurações em todos os caminhos legados, expiração automática da caução e reconciliação periódica de todas as transações.
- Executar a suíte completa de 24 cenários em Supabase isolado, com duas sessões reais para concorrência, armazenamento de evidências, jobs, autenticação e PagBank.

## Retomada segura

1. Provisionar projeto/branch Supabase isolado, sem dados pessoais de produção.
2. Conferir baseline e migrações históricas antes das três novas migrações. A primeira bloqueia órfãos financeiros e decisões de captura legadas em andamento; não inventa associações nem aprovações.
3. Usar somente secrets sandbox no ambiente isolado; configurar `FINANCE_ENVIRONMENT=development` e apontar os três endpoints de `app-config.js` para esse projeto. O config compartilhado ainda está preservado e, por isso, o build desta branch está deliberadamente bloqueado.
4. Terminar as lacunas acima, executar `npm test`, `npm run typecheck`, `npm run check` e QA com navegador compatível.
5. Substituir esta matriz por resultados ponta a ponta com IDs sanitizados e evidências. Não marcar DONE por simples abertura da tela ou HTTP 200.
