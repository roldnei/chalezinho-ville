# Issue #14 — PMS em DEV

## Entrega

- Base: `fix/dev-pix-refund-outcomes-20261106` em `f897a5b486b329b277cdc7834c71ef40913b468d`.
- Branch: `ux/pms-e2e-issue-14`.
- Primeiro commit da implementação: `4d6b0f39d2410a04509a8a168dbc5c321d1e1a26`.
- [Prévia isolada da branch no Vercel](https://chalezinho-ville-git-ux-pms-e2e-issue-14-roldneicosta-4140.vercel.app/admin.html?view=properties), estado `READY`, alvo Preview, projeto `chalezinho-ville`.
- `app-config.js` servido pela prévia aponta para Supabase `pxfqmnhqodqyaaqeyjgr`, `environment: development`, perfil `checkout-development` e Feelings desativado. Nenhuma conexão Airbnb/Booking foi alterada.
- Homologação autenticada na prévia estável da branch em 06/11/2026 com o imóvel sintético `QA-DEV-20261106-RETEST` (id 12). O `booking-engine` DEV v83 passou a reconhecer somente essa origem adicional de preview; foi publicado a partir do pacote da v82, preservando seus demais arquivos e `verify_jwt: false` existente. Produção não foi alterada.

## Mudanças

1. Navegação com histórico para tela principal, imóvel, preços, disponibilidade e reserva. O botão Voltar retorna ao painel anterior; Fechar encerra o fluxo. Navegação do navegador, Escape e retorno do foco foram tratados. O mês, filtro, aba financeira, período selecionado e rolagem da vista principal são preservados ao voltar.
2. Multicalendário mantém mês e imóvel ao abrir os preços. Cabeçalho e coluna de datas permanecem visíveis durante a rolagem interna.
3. Calendário de preços mostra imóvel, mês, fonte da diária, hoje, período selecionado, ocupação, bloqueio e falta de preço em texto e estilo. A descrição de fallback PriceLabs → tabela própria acompanha o modo ativo.
4. Mudança de preço em lote, bloqueio e desbloqueio apresentam revisão antes de salvar. O motivo do bloqueio é campo visível. Formulários avisam antes de descartar alterações.
5. Imóveis sem foto exibem marcador visual, sem ícone de imagem quebrada. Controles receberam indicação de foco.
6. A aba Indicadores voltou a exibir suas métricas próprias; antes ela montava o resumo de Hoje sob o título Indicadores.

## Matriz de verificação

| Fluxo | Fixture sintética local | Prévia DEV com dados reais |
| --- | --- | --- |
| Imóveis → imóvel → Preços → Regras → Voltar | Passou em 390×844, 1366×768 e 1920×1080 | Passou no imóvel QA: mês e seleção mantidos ao voltar de Regras para Preços; retorno ao imóvel e à lista funcionou |
| Multicalendário → imóvel → Preços → Voltar, mantendo mês/filtro | Passou nos três tamanhos | Passou: fevereiro/2027, visão mensal e filtro do imóvel QA preservados ao abrir Preços e voltar |
| Reserva → Financeiro → detalhe → histórico do navegador | Passou nos três tamanhos | Passou na reserva QA `DD0F106996`: Financeiro → Ver conciliação → Voltar → Voltar; painel e filtro mantidos |
| Preço por período e dias da semana, revisão e recarga | Passou; nenhum POST ocorre antes da confirmação | Passou: diária manual de 10/02/2027 mudou de R$ 80 para R$ 81, persistiu após recarga e foi removida; cotação de duas noites R$ 180 → R$ 181 → R$ 180. Lote de 18–19/02 mudou as duas diárias para R$ 85; cotação R$ 200 → R$ 190 → R$ 200 após limpeza |
| Bloqueio, desbloqueio e regras após recarga | Passou na fixture; nenhum POST de alteração de calendários externos | Passou: bloqueio de 15/02/2027 tornou a estadia indisponível; desbloqueio restaurou cotação. Mínimo de 1 → 3 noites rejeitou estadia de 2 noites; volta a 1 restaurou a cotação. Aviso de descarte apareceu e o cancelamento preservou a edição |
| Cotação própria e fallback PriceLabs | 6 testes unitários passaram | Tabela própria passou: 10–12/02/2027, duas diárias de R$ 80 + R$ 20 de limpeza = R$ 180, `quote_id: null` na consulta. Modo “somente tabela própria” foi salvo, persistiu após recarga e foi restaurado para automático; a interface explicou ambos os modos. Fallback com vínculo simulado passou na rodada complementar. Veja os resultados em centavos abaixo |
| Hoje, Agenda, Reservas, Bloqueios, Tarefas, Manutenção, Indicadores, Checklists e Equipe | Rotas e módulos conferidos em leitura na prévia DEV anterior | Hoje mostrou a fila; Agenda abriu uma estadia QA; Reservas abriu o financeiro; Bloqueios mostrou zero ativos; busca de Tarefas por `QA DEV` retornou 23 tarefas e preservou o filtro após abrir e voltar; Manutenção mostrou zero abertas; Equipe mostrou 7 pessoas, 3 ativas e contas QA suspensas; Checklists exibiu dois modelos versionados. Após o deploy `6332794`, Indicadores mostrou ocupação, tarefas, experiências e saúde operacional próprios. Papel de funcionário validado na rodada complementar com sessão sintética na API operacional DEV |
| Notificações, aprovações, custos, experiências, estadias completas e configurações | Links e arquivos conferidos no repositório; cobertura financeira local passou | Notificações carregou o histórico (104 avisos); Hóspedes carregou os cadastros; Configurações mostrou PagBank sandbox e integrações ativas sem alteração; Experiências e Estadias completas carregaram cadastros. Aprovações exibiu zero pendências. Custos falhou na rodada inicial e passou na rodada complementar com sessão administradora |

Os testes locais usam uma API simulada e um imóvel `QA-DEV-LOCAL` em memória. A homologação autenticada descrita na coluna DEV validou gravação e cotação reais somente para o imóvel QA. Os módulos operacionais e administrativos adicionais foram inspecionados em leitura; as conexões reais dos canais foram mantidas.

## Evidência visual

| Largura | Preços antes | Preços depois | Regras antes | Regras depois |
| --- | --- | --- | --- | --- |
| 390×844 | [PNG](prices-before-mobile.png) | [PNG](prices-after-mobile.png) | [PNG](rules-before-mobile.png) | [PNG](rules-after-mobile.png) |
| 1366×768 | [PNG](prices-before-notebook.png) | [PNG](prices-after-notebook.png) | [PNG](rules-before-notebook.png) | [PNG](rules-after-notebook.png) |
| 1920×1080 | [PNG](prices-before-desktop.png) | [PNG](prices-after-desktop.png) | [PNG](rules-before-desktop.png) | [PNG](rules-after-desktop.png) |

Há também imagens de Imóveis antes/depois e do detalhe da reserva depois, no mesmo diretório. As capturas de referência foram geradas do SHA base com a mesma fixture sintética. Capturas da prévia autenticada: [preços do imóvel QA](live-prices-dev.png), [financeiro da reserva QA](live-finance-dev.png) e [Indicadores após correção](live-indicators-dev.png).

## Testes e limites

- `node --test` dos módulos de preço, disponibilidade, calendário e operação: 34 testes passaram.
- Playwright focalizado em preços, regras, navegação, bloqueio/recarga, teclado, falha de carregamento e financeiro: **27 cenários passaram** nos três tamanhos, incluindo as capturas de referência.
- A suíte geral de navegador foi interrompida após falhas nos testes da conta do hóspede e de Feelings; esses arquivos e telas não foram modificados nesta branch. Feelings permanece fora do escopo da issue.
- A prévia estável inicialmente mostrava “Histórico financeiro indisponível” porque sua origem não estava na lista restrita do `booking-engine` DEV. Após a publicação da v83, a mesma reserva exibiu o contrato original de R$ 99,20, pagamentos de R$ 99,20, saldo de R$ 0 e 14 eventos financeiros. O detalhe de um estorno anterior foi consultado sem executar nova operação financeira.
- O teste autenticado usou o viewport do navegador disponível; a responsividade em 390×844, 1366×768 e 1920×1080 continua comprovada pelas fixtures locais. A rodada complementar abaixo cobre o fallback com dados controlados e a sessão de funcionário via API DEV. A criação de cobrança permaneceu fora do teste.
- Na rodada inicial, `cost_source_links` e `cost_source_documents` estavam ausentes. A rodada complementar restaurou o esquema e validou o painel em DEV.
- Alterações feitas somente no imóvel QA foram revertidas: diárias manuais removidas, bloqueio removido, mínimo de noites restaurado para 1 e modo de preço restaurado para automático. Consulta SQL somente leitura no Supabase DEV confirmou `manual_periods: []`, mínimo 1 e zero bloqueios ativos na data testada. Nenhum vínculo de canal externo foi modificado.

## Rodada complementar em DEV · 06/11/2026

Base do reteste: `f0029f7f2232d738ab83d259170919761fd1a6f8`, branch `ux/pms-e2e-issue-14`, PR #15. A rodada preservou as implementações já homologadas de navegação, preços, financeiro e Indicadores. As intervenções remotas ocorreram no Supabase DEV `pxfqmnhqodqyaaqeyjgr`.

### Custos e histórico de migrações

As duas tabelas e as três entradas de histórico estavam ausentes. Os SQLs da branch foram aplicados em uma única transação, na ordem abaixo. O histórico recebeu o conteúdo aplicado e os mesmos identificadores dos arquivos do repositório na mesma transação.

| Versão | Migração | Resultado |
| --- | --- | --- |
| `20261018204500` | `cost_platform_source_documents` | Criou os documentos e vínculos privados e integrou as fontes à regra de comprovação. |
| `20261018213500` | `cost_source_images` | Passou a aceitar CSV e JPEG com verificação do conteúdo e tamanho. |
| `20261018214000` | `cost_multiple_source_documents` | Permitiu mais de um documento por lançamento e preservou a unicidade do par lançamento–documento. |

- Após a atualização do cache do PostgREST, a sessão administradora no navegador exibiu **Análise de custos**, **Evolução mensal**, **Custos por imóvel**, **Taxas por canal** e **Lançamentos**. Essa verificação usou uma prévia DEV com sessão aberta e os mesmos blobs de `custos.html` (`1b1cec8`) e `custos.js` (`4f711fd`) do PR.
- As duas tabelas têm RLS ativo. O papel anônimo não tem acesso de leitura. O papel `authenticated` tem somente `SELECT` nessas duas tabelas, filtrado para administrador ativo. A importação mantém a escrita pelo papel de serviço.
- Em transações revertidas, um lançamento sintético aceitou dois documentos vinculados, CSV e JPEG. Com o contexto RLS de administrador ativo, ambos ficaram visíveis e o lançamento pôde ser confirmado com a fonte anexada. O contexto de funcionário ativo não leu o documento privado. A consulta pós-teste confirmou a remoção das fixtures de custo e a restauração do perfil sintético ao estado suspenso.

### Operação com funcionário sintético

**44 de 44 verificações** no `pms-operations` DEV v17 com sessão Supabase Auth própria. A conta tinha somente a permissão de limpeza e escopo do imóvel `QA-DEV-20261106-RETEST`. O imóvel sintético `QA-DEV-20261105-2220` serviu como controle fora do escopo. A chamada de evidência sanitizada em DEV retornou HTTP 200, requisição `44295` do `pg_net`.

| Área | Permitido | Negado ou oculto |
| --- | --- | --- |
| Hoje, Agenda e Reservas | Dados operacionais do próprio imóvel e quatro reservas do imóvel de teste. | Outro imóvel, nome, contato e identificador do hóspede, valores, pagamentos, cobranças, garantias, notas e dados administrativos. Alterar reserva retornou 403. |
| Tarefas, limpeza e checklists | Leu duas tarefas atribuídas. Iniciou uma, marcou seu checklist e a enviou para conferência. O estado e o item marcado apareceram na recarga. Leu os sete pontos do checklist fotográfico legado. | Conferência com checklist incompleto retornou 409. Aprovar, criar ou reatribuir tarefa retornou 403. Alterar tarefa sem responsável ou de outro imóvel retornou 404. Alterar modelo de checklist retornou 403. O endpoint legado de fotos retornou 409 por ser somente leitura. |
| Bloqueios, Manutenção, Equipe e Imóveis | Bloqueio do próprio imóvel, modelo de checklist aplicável e somente o próprio perfil da equipe. | Criar bloqueio, criar ocorrência sem permissão, alterar equipe e editar cadastro de imóvel retornaram 403. Ocorrências, anexos e convites ficaram ocultos. |
| Custos | Consultas autenticadas passaram pelo Data API. | A conta recebeu zero linhas em lançamentos, documentos e vínculos. |

Ao encerrar, as quatro tarefas sintéticas foram canceladas, o perfil foi suspenso e perdeu seu escopo, e as sessões renováveis foram revogadas. A sessão suspensa recebeu HTTP 403 no painel operacional. A função temporária de teste foi encerrada e respondeu HTTP 410.

### Fallback PriceLabs → tabela própria

Simulação local com o mesmo módulo de preços e o teste da branch. O vínculo externo `42` e a resposta do fornecedor eram sintéticos. A faixa tinha duas noites, com checkout excluído.

| Entrada simulada | Fonte aplicada | Diárias e subtotal |
| --- | --- | --- |
| Duas diárias válidas | PriceLabs | 30.113 + 35.029 = **65.142 centavos** |
| Uma noite sem preço | Tabela própria para as duas noites | 23.137 + 24.659 = **47.796 centavos** |
| Timeout | Tabela própria para as duas noites | 23.137 + 24.659 = **47.796 centavos** |

Preço inválido, duplicidade ou vínculo com PMS externo incompatível também foram exercitados pelo teste existente. Sem tabela própria e com feed incompleto, o motor retornou preço indisponível. A simulação usou uma função de resposta injetada, sem credenciais e sem chamadas ou alterações nas conexões PriceLabs, Airbnb ou Booking.

### Evidências e limites

- **43 testes locais passaram** em preços, calendário, Custos, importação e permissões operacionais. Os arquivos do teste de preços, do calendário e do motor foram conferidos contra os hashes do PR. A verificação de Custos na interface usou a sessão administradora existente. A verificação da conta de funcionário usou as APIs autenticadas e os controles de acesso, sem uma nova rodada visual com esse papel.
- O teste de fallback valida o motor com falhas controladas. O fluxo de envio de fotos pela área de conferências e a operação com integrações externas ativas ficaram fora dessa rodada.
- Nenhuma cobrança foi feita. Produção, conexões reais e o merge do PR ficaram fora da execução.
