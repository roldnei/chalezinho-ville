# Módulo financeiro — ponto de controle de desenvolvimento

Data: 29/09/2026. Branch: `refactor/reservation-finance`. Base original: `b20abf5`; continuação: `fa7e880`.

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

## Evidência histórica em fa7e880

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
| Remoção de experiência paga com crédito e estorno | PARTIAL | PARTIAL | PASS | BLOCKED | PASS | PARTIAL |
| Alteração de datas com diferença positiva | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Alteração com redução e crédito conforme política | FAIL | FAIL | FAIL | BLOCKED | FAIL | FAIL |
| Garantia autorizada e vinculada à reserva | PASS | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| Captura parcial R$189 da garantia R$500 | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Liberação comprovada dos R$311 restantes | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Ocorrência sem cobrança, com ou sem garantia | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| Decisão, evidências e cobrança por ocorrência | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Falha de captura / devolução incerta | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Cancelamento reembolsável/não reembolsável existente | BLOCKED | PASS | BLOCKED | BLOCKED | PASS | BLOCKED |
| Política comercial de 24h separada dos prazos aceitos | PASS | PASS | PASS | PASS | PASS | BLOCKED |
| Configuração de métodos, parcelas e juros | PASS | PASS | PASS | BLOCKED | PASS | BLOCKED |
| Estados únicos em todas as telas e operações legadas | FAIL | FAIL | FAIL | BLOCKED | FAIL | FAIL |
| Jornada completa hóspede e administrativo | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| QA visual celular/notebook/desktop | PARTIAL | PASS | PASS | PASS | PARTIAL | BLOCKED |

PARTIAL indica cobertura implementada restrita, com lacunas explícitas abaixo. A linha de experiência cobre retirada administrativa de item simples; não cobre upgrades, juros, solicitação do hóspede ou todo o legado.

Gateway PASS nas linhas puramente locais significa que nenhuma chamada ao gateway se aplica àquela operação. Não significa homologação do PagBank.

## Evidência nova — continuação de 29/09/2026

- **15 testes locais novos PASS:** 7 de banco/projeção, 3 da janela comercial, 3 do endpoint e 2 de UI jsdom. Não foi executada novamente a suíte completa de 75 testes.
- **4 testes antigos de política reexecutados por regressão necessária:** todos PASS, pois o cálculo compartilhado foi alterado.
- **9 verificações Playwright PASS:** detalhe financeiro/garantia já preparado, novo crédito de experiência e editor de política; cada fluxo em 390×844, 1366×768 e 1920×1080. São UI real com HTTP sintético local, sem Supabase/PagBank. A primeira execução do novo crédito encontrou seletor ambíguo no teste; o seletor foi corrigido e os três tamanhos passaram. Regressão dirigida após ajustes de apresentação também passou.
- `npm run typecheck`, `npm run check` e `git diff --check`: PASS.
- Inspeção visual de capturas: crédito no celular e política no notebook. Evidências dos seis estados em `qa/`. Corrigidos caixas de seleção e texto vazio de bloqueio.
- Caso de banco exercitado: reserva R$1.499 com experiência R$499; preparar não cria crédito aprovado; aprovar retira o item e gera saldo credor; resposta incompatível do provedor é recusada; conciliar R$499 zera esse saldo; repetir a confirmação não duplica devolução; reserva permanece confirmada. O provedor foi **simulado**, não acionado.
- Transação testada com falha na reserva de saldo: caso e vínculo ao item são desfeitos integralmente. Verificados idempotência, actor, permissão de execução, RLS, histórico imutável e bloqueio de upgrade.
- As duas novas migrações foram executadas apenas em PGlite com fixture de esquema. Não representam aplicação do histórico inteiro no Supabase nem ensaio com sessões PostgreSQL independentes.

## Bloqueios e limites atuais

1. O conector lista somente `irxsaladqhbzhkoaclxy`, e `list_branches` retorna vazio. É o projeto usado no site público e nos previews. Nenhuma migração ou função nova foi aplicada ali. A regra do usuário proíbe alterações em produção.
2. Não há autorização para infraestrutura paga. Nenhuma consulta de custo, criação de projeto/branch ou implantação foi realizada nesta continuação. Usar ambiente isolado já existente ou solução local gratuita; não provisionar recursos pagos.
3. O bloqueio anterior de navegador não ocorreu no executor desta continuação: Playwright executou os nove cenários locais acima. Isso libera QA local com fixture, mas não comprova a jornada conectada a Supabase e PagBank.
4. Nenhuma transação nova PagBank foi executada por esta refatoração. O log anterior com erro `40008` não comprova estorno. Falta validar captura parcial, restante liberado e os estornos no ambiente isolado com retorno autenticado do provedor.

## Pendências de implementação (não causadas pelo bloqueio do gateway)

- Experiências: fluxo administrativo de item simples implementado e testado localmente; ainda faltam upgrades com cadeia de pagamentos, juros, pagamentos já parcialmente devolvidos, legado sem vínculo, cancelamento do rascunho e solicitação de retirada pelo hóspede. Homologar o ciclo real do item simples no sandbox.
- Redução de valor na alteração de datas: o legado usa `Math.max(0, diferença)` e retém o preço pago. Precisa do fluxo de crédito por política e preservação da reserva original até conclusão.
- Política comercial de 24h implementada separadamente e versionada. Contratos anteriores e prazo adicional em dias preservados. Falta validar cotação → aceite → cancelamento no ambiente isolado; não presumir que após 24h cessam prazos mais favoráveis existentes.
- Consolidar estados e configurações em todos os caminhos legados, expiração automática da caução e reconciliação periódica de todas as transações.
- Executar a suíte completa de 24 cenários em Supabase isolado, com duas sessões reais para concorrência, armazenamento de evidências, jobs, autenticação e PagBank.

## Retomada segura

1. Usar projeto/branch Supabase isolado já disponível ou ambiente local gratuito, sem dados pessoais de produção. Não criar infraestrutura paga.
2. Conferir baseline e migrações históricas antes das cinco migrações desta refatoração. A primeira bloqueia órfãos financeiros e decisões de captura legadas em andamento; não inventa associações nem aprovações.
3. Usar somente secrets sandbox no ambiente isolado; configurar `FINANCE_ENVIRONMENT=development` e apontar os três endpoints de `app-config.js` para esse projeto. O config compartilhado ainda está preservado e, por isso, o build desta branch está deliberadamente bloqueado.
4. Terminar as lacunas acima. Executar somente testes novos ou regressões afetadas; não repetir os 75 testes históricos indiscriminadamente. Playwright local está disponível. A suíte integral fica para a homologação integrada quando os pré-requisitos existirem.
5. Substituir esta matriz por resultados ponta a ponta com IDs sanitizados e evidências. Não marcar DONE por simples abertura da tela ou HTTP 200.
