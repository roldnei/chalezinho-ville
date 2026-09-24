# Cobranças pós-reserva

## Regra de negócio

Qualquer ação pós-reserva que gere valor adicional cria uma cobrança pendente. Nada é aplicado ao total pago ou à reserva antes da confirmação do pagamento.

### Experiências e upgrades

- Adicionar experiência cria uma cobrança; não adiciona o pacote imediatamente.
- Upgrade cobra apenas a diferença para o próximo pacote válido da mesma categoria.
- Uma reserva não pode ter dois pacotes ativos da mesma categoria.
- Categorias diferentes podem coexistir.
- Pix e cartão usam a mesma abstração de pagamento.
- Em desenvolvimento o provider é mock; em produção o provider real será conectado pela mesma interface.

### Alteração de reserva

- A solicitação não bloqueia nem garante as novas datas.
- A reserva original continua válida enquanto a solicitação está em análise.
- Ao aprovar, a operação cria a cobrança e passa a proteger temporariamente as novas datas.
- Prazo padrão: 24h, configurável em payment_settings.modification_payment_deadline_hours.
- Se o check-in ocorrer antes do fim desse prazo, o vencimento é antecipado para o horário do check-in.
- Sem pagamento dentro do prazo, a cobrança expira, o hold é liberado e a solicitação vira payment_expired.
- Pagamento confirmado aplica a alteração automaticamente.
- Depois de aplicada/paga, o hóspede não pode cancelar a alteração.

## Avisos por e-mail

A tabela notification_outbox deixa o fluxo independente do futuro provedor de e-mail.

Templates previstos:
- modification_payment_required
- modification_payment_reminder
- modification_cancelled_unpaid

O job process-post-booking-deadlines roda a cada 5 minutos, cria lembretes e cancela alterações não pagas após o prazo.

O envio externo ainda depende da escolha/configuração do provedor transacional.
