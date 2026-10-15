# Grupos e pesquisa de tarefas

PMS → Tarefas agora apresenta três listas recolhíveis com contagem:

- **Tarefas hoje**, aberta inicialmente, incluindo pendências anteriores.
- **Tarefas da próxima semana**, recolhida, compreendendo amanhã até os próximos sete dias.
- **Tarefas próximas semanas**, recolhida, para datas posteriores.

A data programada da tarefa é interpretada em America/Sao_Paulo. Os filtros e o atalho de limpezas aguardando hospedagem foram preservados.

Na lista operacional padrão (incluindo Hoje/Próximas), uma conferência de saída somente aparece quando a preparação da mesma hospedagem e da mesma versão está aprovada. Uma aprovação antiga ou de outra hospedagem não a libera. Isso organiza a apresentação; não apaga, recria ou altera a tarefa ou sua autorização.

**Pesquisar tarefas** consulta chalé, hóspede, responsável, título, data, tipo, status e identificador. A pesquisa ignora acentos, preserva o campo enquanto digita e inclui saídas ainda ocultas e tarefas finalizadas/arquivadas. O filtro **Todas, incluindo histórico** também permite essa consulta completa. Abrir o resultado mantém checklist, fotos e histórico no fluxo existente.

Validação: 769 testes da suíte completa passaram. Na verificação específica, 16 testes passaram, incluindo datas nos limites de sete/oito dias, recolhimento, contagens, atrasos, pesquisa com/sem acentos, histórico, entrada aprovada da versão correta, volta aos grupos e limpeza avulsa com vínculo posterior. Build DEV, sintaxe e diff aprovados. O servidor fornece somente um indicador de aprovação da entrada para cada saída autorizada. Isso permite listar a saída mesmo quando a preparação foi executada por outra pessoa, sem expor as tarefas dessa pessoa. Não houve migração nem edição de hospedagens reais.
