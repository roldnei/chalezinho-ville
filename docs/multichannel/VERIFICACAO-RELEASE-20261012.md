# Verificação de publicação multicanal — 12/10/2026

## Resultado

**Produção não publicada.** A sessão administrativa foi validada e os uploads/aprovações foram exercitados no navegador DEV. O complemento abaixo atualiza as linhas anteriormente bloqueadas por login. Funcionário, isolamento e retentativa após rejeição real do upload aprovados em 13/10. Permanece pendente comprovar recuperação do banco PROD e executar o preflight de publicação. Booking-engine DEV atualizado e verificado na v75.

Produção preservada: https://chalezinhoville.com.br, commit `4b54aee214493337b27edcc780bc1de155c632f3`, deployment `dpl_CSqwT4w5eHtc5gCQ3jyg6U2VmPDu`. Fonte de comparação do código: remoto `feature/multichannel-operations-20261012`, HEAD inicial `118fe7e713f5803559a530e8adeb70a5e493bd60`, conferido antes das alterações e antes do envio.

## Correções executadas

- Geração passa a comparar instantes de entrada/saída configurados (15h/11h nos imóveis existentes), e não apenas datas. Não gera preparação depois da entrada nem conferência nova depois do horário de saída. Não preenche presença/checkout pela passagem do tempo.
- Conferência legítima já criada permanece após checkout. Etapas arquivadas não renascem com edição de metadados ou datas; revisões normais continuam versionadas.
- Saída informada pelo proprietário tem campo de data e referência próprios, sem inventar horário efetivo. Amore 09–12/10 reconciliado somente em DEV. Suas duas tarefas foram criadas às 13h43 de 12/10, após saída prevista, estavam pendentes e sem fotos/resultados; arquivadas com motivo, sem exclusão.
- Fixtures explícitas não impedem a conciliação de hospedagens reais nem o inventário operacional. Isso destravou Essenza 09–13/10, antes barrado por sobreposição com teste. Apenas sua conferência de saída foi criada.
- Indicadores distinguem estadia prevista, presença registrada dentro da janela e saída prevista vencida a conferir. Preparação inexistente deixa de ser exibida como pendência criada.
- Filtros de fixtures acrescentados às consultas de hospedagens operacionais na busca e exportação iCal. Ajustes publicados e verificados no booking-engine DEV v75; não foram aplicados a PROD.

## Banco DEV antes/depois

| Métrica | Antes | Depois |
|---|---:|---:|
| Hospedagens reais no ledger | 3 | 4 |
| Hospedagens explicitamente de teste | 22 | 22 |
| Tarefas reais pendentes | 6 | 5 |
| Tarefas reais arquivadas nesta revisão | 0 | 2 |
| Tarefas de teste arquivadas | 46 | 46 |
| Preparações reais pendentes | 3 | 2 |
| Conferências reais pendentes | 3 | 3 |

As cinco tarefas finais são duas por chegada futura (Amore 23–25/10 e Essenza 24–26/10), e uma conferência para Essenza 09–13/10. Não houve criação de reserva, cobrança ou pagamento. Hashes antes/depois idênticos para reservas `b12c7fcfcbddca2ef4adfe6a799cdb76`, fotos `998e87ccd66aa598bced286a70581e67` e resultados `4180facca63478b11a634f57362cf7c7`. Evidência detalhada: `outputs/release-20261012/database-evidence.json`.

PROD consultado: 45 contatos, zero reservas nativas, ledger multicanal ausente. Nenhum dado DEV foi copiado para PROD. Nenhuma limpeza PROD executada.

## Fontes reais

Seis fontes ativas nos dois projetos. Comparação por hash dos URLs confirmou os mesmos endereços, sem expor os links privados. Últimas leituras sem erro.

| Canal/imóvel | Eventos atuais | Interpretação observada |
|---|---:|---|
| Airbnb CH1 | 2 | Indisponibilidades; evento antigo 09–11/10 ausente, sinalizado para revisão, sem cancelamento automático |
| Airbnb CH2 | 3 | Reserved 09–13/10, Reserved 24–26/10 e indisponibilidade |
| Airbnb CH3 | 4 | Reserved 09–12/10, Reserved 23–25/10 e duas indisponibilidades |
| Booking CH1 | 5 | Todos CLOSED - Not available; não comprovam reservas |
| Booking CH2 | 0 | Feed válido sem eventos |
| Booking CH3 | 0 | Feed válido sem eventos |

Booking tem fontes reais acessíveis, mas não foi possível homologar uma reserva futura identificável pelo conteúdo atual. Cadastro manual e vinculação foram exercitados em transação DEV com rollback, não como reserva real inventada. Nenhum nome/telefone/preço foi inferido dos bloqueios.

## Matriz de verificação

