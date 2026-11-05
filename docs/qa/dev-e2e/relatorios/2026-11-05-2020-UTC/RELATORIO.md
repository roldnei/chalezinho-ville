# Relatório DEV — 2026-11-05-2020-UTC

**Veredito: BLOQUEADO. Nenhum P0 homologado ponta a ponta.**

- Início: 05/11/2026 20:20 UTC (17:20 em America/Sao_Paulo). Última atualização: 2026-11-05T20:30:35+00:00.
- Branch de relatório: `qa/dev-e2e-report-2026-11-05-2020-UTC`.
- Roteiro: `qa/dev-e2e-handoff-20261105`, SHA `741e3c8a9b0d4edb0527b69828341b579b4e4c26`, `docs/qa/dev-e2e/`.
- Base de produto esperada: `3dc9e9c66af1dcde98cf9fa492081828c04399d0`. O diff até o roteiro contém apenas quatro documentos QA.
- Prévia indicada: https://chalezinho-ville-jg7qzrugb-roldneicosta-4140.vercel.app . **Commit servido não confirmado**: transporte bloqueado antes da resposta da aplicação. Não confundir SHA do checkout com deployment.
- Configuração estática inspecionada: perfil `checkout-development`, ambiente `development`, Supabase DEV `pxfqmnhqodqyaaqeyjgr` em `app-config.js` e `release-policy.ts`. Isso não confirma configuração/versões remotas.
- API, migrações, versão das funções e PagBank sandbox ativos: **não confirmados**. Documentação histórica consultada; resultados anteriores não contados nesta rodada.
- Inventário sintético e isolamento de canais: **não confirmados**. Nenhuma reserva ou consulta de calendário externo realizada.
- Contas A/B/admin/anfitrião/equipe e caixa de teste: não disponíveis como bindings/acessos utilizáveis nesta sessão. Nenhuma conta real ou sintética remota consultada/criada.
- Runtime: Node 24.22.1, npm 11.9.0, Chromium 155.0.8059.79 headless Linux. Prévia tentada em 390×844 e 1366×768; ambas falharam antes da UI. Suíte local usa também 1920×1080 e variações estreitas.

## Evidências e comandos

| Ref. | Execução e resultado sanitizado |
|---|---|
| E01 | 20:20 UTC: HEAD HTTPS na prévia recebeu HTTP 403 do proxy no CONNECT; não é um HTTP 403 da aplicação. Chromium em celular/desktop: `ERR_TUNNEL_CONNECTION_FAILED`. Navegação limitada a GET no host indicado, demais destinos bloqueados. |
| E02 | Git remoto leu a branch de roteiro no SHA acima. Checkout limpo antes da troca; branch de relatório criada diretamente desse SHA. |
| E03 | Status do ambiente: política restrita aplicada, sem bindings de secrets/variáveis de aplicação. Nomes das variáveis locais inspecionados sem valores. Configuração estática DEV conferida; faltam evidências operacionais de banco, sandbox, inventário, contas e caixa de teste. |
| E04 | `npm run check` e `npm run typecheck`: exit 0. |
| E05 | `npm test`: exit 1; runner contabiliza 141 arquivos (139 PASS, 2 FAIL), não 141 jornadas nem o número de asserções internas. Reexecuções diretas: PMS 0/1 PASS; vitrine 11/12 PASS. |
| E06 | `node tests/finance-cancellation-policy-integrity.test.mjs`: 5 testes PASS, 0 FAIL, 0 skip. Execução direta confirma os cinco casos internos, além do resultado agregado por arquivo do runner. |
| E07 | `VILLE_TEST_BROWSER=/usr/bin/chromium npm run test:browser`: exit 1; 105 casos, 84 PASS, 12 FAIL e 9 skips no runner. Classificação das linhas locais: PASS: 84; FAIL: 12; BLOCKED: 3; N/A: 6. Os casos estão discriminados em COBERTURA.md; skips do runner são separados entre ausência de fixture (BLOCKED) e viewport não aplicável (N/A). |
| E08 | Diagnóstico isolado de UI financeira com hosts externos bloqueados: clique na reserva da fixture gera erro de dependência `contractMarkup`; resumo financeiro não renderiza. O servidor de fixture não serve `stay-offers.js`, carregado por `admin.html`. |

Instalação: `npm ci` falhou no download da CLI Supabase por resolução DNS. `npm ci --ignore-scripts --cache /tmp/chalezinho-npm-cache --no-audit --no-fund` instalou 116 pacotes com integridade do lockfile preservada. CLI Supabase não preparada; nenhuma migração/deploy executado. A primeira tentativa do navegador foi bloqueada por EPERM ao abrir loopback; a execução posterior com a permissão necessária iniciou a suíte. Nenhuma dessas tentativas iniciais foi contada como aprovação.

## Resultado e limites

- Matriz principal DEV: **41 BLOCKED; 0 PASS, 0 FAIL, 0 NOT_RUN, 0 N/A**. Todos os 26 P0 estão bloqueados: ENV-01, AUTH-01, AUTH-02, AUTH-03, RES-01, RES-02, RES-03, RES-04, PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, CAN-01, CAN-02, CAN-03, CAN-04, CAN-05, CAN-06, CAU-01, CAU-02, SEC-01, SEC-02, SEC-03, SEC-04, FIN-01.
- Variações críticas constam separadamente em COBERTURA.md e não aumentam o denominador de 41 cenários principais.
- Regressões locais de política/cancelamento passaram; não houve troca de política no DEV compartilhado, aceite remoto ou conferência de reserva antiga no banco.
- Falhas de suíte e fixture constam em ACHADOS.md; não são apresentadas como falhas reproduzidas na prévia. Não se confirma defeito de segurança ou financeiro remoto nesta rodada.
- A/B, administrador, API DEV, banco e sandbox não puderam ser exercitados de ponta a ponta. Emissões de e-mail, Pix, cartão, parcelas, estornos, caução e conciliação remota permanecem sem evidência.
- WebKit/Safari e aparelhos físicos não executados. A suíte Chromium não substitui auditoria completa de acessibilidade nem inventário manual de todos os botões.

## Limpeza, publicação e retomada

Nenhum dado remoto foi criado: nada a remover no DEV/sandbox e nenhuma operação financeira incerta a repetir. Fixtures são locais. Capturas geradas pela suíte em caminhos já rastreados foram restauradas ao conteúdo da base antes do commit; logs/traces/capturas brutos não serão publicados. Somente RELATORIO.md, COBERTURA.md e ACHADOS.md desta pasta entram no commit. Não houve correção, merge, deploy ou publicação do produto.

Para retomar: liberar o host da prévia no proxy preservando as proteções; confirmar deployment/funções, projeto DEV e gateway; disponibilizar por canal seguro contas A/B/admin e papéis complementares, caixa de teste, inventário sintético isolado e acesso de conferência banco/sandbox. Usar instância isolada para versionar política. Executar primeiro os 26 P0 com dados novos; conciliar antes de repetir qualquer operação financeira incerta. A lista copiável de requisitos foi entregue ao solicitante para encaminhar ao Work.

Confirmação de escopo: apenas código local e tentativa de acesso à prévia DEV autorizada; nenhuma escrita em aplicação remota, contato real, dado de hóspede, cobrança real ou calendário externo.
