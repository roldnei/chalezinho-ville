# Operação da estadia — PMS

Módulo isolado da Fase 1, disponível em `pms-operacao.html`.

## Escopo

- painel diário de prontidão por imóvel;
- agenda conjunta de estadias e tarefas;
- preparação automática após checkout;
- checklist de limpeza e vistoria;
- tarefas manuais de organização, manutenção e pedidos de hóspedes;
- ocorrências com gravidade e ciclo de resolução;
- histórico de ações para futura auditoria de equipe.

## Isolamento

O módulo usa a Edge Function `pms-operations` e as tabelas `pms_*`. Ele não altera os estados financeiros, a confirmação da reserva, o pagamento, o ledger, o carrinho ou a Área do Hóspede. A futura entrada na navegação da Central Administrativa deve ocorrer apenas depois da conclusão do QA da Fase 1.

## Segurança

- acesso somente para perfis `admin`, `host` ou `staff`, validado novamente no servidor;
- tabelas sem grants para `anon` e `authenticated`;
- acesso aos dados feito exclusivamente pela Edge Function com `service_role`;
- operações registradas em `pms_activity_events`;
- nenhum valor financeiro é aceito ou modificado pelo módulo.

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

Branch isolada: `feature/pms-operations`. A integração com a navegação administrativa permanece deliberadamente pendente para evitar colisão com o outro fluxo em `desenvolvimento`.
