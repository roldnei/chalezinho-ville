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
| Cotação própria e fallback PriceLabs | 6 testes unitários passaram | Tabela própria passou: 10–12/02/2027, duas diárias de R$ 80 + R$ 20 de limpeza = R$ 180, `quote_id: null` na consulta. Modo “somente tabela própria” foi salvo, persistiu após recarga e foi restaurado para automático; a interface explicou ambos os modos. Fallback com PriceLabs conectado ainda não foi exercitado na prévia |
| Hoje, Agenda, Reservas, Bloqueios, Tarefas, Manutenção, Indicadores, Checklists e Equipe | Rotas e módulos conferidos em leitura na prévia DEV anterior | Hoje mostrou a fila; Agenda abriu uma estadia QA; Reservas abriu o financeiro; Bloqueios mostrou zero ativos; busca de Tarefas por `QA DEV` retornou 23 tarefas e preservou o filtro após abrir e voltar; Manutenção mostrou zero abertas; Equipe mostrou 7 pessoas, 3 ativas e contas QA suspensas; Checklists exibiu dois modelos versionados. Após o deploy `6332794`, Indicadores mostrou ocupação, tarefas, experiências e saúde operacional próprios. Papel de funcionário ainda não foi testado com sessão própria |
| Notificações, aprovações, custos, experiências, estadias completas e configurações | Links e arquivos conferidos no repositório; cobertura financeira local passou | Notificações carregou o histórico (104 avisos); Hóspedes carregou os cadastros; Configurações mostrou PagBank sandbox e integrações ativas sem alteração; Experiências e Estadias completas carregaram cadastros. Aprovações exibiu zero pendências. Custos falhou ao carregar: o frontend consulta `cost_source_links`, ausente do esquema DEV. Não foi feita migração de custos nesta issue |

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
- O teste autenticado usou o viewport do navegador disponível; a responsividade em 390×844, 1366×768 e 1920×1080 continua comprovada pelas fixtures locais. Fallback PriceLabs conectado, sessão de funcionário e fluxos financeiros de criação de cobrança não foram repetidos nesta branch.
- Custos não carrega na prévia DEV. Consulta somente leitura ao esquema mostrou `cost_entries`, `cost_history`, `cost_receipt_reviews` e `cost_receipts`, mas não `cost_source_links` nem `cost_source_documents`, exigidas pelo código atual. A implantação dessas migrações deve ser tratada separadamente, com revisão de dependências e dados.
- Alterações feitas somente no imóvel QA foram revertidas: diárias manuais removidas, bloqueio removido, mínimo de noites restaurado para 1 e modo de preço restaurado para automático. Consulta SQL somente leitura no Supabase DEV confirmou `manual_periods: []`, mínimo 1 e zero bloqueios ativos na data testada. Nenhum vínculo de canal externo foi modificado.
