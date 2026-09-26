# Operação da estadia — PMS

Módulo isolado da Fase 1, disponível em `pms-operacao.html`.

## Escopo

- painel diário de prontidão por imóvel;
- agenda conjunta de estadias e tarefas;
- ficha operacional da reserva com hóspede, contato, valores, experiências, cobranças, notas e tarefas;
- check-in, check-out e não comparecimento com trilha de auditoria;
- preparação automática após checkout;
- preparação automática das experiências pagas antes da entrada;
- checklist de limpeza e vistoria;
- designação nominal da tarefa e aprovação final exclusiva de administrador/anfitrião;
- bloqueios manuais de manutenção, uso do proprietário e operação, incorporados à disponibilidade;
- tarefas manuais de organização, manutenção e pedidos de hóspedes;
- ocorrências com gravidade e ciclo de resolução;
- histórico de ações para futura auditoria de equipe.

## Isolamento

O módulo usa a Edge Function `pms-operations` e as tabelas `pms_*`. Ele lê a posição financeira para oferecer contexto operacional, mas não altera pagamentos, ledger, carrinho ou valores. As transições de check-in/check-out e não comparecimento são explícitas, auditadas e restritas à equipe autorizada.

## Segurança

- acesso somente para perfis `admin`, `host` ou `staff`, validado novamente no servidor;
- tabelas sem grants para `anon` e `authenticated`;
- acesso aos dados feito exclusivamente pela Edge Function com `service_role`;
- operações registradas em `pms_activity_events`;
- nenhum valor financeiro é aceito ou modificado pelo módulo.
- perfis de equipe podem ser limitados por imóvel; tarefas atribuídas a outra pessoa não são expostas ao perfil `staff`;
- somente `admin`/`host` libera o imóvel depois da vistoria completa.

## Nota de QA visual

O print de 25/09/2026 mostrou a página `admin.html` sem a folha de estilos aplicada no navegador móvel. Essa correção pertence ao fluxo responsável pela Central Administrativa atual e não foi incluída nesta branch para evitar conflito com o QA ponta a ponta em andamento.

## QA concluído em 26/09/2026

- autenticação real de administrador e bloqueio para perfis fora de `admin`, `host` e `staff`;
- carregamento de 3 imóveis, 12 reservas operacionais e geração idempotente de 10 preparações com 70 itens de checklist;
- agenda integrada, busca, filtros, drawer da tarefa e checklist;
- criação e transição de tarefa temporária `[DEV]` com evento de auditoria;
- criação de ocorrência crítica temporária `[DEV]`;
- remoção integral dos dois registros temporários e seus eventos dependentes;
- horários exibidos em `America/Sao_Paulo` e entrada manual convertida para ISO no navegador;
- layout desktop real conferido no Preview; regras responsivas cobrem 780 px e 390 px sem dependência da folha de estilos da Central antiga;
- RLS e grants confirmados: `anon` e `authenticated` não leem/escrevem as tabelas `pms_*`; somente `service_role`;
- Edge Function `pms-operations` versão 2 ativa e Preview Vercel final `READY`.

## Consolidação profissional

A branch `feature/pms-consolidation` incorpora o módulo operacional à suíte administrativa sem misturar os estados de reserva e financeiro. Ela acrescenta:

- navegação bidirecional entre PMS, calendário, reservas, notificações, financeiro, garantias, experiências e configurações;
- indicadores de ocupação e execução operacional;
- equipe com papéis `admin`, `host` e `staff`, responsáveis vinculados por usuário e auditoria de mudança de papel;
- modelos reutilizáveis de checklist globais ou por imóvel;
- prioridade, responsável e prazo para tarefas e ocorrências;
- evidências fotográficas privadas de ocorrências, com URL temporária;
- checklist padrão de preparação entre estadias;
- restauração da folha `styles.css` íntegra, corrigindo a Central sem estilos observada no QA móvel.

O PMS continua exclusivo do desenvolvimento e não está ligado à navegação pública.

## Ciclo operacional consolidado

1. Uma reserva confirmada aparece na agenda e na ficha operacional.
2. Experiências pagas geram uma tarefa de preparação com os itens e quantidades contratados.
3. O administrador atribui a preparação à pessoa responsável.
4. No check-out, a reserva muda para `preparing` e a tarefa idempotente de limpeza fica disponível.
5. A equipe inicia, executa e marca cada item do checklist.
6. A equipe envia para vistoria; checklist incompleto é bloqueado pelo backend.
7. Administrador ou anfitrião aprova a vistoria e o imóvel muda para `ready`.
8. Ocorrências podem ser registradas com gravidade, responsável e evidência privada.
9. Bloqueios operacionais impedem venda no motor de reservas e aparecem no calendário central.

Cada transição relevante gera atividade/auditoria e os eventos de atribuição, vistoria e liberação alimentam a central de notificações.
