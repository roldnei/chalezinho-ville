# QA técnico — continuação da Fase 1

Este documento registra apenas o que continua relevante. Listas antigas foram reconciliadas com o banco, código e Preview reais.

## Cobertura concluída

- Busca, datas inválidas, capacidade, mínimo de noites e indisponibilidade de tarifa.
- PriceLabs, Airbnb, reservas diretas, holds e alterações aprovadas.
- Falha de fonte de calendário ou preço fecha a disponibilidade com segurança.
- Quote expirada, hold expirado, clique repetido, cobrança duplicada e webhook/mock repetido.
- Pix/cartão mock: aprovado, recusado, em análise e expirado.
- Carrinho pós-reserva separado de pagamentos pendentes.
- Experiência, upgrade, alteração paga e alteração expirada.
- Ledger, pagamentos, total da reserva, `experience_amount` e histórico conciliados.
- RLS por proprietário dos dados e RPCs financeiras sem acesso guest.
- Analytics do funil persistindo eventos sem cartão, senha ou token.
- Sintaxe dos JavaScripts e smoke da Edge Function.
- Dados temporários removidos ao fim de cada bloco.

## Cobertura externa ainda impossível

- Booking.com: código e fail-safe prontos, faltam as três URLs iCal.
- Gateway real: contrato pronto, falta escolher e credenciar o provider.
- E-mail real: templates, outbox, retry e status prontos; falta provider.
- Auth: Leaked Password Protection ainda desligado no painel.
- Jurídico: drafts não podem ser ativados sem aprovação.

## Proteção de publicação

- `main` e produção não fazem parte deste QA.
- Rotas novas permanecem `noindex,nofollow`.
- Nenhum GO-LIVE sem autorização explícita.
