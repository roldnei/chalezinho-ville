# Verificação de publicação multicanal — 12/10/2026

## Resultado

**Produção não publicada. Homologação autenticada bloqueada por sessão DEV ainda na tela de login.** Não considerar upload, acesso às fotos por funcionário, aprovação e comparação visual Central/PMS aprovados com base nos testes SQL.

Produção preservada: https://chalezinhoville.com.br, commit `4b54aee214493337b27edcc780bc1de155c632f3`, deployment `dpl_CSqwT4w5eHtc5gCQ3jyg6U2VmPDu`. Fonte de comparação do código: remoto `feature/multichannel-operations-20261012`, HEAD inicial `118fe7e713f5803559a530e8adeb70a5e493bd60`, conferido antes das alterações e antes do envio.

## Correções executadas

- Geração passa a comparar instantes de entrada/saída configurados (15h/11h nos imóveis existentes), e não apenas datas. Não gera preparação depois da entrada nem conferência nova depois do horário de saída. Não preenche presença/checkout pela passagem do tempo.
- Conferência legítima já criada permanece após checkout. Etapas arquivadas não renascem com edição de metadados ou datas; revisões normais continuam versionadas.
- Saída informada pelo proprietário tem campo de data e referência próprios, sem inventar horário efetivo. Amore 09–12/10 reconciliado somente em DEV. Suas duas tarefas foram criadas às 13h43 de 12/10, após saída prevista, estavam pendentes e sem fotos/resultados; arquivadas com motivo, sem exclusão.
- Fixtures explícitas não impedem a conciliação de hospedagens reais nem o inventário operacional. Isso destravou Essenza 09–13/10, antes barrado por sobreposição com teste. Apenas sua conferência de saída foi criada.
- Indicadores distinguem estadia prevista, presença registrada dentro da janela e saída prevista vencida a conferir. Preparação inexistente deixa de ser exibida como pendência criada.
- Filtros de fixtures acrescentados às consultas de hospedagens operacionais na busca e exportação iCal. Estes últimos ajustes do booking-engine ainda exigem deploy/verificação da função completa em DEV; não foram aplicados a PROD.

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
| Funcionário autorizado e fora do imóvel | Aprovada em RPC DEV | Fora do escopo recusado; sem sessão visual do funcionário |
| Hub/tarefa sem autenticação | Aprovada por HTTP | 403 operator_required |
| Rotina sem segredo | Aprovada por HTTP | 403 forbidden |
| Fotos: upload móvel, retentativa, recarga, download permitido/negado | Bloqueada | Login DEV pendente; nenhum upload simulado tratado como real |
| Checklist, aprovação, comparação das duas etapas na UI | Bloqueada | Falta sessão administrador e funcionário |
| Central/PMS móvel/desktop | Bloqueada | Tela privada no login |
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

1. Login DEV administrativo e sessão separada de funcionário para terminar UI, fotos, autorização HTTP com JWT, recarga/retentativa e comparação Central/PMS.
2. Publicar e testar o pacote revisado do booking-engine DEV; manter wrapper PMS de PROD, sem substituição cega pela função completa DEV.
3. Confirmar backup/recuperação disponível e sua restauração; apenas o procedimento foi preparado, não há ensaio comprovado de restauração.
4. Revalidar diff, HEAD remoto, build/variáveis e fontes imediatamente antes de eventual produção. O checkout/PagBank completo continua preservado no código e desativado no lançamento WhatsApp.
5. Reconciliar em PROD a saída Amore com a mesma evidência do proprietário quando o ledger for instalado, sem copiar a linha DEV. Revisar qualquer registro Booking ambíguo com a equipe.

Retorno: restaurar deployment anterior se necessário, pausar somente o cron multicanal, preservar ledger, fotos, resultados e histórico. Preferir correções aditivas no banco. Não apagar dados para reverter a interface.
