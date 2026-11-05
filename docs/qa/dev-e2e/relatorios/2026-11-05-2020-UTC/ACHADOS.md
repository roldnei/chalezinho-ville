# Achados — 2026-11-05-2020-UTC

Resultados desta rodada; nenhum resultado histórico foi importado como prova atual. Não foram demonstradas vulnerabilidades remotas. Os IDs abaixo descrevem bloqueios de ambiente e regressões locais; não autorizam correções nesta rodada.

## DEVQA-2026-11-05-2020-UTC-001 — Pré-requisitos E2E indisponíveis

- Casos: ENV-01 e todos os 26 P0; prioridade P0, impacto alto na homologação. Estado: **BLOQUEADO**; não é falha confirmada do produto.
- Pré-condições: roteiro `741e3c8`, prévia indicada pelo solicitante, Chromium celular 390×844 e desktop 1366×768, 05/11/2026 a partir de 20:20 UTC. Sem contas remotas utilizáveis de A/B/admin ou caixa de teste.
- Esperado: identificar deployment, projeto DEV, sandbox e inventário antes de qualquer escrita na aplicação.
- Observado: HTTP 403 do proxy no CONNECT e `ERR_TUNNEL_CONNECTION_FAILED` no navegador. A aplicação não chegou a carregar. SHA servido, versões de funções/migrações, configuração efetiva do gateway e isolamento de inventário permanecem desconhecidos. Configuração estática aponta ao projeto DEV esperado, mas não comprova runtime.
- Evidência: E01–E03 em RELATORIO.md. Nenhum dado de cliente consultado, nenhum e-mail ou pagamento enviado.
- Diagnóstico: transporte/política de egress, confiança alta sobre o bloqueio observado. Não há evidência para atribuir o 403 a Vercel SSO ou à aplicação. Falta de bindings não prova inexistência de credenciais em outros ambientes; nesta sessão não foram fornecidos acessos utilizáveis.
- Desbloqueio/aceite: Work libera o host preservando proteções e disponibiliza acessos seguros e inventário sintético. Conferir runtime e repetir P0 via UI → API → banco → sandbox. Troca de política somente em instância isolada.
- Handoff: BLOQUEADO; sem PR/commit de correção, sem reteste remoto. Requisitos copiáveis entregues ao solicitante.

## DEVQA-2026-11-05-2020-UTC-002 — Regressão local de multicalendário incompatível com o layout atual

- Caso: OPS-01; P1, severidade média na cobertura automatizada, sem impacto remoto comprovado. Estado: **NOVO**.
- Pré-condições: mesma base local, jsdom, dados sintéticos, `tests/pms-review.test.mjs`.
- Reprodução segura: executar `node tests/pms-review.test.mjs`. Esperado pelo teste: dois elementos `.calendar-property`; observado: zero. A asserção falha antes de testar filtros/detalhes e renovação de sessão.
- Evidência: E05; suíte completa e execução direta falham; execução direta 0 PASS / 1 FAIL. Asserção na linha 8.
- Diagnóstico: a implementação atual usa grade de colunas e o teste espera estrutura anterior; suspeita de teste desatualizado, confiança média/alta. Não comprova calendário quebrado no navegador DEV.
- Aceite: reconciliar o contrato de UI esperado e validar filtros/detalhes em teste representativo e depois no inventário DEV sintético; não apenas remover a asserção.
- Handoff: NOVO; sem correção implementada, sem reteste após alteração.

## DEVQA-2026-11-05-2020-UTC-003 — Fixture de vitrine usa datas já passadas

- Caso: PUB-01; P1, severidade média para repetibilidade do teste. Estado: **NOVO**.
- Pré-condições: 05/11/2026, jsdom, `tests/stay-showcase.test.mjs`, datas sintéticas fixas de outubro/2026.
- Reprodução segura: executar `node tests/stay-showcase.test.mjs`. Esperado pelo teste da linha 56: duas colunas de períodos; observado: zero na asserção da linha 65. Resultado direto: 11 PASS / 1 FAIL.
- Evidência: E05, confirmado fora da suíte completa.
- Diagnóstico: `stay-showcase.js` filtra chegadas anteriores à data corrente em America/Sao_Paulo; as datas da fixture já passaram. Confiança alta sobre incompatibilidade temporal; isso não demonstra defeito na filtragem do produto.
- Aceite: usar relógio controlado/fixture coerente na futura tarefa de testes e comprovar separadamente exclusão de datas passadas e renderização das futuras. Nenhuma correção feita nesta rodada.
- Handoff: NOVO; sem PR de correção ou reteste posterior.

## DEVQA-2026-11-05-2020-UTC-004 — Fixture financeira não serve dependência da tela

- Casos: CAN-06, CAU-01/02 e UX-02, somente camada local; prioridade alta para desbloquear regressão financeira. Não há falha financeira remota demonstrada. Estado: **NOVO**.
- Pré-condições: `scripts/finance-preview.mjs`, Chromium, reserva sintética; suíte `finance-admin.spec.mjs`.
- Reprodução segura: executar a suíte local, abrir a reserva da fixture. Esperado: resumo financeiro, caução e retirada de experiência acessíveis. Observado: `contractMarkup` de dependência ausente interrompe a abertura; resumo não renderiza e o teste de crédito termina por timeout.
- Evidência: E07/E08; diagnóstico adicional com todos os hosts externos bloqueados reproduziu o erro, sem operação remota.
- Diagnóstico: `admin.html` carrega `stay-offers.js`, mas a allowlist do servidor local não o serve. `window.VilleOffers` não é inicializado. Confiança alta sobre a fixture; não extrapolar para o deployment.
- Aceite: em tarefa separada, prover dependências locais corretas e repetir asserções financeiras sem substituir o comportamento financeiro por aprovação artificial; depois executar o fluxo no DEV com sandbox confirmado.
- Handoff: NOVO; nenhuma mudança em produto ou harness nesta rodada.