| Jornada/verificação | Resultado | Evidência/limite |
|---|---|---|
| Elegibilidade por horário, histórico sem baixa, checkout informado | Aprovada em SQL | Testes PGlite e migrações DEV; não prova de interface |
| Preservar saída legítima e não ressuscitar arquivadas | Aprovada em SQL | Regressões de checkout, metadados e mudança de datas |
| Fontes Airbnb e reconciliação real | Aprovada no backend DEV | Quatro estadias reais, cinco tarefas, sincronização repetida |
| Reserva futura Booking real | Bloqueada pela fonte | Só indisponibilidades no feed atual |
| Próprias/diretas, bloqueio, ambiguidade, alteração/cancelamento/falha | Aprovada em transação DEV | RPC real, fixtures com rollback, sem efeitos financeiros |
| Lease concorrente/idempotência | Aprovada no banco | Segunda reivindicação rejeitada; não teste de carga distribuída |
| Troca no mesmo dia | Aprovada em teste local | Prioridade e janela insuficiente; ainda sem jornada visual |
| Funcionário autorizado e fora do imóvel | Aprovada no navegador/API DEV | Login próprio, tarefa atribuída CH1, CH2 recusado HTTP 404 |
| Hub/tarefa sem autenticação | Aprovada por HTTP | 403 operator_required |
| Rotina sem segredo | Aprovada por HTTP | 403 forbidden |
| Fotos: upload móvel, retentativa, recarga, download permitido/negado | Aprovada no navegador/API DEV | Upload móvel anterior; falha de autorização, fila após reload e reenvio real em 13/10; não teste de desconexão física |
| Checklist, aprovação, comparação das duas etapas na UI | Aprovada | Preparação/saída admin anteriores; preparação com executor funcionário e aprovação por outra sessão em 13/10 |
| Central/PMS móvel/desktop | Aprovada nos cenários descritos | Capturas autenticadas 360×800 e 1440×900; funcionário 1280×720 |
| Público: home → datas → estadia → resumo WhatsApp | Observada no navegador | Prévia 118fe7e7, 1440×900 e 360×800; sem pagamento, sem mensagem enviada |
| Android físico | Não testado | Viewport emulado não é aparelho físico |
| Produção e verificação pós-publicação | Bloqueada | Critérios essenciais ainda não atendidos |

## Testes e capturas

Suíte completa: consultar contagem e duração em `outputs/release-20261012/tests-final-clean-env.txt`. Uma execução com VILLE_RELEASE_PROFILE=whatsapp herdado do build teve 531/532: o teste do proxy pressupõe perfil não definido. O teste isolado passou em ambiente limpo; a suíte foi repetida sem herdar a variável. O log da execução com falha foi preservado em tests-final.txt. Testes locais são complementares, não substituem navegador. Tipagem de multichannel-operations e sintaxe do workspace passaram. Build WhatsApp DEV passou.

`tests/dev/multichannel-smoke.sql` executado no projeto DEV com BEGIN/ROLLBACK: PASS para ciclo RPC, classificação, atribuição, autorização, idempotência, alteração, cancelamento, histórico e ausência de efeitos financeiros. Não fabrica metadados de upload.

