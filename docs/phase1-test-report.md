# Fase 1 — evidência consolidada de QA

Atualizado em 25/09/2026.

## Banco, backend e segurança

- Tarifas 1,28 / 1,20 / 1,10, limpeza por propriedade e quote de 15 minutos — PASS.
- Quote não bloqueia datas; hold nasce no início do pagamento — PASS.
- Sobreposição concorrente bloqueada no banco; checkout pode coincidir com próximo check-in — PASS.
- Expiração de hold e prazo de alteração via cron — PASS.
- Alteração atômica, reserva original preservada, hold liberado ao expirar — PASS.
- Captura parcial de garantia e retry idempotente; excesso bloqueado — PASS.
- RPCs financeiras acessíveis somente a service_role — PASS.
- `anon` e `authenticated` sem INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES nas tabelas financeiras — PASS.
- Perfil do hóspede limitado a UPDATE de `full_name` e `phone`; campo `role` não é editável — PASS.
- Consistência de todas as reservas confirmadas: total = pagamentos pagos = ledger; experiências = itens ativos = ledger de experiência + upgrade — PASS.
- Nenhuma categoria de experiência ativa duplicada e nenhuma cobrança aberta duplicada — PASS.
- Nenhum pagamento ou lançamento financeiro órfão após limpeza do QA — PASS.
- Advisor de performance sem FK não indexada — PASS.
- Edge v37: config 200; rota admin sem sessão 403 — PASS.

## Carrinho e pós-reserva

- Adicionar experiência cria somente item de carrinho — PASS.
- Fechar/recarregar mantém carrinho e não cria dívida — PASS.
- Remover item — PASS.
- “Ir para pagamento” converte uma única vez em cobrança — PASS.
- Fechar pagamento depois da cobrança mantém item em Pagamentos pendentes — PASS.
- Recusado permite nova tentativa na mesma cobrança até o prazo — PASS.
- Em análise bloqueia retry e cancelamento — PASS.
- Pago aplica experiência/upgrade e ledger uma única vez — PASS.
- Upgrade cobra apenas a diferença e substitui só depois do pagamento — PASS.

## Upsell

- Pacote R$ 300 com upsell ativo oferece o próximo pacote R$ 549 por +R$ 249 — PASS.
- Recusar mantém R$ 300 — PASS.
- Aceitar troca para R$ 549 e aumenta o total em R$ 249 — PASS.
- Semântica vale no funil inicial e pós-reserva — PASS.

## Notificações

- Evento de pagamento gera outbox deduplicada — PASS.
- Claim concorrente usa `skip locked` — PASS.
- Falha retorna à fila com retry e sucesso encerra como enviado — PASS.
- Dados temporários desse teste removidos — PASS.
- Envio externo não testado: provedor ainda não escolhido.

## Pendências de verificação final

- QA visual final após o último Preview nos viewports obrigatórios.
- Gateway e e-mail reais dependem de escolha/credenciais.
- Booking.com depende das três URLs iCal.
- Leaked Password Protection depende de configuração Auth.
- Textos jurídicos continuam draft e dependem de aprovação.