## DEVQA-2026-11-05-2020-UTC-005 — Expectativa de espaçamento da conta diverge da tela

- Caso: UX-01; P1, severidade baixa provisória. Estado: **NOVO**.
- Pré-condições: Chromium com sessão e perfil simulados; `account-compact.spec.mjs`, laço começa em 320×844 mesmo nos projetos notebook/desktop.
- Reprodução segura: executar o teste `one personal header fits narrow phones...`. Esperado: distância da biografia ao cabeçalho ≤20px. Observado: 73px; asserção falha. A captura local revisada mostra o controle intermediário de conferências, a biografia e os botões de perfil; não mostra sobreposição no estado capturado.
- Evidência: E07 e contexto da falha local. A medição não prova sobreposição nem perda de função e não representa medição remota.
- Diagnóstico: possível expectativa antiga após inclusão do controle intermediário; confiança média. Requer revisão visual do requisito antes de classificar como defeito de layout do produto.
- Aceite: conferir 360/390/412px e desktop, mantendo acesso às conferências, perfil e foco; reconciliar expectativa de espaçamento e testar sem esconder controles.
- Handoff: NOVO; sem correção ou reteste remoto.

## DEVQA-2026-11-05-2020-UTC-006 — Gesto emulado não desloca faixa de miniaturas

- Caso: UX-01/OPS-04; P1, severidade média provisória. Estado: **NOVO**.
- Pré-condições: Chromium, viewport 320×740, toque emulado por CDP, oito mídias sintéticas/fixtures existentes.
- Reprodução segura: executar `narrow mobile keeps the dial inside the photo...` em `villegram-editing-dial.spec.mjs`. Esperado: `scrollLeft > 0` após o gesto. Observado: `scrollLeft = 0`, timeout de 5s; passos seguintes de filtro não foram executados nesse caso.
- Evidência: E07; falha no projeto mobile. Não houve upload/publicação remota.
- Diagnóstico: pode ser comportamento de gesto/CDP, layout ou produto; confiança baixa sobre causa. Não observado em aparelho físico nem no DEV remoto.
- Aceite: reproduzir com gesto emulado estável e aparelho autorizado; assegurar acesso às seis miniaturas, navegação por teclado e ausência de bloqueio da rolagem vertical.
- Handoff: NOVO; sem correção ou reteste após alteração.

## DEVQA-2026-11-05-2020-UTC-007 — Rolagem emulada do painel de leitura não comprovada

- Caso: UX-01/OPS-04; P1, severidade média provisória. Estado: **NOVO**.
- Pré-condições: Chromium, projetos notebook 1366×768 e desktop 1920×1080 com toque emulado, `villegram-swipes.spec.mjs`, conteúdo sintético extenso.
- Reprodução segura: executar `taps, horizontal drags, multitouch and reading panels never switch Trips`. Esperado: o painel de legenda rola sem trocar o Trip. Observado: a posição permanece no Trip esperado, mas `scrollTop` do painel continua zero e a asserção de rolagem expira.
- Evidência: E07, linha 61 do teste. Não houve leitura de publicação real nem escrita remota.
- Diagnóstico: falha reproduzida pela suíte; causa de gesto, alvo de rolagem ou produto ainda não isolada. Não extrapolar para dispositivo físico ou prévia.
- Aceite: conferir painel e elemento de rolagem em cada viewport, toque/teclado, preservando a posição do Trip durante leitura e permitindo a navegação posterior.
- Handoff: NOVO; nenhuma correção implementada nem reteste remoto realizado.


## Retomada após publicação do ambiente — 05/11/2026

Acesso de rede agora aplicado com permissão `*`. O bloqueio anterior de proxy foi resolvido. Nova tentativa real no Chromium, em 390×844 e 1366×768, terminou em `vercel.com/login`, título `Login – Vercel`. Não houve acesso à interface do produto nem escrita remota. Esta sessão não possui autenticação Vercel utilizável, bindings de credenciais DEV, contas A/B/admin, caixa de teste ou acesso de conferência ao banco/sandbox. Commit servido e inventário sintético continuam não confirmados. Os 41 cenários DEV, incluindo os 26 P0, permanecem BLOCKED; os resultados locais anteriores não foram repetidos nem promovidos a E2E. Esta atualização substitui o diagnóstico de transporte como bloqueio atual, preservando a evidência histórica.

Para retomar: disponibilizar sessão Vercel autorizada em navegador acessível ao executor, ou mecanismo seguro oficialmente suportado para automação, mantendo a proteção. Disponibilizar também contas sintéticas e acessos DEV/sandbox por canal seguro, sem valores no chat ou Git. Nenhum segredo, cookie, URL de autenticação ou log bruto foi incluído nesta atualização.
