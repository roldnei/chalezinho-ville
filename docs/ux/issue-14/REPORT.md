# Issue #14 — PMS em DEV

## Entrega

- Base: `fix/dev-pix-refund-outcomes-20261106` em `f897a5b486b329b277cdc7834c71ef40913b468d`.
- Branch: `ux/pms-e2e-issue-14`.
- Primeiro commit da implementação: `4d6b0f39d2410a04509a8a168dbc5c321d1e1a26`.
- [Prévia isolada da branch no Vercel](https://chalezinho-ville-git-ux-pms-e2e-issue-14-roldneicosta-4140.vercel.app/admin.html?view=properties), estado `READY`, alvo Preview, projeto `chalezinho-ville`.
- `app-config.js` servido pela prévia aponta para Supabase `pxfqmnhqodqyaaqeyjgr`, `environment: development`, perfil `checkout-development` e Feelings desativado. Nenhuma conexão Airbnb/Booking foi alterada.

## Mudanças

1. Navegação com histórico para tela principal, imóvel, preços, disponibilidade e reserva. O botão Voltar retorna ao painel anterior; Fechar encerra o fluxo. Navegação do navegador, Escape e retorno do foco foram tratados. O mês, filtro, aba financeira, período selecionado e rolagem da vista principal são preservados ao voltar.
2. Multicalendário mantém mês e imóvel ao abrir os preços. Cabeçalho e coluna de datas permanecem visíveis durante a rolagem interna.
3. Calendário de preços mostra imóvel, mês, fonte da diária, hoje, período selecionado, ocupação, bloqueio e falta de preço em texto e estilo. A descrição de fallback PriceLabs → tabela própria acompanha o modo ativo.
4. Mudança de preço em lote, bloqueio e desbloqueio apresentam revisão antes de salvar. O motivo do bloqueio é campo visível. Formulários avisam antes de descartar alterações.
5. Imóveis sem foto exibem marcador visual, sem ícone de imagem quebrada. Controles receberam indicação de foco.

## Matriz de verificação

| Fluxo | Fixture sintética local | Prévia DEV com dados reais |
| --- | --- | --- |
| Imóveis → imóvel → Preços → Regras → Voltar | Passou em 390×844, 1366×768 e 1920×1080 | Aguardando login de administrador na nova prévia |
| Multicalendário → imóvel → Preços → Voltar, mantendo mês/filtro | Passou nos três tamanhos | Aguardando login |
| Reserva → Financeiro → detalhe → histórico do navegador | Passou nos três tamanhos | Aguardando login |
| Preço por período e dias da semana, revisão e recarga | Passou; nenhum POST ocorre antes da confirmação | Aguardando imóvel QA DEV |
| Bloqueio, desbloqueio e regras após recarga | Passou na fixture; nenhum POST de alteração de calendários externos | Aguardando imóvel QA DEV |
| Cotação própria e fallback PriceLabs | 6 testes unitários passaram | Cotação com imóvel QA DEV pendente |
| Hoje, Agenda, Reservas, Bloqueios, Tarefas, Manutenção, Indicadores, Checklists e Equipe | Rotas e módulos conferidos em leitura na prévia DEV anterior | Nova prévia pendente |
| Notificações, aprovações, custos, experiências, estadias completas e configurações | Links e arquivos conferidos no repositório; cobertura financeira local passou | Fluxos completos na nova prévia pendentes |

Os testes locais usam uma API simulada e um imóvel `QA-DEV-LOCAL` em memória. Não validam gravação no Supabase DEV nem cotação real. A inspeção operacional em navegador foi somente leitura, na prévia anterior da branch `fix/reservation`, com dados DEV existentes.

## Evidência visual

| Largura | Preços antes | Preços depois | Regras antes | Regras depois |
| --- | --- | --- | --- | --- |
| 390×844 | [PNG](prices-before-mobile.png) | [PNG](prices-after-mobile.png) | [PNG](rules-before-mobile.png) | [PNG](rules-after-mobile.png) |
| 1366×768 | [PNG](prices-before-notebook.png) | [PNG](prices-after-notebook.png) | [PNG](rules-before-notebook.png) | [PNG](rules-after-notebook.png) |
| 1920×1080 | [PNG](prices-before-desktop.png) | [PNG](prices-after-desktop.png) | [PNG](rules-before-desktop.png) | [PNG](rules-after-desktop.png) |

Há também imagens de Imóveis antes/depois e do detalhe da reserva depois, no mesmo diretório. As capturas de referência foram geradas do SHA base com a mesma fixture sintética.

## Testes e limites

- `node --test` dos módulos de preço, disponibilidade, calendário e operação: 34 testes passaram.
- Playwright focalizado em preços, regras, navegação, bloqueio/recarga, teclado, falha de carregamento e financeiro: **27 cenários passaram** nos três tamanhos, incluindo as capturas de referência.
- A suíte geral de navegador foi interrompida após falhas nos testes da conta do hóspede e de Feelings; esses arquivos e telas não foram modificados nesta branch. Feelings permanece fora do escopo da issue.
- A verificação ponta a ponta na nova prévia ainda depende de autenticação do administrador. Depois do login, usar exclusivamente o imóvel QA DEV e períodos sintéticos para testar gravação, recarga e cotação; não mudar vínculos reais de canais.
