# Indicadores operacionais de hoje

Regra confirmada pelo proprietário em 15/10/2026: as previsões usam as datas das reservas e mostram apenas o que ainda falta realizar. Ao registrar entrada ou saída, a hospedagem sai da previsão correspondente.

| Indicador | Critério |
| --- | --- |
| Entradas previstas | Hospedagens confirmadas com check-in previsto hoje, sem entrada ou saída registrada/informada. |
| Estadias em andamento | Entrada efetivamente registrada até agora, sem saída registrada/informada, e checkout previsto hoje ou no futuro. Registros vencidos de dias anteriores ficam no aviso de revisão. |
| Check-outs previstos | Hospedagens confirmadas com checkout previsto hoje, sem saída registrada/informada. |
| Limpezas previstas | Tarefas de preparação programadas para hoje (`scheduled_for`), inclusive avulsas e concluídas. Prazo (`due_at`) não muda a data programada. |
| Limpezas concluídas | Preparações enviadas à vistoria hoje (`submitted_at`), em inspeção ou aprovadas. Aprovar em outro dia não muda o dia da execução. |

Todos os dias são calculados em America/Sao_Paulo. Tarefas canceladas/arquivadas e fixtures são excluídas. Limpezas concluídas continuam no circuito de aprovação. Clicar nos cartões de limpeza abre a lista de tarefas correspondente, inclusive concluídas, para consultar checklist e fotos. A lista de hoje deixa de misturar tarefas de outras datas; elas continuam em Tarefas e Próximas.

Sem migração ou alteração de hospedagens. Mudança no resumo do servidor compartilhado entre Central/PMS e na interface comum.

Validação: 768 testes da suíte completa passaram, além de 20 cenários específicos de resumo e interface. Testes cobrem agenda após check-in/check-out, estadia real, atrasos antigos, tarefas avulsas, conclusão sem aprovação, aprovação em outro dia, horário de Brasília, fixtures, filtros e retomada das demais abas.

Consulta somente leitura de produção, usada como entrada na mesma função de resumo: zero entradas previstas após o check-in, uma estadia em andamento, zero saídas previstas, zero limpezas programadas e uma concluída em 15/10/2026. Uma hospedagem antiga sem baixa permanece para revisão. Nenhum dado real foi alterado para testar.


## Status visíveis das tarefas

Os estados persistidos e o circuito de aprovação permanecem os mesmos. As telas do PMS e das conferências mostram `pending`/`todo` como **Não iniciada**, `in_progress` como **Em andamento**, `inspection` como **Enviada para aprovação** e `approved`/`ready` como **Finalizada**. O cartão finalizado informa que a conferência foi aprovada e a tarefa encerrada, com data quando disponível; o enviado informa que aguarda aprovação. A conclusão da execução continua separada da aprovação administrativa.
