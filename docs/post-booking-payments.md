# Carrinho, cobranças e notificações pós-reserva

## Regra de negócio

“Adicionar” não é “pagar”.

1. Adicionar experiência ou upgrade grava `post_booking_cart_items`.
2. O carrinho pode ser fechado, recarregado ou removido sem criar cobrança, pagamento ou dívida.
3. Somente “Ir para pagamento” converte atomicamente o item em `post_booking_charges`.
4. Iniciar Pix/cartão cria uma tentativa em `payments`.
5. Aprovação aplica experiência, upgrade ou alteração atomicamente.
6. Recusa mantém a cobrança reutilizável até o prazo; análise bloqueia retry/cancelamento.
7. Expiração encerra a cobrança. Para alteração, libera o hold e preserva a reserva original.

## Experiência e upgrade

- Uma categoria ativa por reserva.
- Upgrade sempre para o próximo pacote ativo mais caro da mesma categoria.
- Diferença calculada no servidor.
- Pacote anterior só é substituído depois do pagamento.
- Frontend nunca define o preço final.

## Alteração

- Solicitação não bloqueia datas.
- Aprovação cria cobrança/hold por 24h configuráveis, antecipado quando o check-in vem antes.
- Valor zero exige confirmação explícita.
- Pagamento aplica automaticamente.
- O cron gera lembrete, expira, libera as datas e mantém a reserva original.

## Notificações

`notification_outbox` separa evento, fila, envio e resultado. Há dedupe, `processing`, limite de tentativas, backoff, falha final e confirmação de envio. Templates cobrem conta/recuperação, reserva, pagamentos, alteração, experiência, upgrade e pré-estadia.

O texto de aprovação informa: “A alteração solicitada ainda não está confirmada. Para concluir, realize o pagamento da diferença pelo site até [prazo]” e lembra que a solicitação anterior à aprovação não garantia datas.

A conexão com o provedor transacional continua bloqueada por decisão/credencial externa.
