# Indicadores operacionais de hoje

Regra confirmada pelo proprietário em 15/10/2026: as previsões de entrada e saída são a agenda das reservas, enquanto andamento e execução dependem dos registros reais.

| Indicador | Critério |
| --- | --- |
| Entradas previstas | Hospedagens confirmadas com check-in previsto para hoje, incluindo entradas já registradas. O cartão informa quantas têm entrada registrada e quantas ainda vão chegar. |
| Estadias em andamento | Entrada efetivamente registrada até agora, sem saída registrada/informada, e checkout previsto hoje ou no futuro. Registros vencidos de dias anteriores ficam no aviso de revisão. |
| Check-outs previstos | Hospedagens confirmadas com checkout previsto hoje, incluindo saídas já registradas. O cartão informa quantas já saíram e quantas ainda vão sair. |
| Limpezas previstas | Tarefas de preparação programadas para hoje (`scheduled_for`), inclusive avulsas e concluídas. Prazo (`due_at`) não muda a data programada. |
| Limpezas concluídas | Preparações enviadas à vistoria hoje (`submitted_at`), em inspeção ou aprovadas. Aprovar em outro dia não muda o dia da execução. |

Todos os dias são calculados em America/Sao_Paulo. Tarefas canceladas/arquivadas e fixtures são excluídas. Limpezas concluídas continuam no circuito de aprovação. Clicar nos cartões de limpeza abre a lista de tarefas correspondente, inclusive concluídas, para consultar checklist e fotos. A lista de hoje deixa de misturar tarefas de outras datas; elas continuam em Tarefas e Próximas.

Sem migração ou alteração de hospedagens. Mudança no resumo do servidor compartilhado entre Central/PMS e na interface comum.

Validação: 767 testes da suíte completa passaram. Após os textos de detalhamento dos cartões, os 11 testes de interface foram repetidos. Testes cobrem agenda após check-in/check-out, estadia real, atrasos antigos, tarefas avulsas, conclusão sem aprovação, aprovação em outro dia, horário de Brasília, fixtures, filtros e retomada das demais abas.

Consulta somente leitura de produção, usada como entrada na mesma função de resumo: uma entrada prevista, uma estadia em andamento, zero saídas previstas, zero limpezas programadas e uma concluída em 15/10/2026. Uma hospedagem antiga sem baixa permanece para revisão. Nenhum dado real foi alterado para testar.