Capturas reais (mesma URL de consulta: https://chalezinho-ville-32jaip0l0-roldneicosta-4140.vercel.app/reservar.html?check_in=2026-10-19&check_out=2026-10-21&guests=2&purpose=&from=dates&mode=stay):
- `outputs/release-20261012/consulta-desktop.jpg` — 1440×900, revisão da estadia.
- `outputs/release-20261012/consulta-mobile.jpg` — 360×800, resumo sem cortes laterais.
- `outputs/release-20261012/whatsapp-mobile.jpg` — 360×800, ações alcançáveis por rolagem, resumo e link WhatsApp.
Não foi clicado Enviar no WhatsApp nem feita cobrança. Capturas públicas não validam a interface operacional nova.

## Migrações e rotina

Aplicadas apenas DEV: `multichannel_task_time_eligibility`, `multichannel_fixture_inventory`, `multichannel_archival_persistence`. Arquivos locais correspondentes terminam em 010000, 011000 e 012000 de 13/10 (UTC). Edge `multichannel-operations` DEV v3 ACTIVE, autenticação interna mantida.

Job DEV `multichannel-operational-sync`, a cada 10 minutos. Disparo manual pg_net 27892 confirmou HTTP 200 e sucesso individual nas seis fontes. Execução agendada 13/10 00:40 UTC (=12/10 21:40 São Paulo) também teve seis resultados success e uma tentativa cada. Nenhuma alteração de relógio ou agendamento.

Roteiro PROD atualizado com as nove migrações e bloqueio de instalação se surgirem reservas nativas confirmadas antes da publicação: o backfill antigo precisa ser postergado nesse caso. Mantém cron inativo até verificação. Não foi executado em PROD.

## Pendências concretas para publicar

1. Funcionário e retentativa concluídos em 13/10, conforme complemento abaixo. Desconexão física de rede não exercitada; foi usada rejeição real de autorização do upload.
2. Booking-engine DEV v75 publicado e verificado. Para PROD, preservar o wrapper PMS existente, sem substituição cega pela função completa DEV.
3. Painel PROD Backups inspecionado: “Free Plan does not include project backups.” Confirmar backup externo recuperável ou habilitação de backups pelo proprietário. Não foi contratado plano nem executado restore.
4. Revalidar diff, HEAD remoto, build/variáveis e fontes imediatamente antes de eventual produção. O checkout/PagBank completo continua preservado no código e desativado no lançamento WhatsApp.
5. Reconciliar em PROD a saída Amore com a mesma evidência do proprietário quando o ledger for instalado, sem copiar a linha DEV. Revisar qualquer registro Booking ambíguo com a equipe.

Retorno: restaurar deployment anterior se necessário, pausar somente o cron multicanal, preservar ledger, fotos, resultados e histórico. Preferir correções aditivas no banco. Não apagar dados para reverter a interface.

## Complemento autenticado — 12/10/2026, 22h (São Paulo)

Prévia: https://chalezinho-ville-7t1h6fpim-roldneicosta-4140.vercel.app, commit ab79456450e03fc4581e3564cf301c6dca5ac2df. Nenhuma mudança de código nesta rodada; 532 testes refere-se à execução anterior.

| Verificação antes bloqueada | Resultado atualizado |
|---|---|
| Preparação, checklist, upload e aprovação admin | Aprovada no navegador: seis resultados e seis fotos, reload preservou tudo |
| Saída e fotos separadas | Aprovada no PMS: cinco resultados e cinco fotos, aprovação observada |
| Central/PMS | Central móvel, checklist desktop, PMS móvel e desktop verificados; cinco pendentes reais |
| Funcionário e download negado por escopo | Ainda sem sessão visual; RPC anterior não substitui esta jornada |
| Retentativa com falha real de transporte | Pendente; não foi simulado sucesso |
| Backup PROD | Bloqueio confirmado no painel: plano Free sem backups |

Preparação DEV fac5f58b-bde4-4ce8-9423-c060cb906ece criada pela Central: envio incompleto recusado, seis itens/fotos enviados pelo seletor em 360×800, atribuição/início, recarga, envio e aprovação. Banco confirmou approved, seis ready e seis objetos no Storage.

Saída DEV e99afc12-d69c-4537-bebf-3e78ff502a65 criada como fixture por RPC SQL, executada pelo PMS em 360×800: cinco itens/fotos e aprovação; banco confirmou approved, cinco ready e cinco objetos no Storage.

Imagens de catálogo com nota explícita em cada item: não representam vistoria real. Não foram fabricados metadados de upload. Ambas as tarefas/evidências foram depois vinculadas à fixture existente 65a61a78-d65d-417f-9fd9-10cdb3fc0117 (is_test=true) somente para isolamento, preservando notas, fotos e resultados. Não representam operação daquela estadia histórica. Nenhuma exclusão. Fila real retornou a cinco tarefas.

Capturas em outputs/release-20261012:
- admin-mobile.jpg e admin-mobile-after.jpg: /admin.html, 360×800, indicadores e fila.
- checklist-approved-desktop.jpg: /admin.html, 1440×900, executor/aprovador e foto.
- pms-desktop.jpg: /pms-operacao.html?view=today, 1440×900.
- pms-mobile.jpg: mesma URL, 360×800.
- departure-approved-mobile.jpg: mesma URL, 360×800, saída de homologação.
- production-backup-unavailable.jpg: Supabase PROD /database/backups/scheduled.

A captura inicialmente chamada admin-desktop foi renomeada admin-mobile-after por conter viewport efetivo móvel. Não foi tratada como prova desktop. Emulação não comprova Android físico. Nenhuma mensagem, cobrança, migração ou publicação PROD nesta rodada. O seletor de responsável não apresentou QA staff para CH1; não foram alteradas permissões para fabricar aprovação. Sessão de funcionário solicitada ao proprietário.

## Fechamento da verificação do booking-engine — 12/10/2026

A função DEV foi atualizada de v73 para v74 preservando seus 31 arquivos remotos e aplicando apenas os filtros revisados. Na regressão, a data 15–17/02/2027 continuou bloqueada por uma reserva nativa confirmada cuja hospedagem operacional tinha is_test=true. Corrigido também esse caminho: busca e exportação eliminam reservation_id explicitamente marcados no ledger de testes, sem usar nomes. Nenhuma reserva foi cancelada ou apagada.

Versão final DEV: booking-engine v75 ACTIVE, sha 016186cbcd777837214c2ecdaccfbd5225a76dca4d6c22ca54c2460ad1f5cd0e. Verificação API após correção: CH1 disponível no período que antes retornava occupied. Navegador na prévia 7t1h6fpim confirmou três opções, Ville Signature disponível e fluxo WhatsApp. Captura: outputs/release-20261012/native-fixture-search-fixed.jpg. JSON antes/depois: booking-engine-v74-search.json e booking-engine-v75-search.json.

Exportação iCal CH1 por HTTP real (pg_net 28075): status 200, BEGIN:VCALENDAR presente, UID da reserva fixture 64ad00f4-515b-4f0a-a0b9-a29de03f1212 ausente. Token privado não registrado no relatório.

Tipagem do booking-engine aprovada. Suíte completa repetida após correção: 532/532, zero falhas, 53,9 s (tests-native-fixture-fix.txt). Produção permanece sem alterações. Pendentes essenciais: funcionário no navegador/API/fotos, retentativa de upload após falha real e recuperação confirmada do banco. Não declarar publicação concluída.


## Complemento funcionário — 13/10/2026, 08h40 (São Paulo)

Teste solicitado pelo proprietário concluído em DEV. Nenhuma alteração de código, migração ou função nesta rodada. Os 532 testes automatizados são da rodada anterior, não foram recontados como nova execução.

Conta sintética ce25efbf-173e-4a0d-8fef-05ec5d317835, papel staff, somente CH1, permissão housekeeping. Criada para homologação e confirmação de e-mail controlada em DEV; não prova entrega de e-mail. Login de senha realizado no formulário real. Tarefa 947f78dd-6648-4406-b5aa-17916806a0d9.

- Antes da atribuição: zero tarefas/hóspedes na API. Após atribuição: somente sua tarefa no navegador.
- Leitura da tarefa própria: HTTP 200; outra tarefa CH1 e tarefa CH2: HTTP 404 task_not_found.
- Sincronizar como staff: HTTP 403 admin_required; aprovar como staff: HTTP 409 admin_required. Sem botão de aprovação na tarefa enviada.
- Falha real de upload provocada retirando temporariamente apenas a atribuição da fixture. Servidor rejeitou task_not_found, UI mostrou reenvio pendente. Após reload/restauração da atribuição, foto recuperada e enviada. Item reenviado terminou com exatamente uma foto, sem duplicação. Não foi simulada desconexão de rede.
- Seis resultados e seis fotos enviadas pelo seletor real; seis objetos confirmados no Storage. As imagens são de catálogo, não vistoria real.
- Envio para vistoria pelo funcionário; aprovação na sessão administrativa separada fa2184f3-3843-4c77-9354-c1b8b53f384a. Banco confirmou approved, executed_by=staff e approved_by=admin; funcionário recarregou e viu Aprovada no histórico.
- Foto própria assinada: HTTP 200, 59116 bytes; objeto conhecido de outra tarefa: acesso negado/oculto (HTTP 400 com corpo 404 not_found). Tokens/URLs assinados não registrados.
- Finalização: logout visível, acesso operacional da conta suspenso; API confirmou HTTP 403 operator_required. Arquivo temporário de credenciais removido. Conta e histórico preservados.
- Tarefa e seis evidências vinculadas à fixture is_test 65a61a78-d65d-417f-9fd9-10cdb3fc0117 para isolamento, com nota de que não representam operação da estadia histórica. Nenhuma tarefa real alterada.

Navegador funcionário: https://chalezinho-ville-7t1h6fpim-roldneicosta-4140.vercel.app/pms-operacao.html?view=today (ab794564); administrador: https://chalezinho-ville-32jaip0l0-roldneicosta-4140.vercel.app/admin.html (118fe7e7), ambas no mesmo DEV. Aprovação entre versões foi observada, não alegada como teste de um único build. Viewport efetivo desta rodada 1280×720.

Evidências em outputs/release-20261012: staff-api-permissions.json, staff-photo-permissions.json, staff-other-property.json, staff-suspended.json, staff-upload-failed.jpg, staff-submitted.jpg, staff-admin-approved.jpg, staff-approved-history.jpg.

Produção continua sem mudanças. Backup recuperável ainda não comprovado; preflight/diff final e publicação continuam pendentes. Fonte Booking só fornece bloqueios no conjunto observado. Não declarar homologação global ou publicação concluída com base neste teste de funcionário.

## Preflight adicional — 13/10/2026
Revisão e bloqueios atualizados em PREFLIGHT-20261013.md. Corrigidas chamadas legadas do PMS no pacote local; 537 testes passaram. Backup segue ausente no painel e publicação não executada.
