# Conferência de saída após check-in

Uma reserva confirmada ou preparação aprovada não comprova a entrada do hóspede.
O gerador de tarefas só cria a conferência de saída quando a hospedagem tem
`checked_in_at` registrado. O gatilho de hospedagem executa a regra também para
reservas nativas e entradas registradas no PMS.

A migração retira da fila conferências de saída ainda não iniciadas, sem
respostas, fotos ou contrato de faxina, quando não há check-in. Os registros
permanecem no histórico com `departure_waiting_check_in`, preservando o ID e
a pessoa atribuída. No check-in, somente essas pendências temporárias voltam
à fila; cancelamentos intencionais continuam encerrados.

Preparações aprovadas, fotos, respostas e trabalhos já realizados são preservados.
O banco também rejeita a criação manual ou reabertura de conferência de saída
sem check-in. Uma previsão de data nunca registra presença automaticamente.

Validação: `node --test tests/departure-checkin.test.mjs tests/standalone-preparation.test.mjs tests/multichannel-database.test.mjs`
(49 testes).
