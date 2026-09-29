# Caução: renovação e saldo após captura parcial

29/09/2026, 11h16 BRT. Somente Supabase isolado `pxfqmnhqodqyaaqeyjgr` e PagBank sandbox; dados e cartão fictícios. Nenhuma cobrança real.

## 2. Substituição da autorização: aprovada no sandbox

Reserva `5F7627F740`, garantia `b1b764c8-7060-4a21-b541-265d7111e472`, R$ 500. O cartão já tinha consentimento `guarantee-v2` e renovação autorizada. Duas autorizações pertencem à mesma reserva e à mesma versão de cartão; o histórico foi preservado.

| Etapa | Horário BRT | Evidência |
|---|---|---|
| Primeira autorização confirmada | 11:11:45 | R$ 500, `AUTHORIZED` |
| Nova autorização confirmada | 11:12:24 | R$ 500, `AUTHORIZED` |
| Despacho do cancelamento da anterior | 11:12:25 | Após confirmação da nova; chave estável por autorização |
| Cancelamento da anterior confirmado | 11:12:28 | `CANCELED`, `paid=0` |
| Novas consultas independentes | 11:13:46–47 | Anterior `CANCELED`; nova `AUTHORIZED`; nenhuma captura |

Pedidos para conferência:

- Anterior: `ORDE_917DE564-29B4-4A78-9EB2-E19694A0DCB2`; cobrança `CHAR_68E8329C-3376-4B99-BD7F-A0C03E4E0269`.
- Nova: `ORDE_17B7B62F-39EB-4DE2-85C2-D0469CA40881`; cobrança `CHAR_A956009A-78E5-4688-A215-BDB0CE696362`.
- Prazo real da nova autorização: **04/10/2026 às 11:12:22 BRT**. Saída da reserva: 05/10. A autorização atual ainda não cobre toda a estadia; nova avaliação está agendada no sistema para **02/10 às 11:12:22 BRT**.

### Alcance exato do teste

O disparo foi antecipado manualmente por um instrumento de teste restrito ao projeto, ao administrador fictício, à garantia e a duas operações com IDs fixos. O teste substituiu somente a seleção/agendamento das tentativas. Utilizou o código real de autorização, cartão tokenizado, API PagBank, conciliação, histórico e cancelamento da autorização anterior. Não modificou relógio, validade, status ou valores retornados pelo provedor. As intervenções ficaram auditadas como `sandbox_renewal_test_prepared`.

Isso comprova a sequência de substituição no provedor, **não uma estadia de vários dias transcorrida de ponta a ponta**. O agendamento, a recusa que preserva a autorização antiga, o consentimento e os conflitos continuam cobertos pelos testes automatizados. Foram executados novamente **19 testes de ciclo de caução e liberação, todos aprovados**.

Uma chamada posterior ao disparador normal não criou uma terceira autorização: permaneceram duas tentativas e a data futura de avaliação. A função temporária foi encerrada, substituída por resposta `410 qa_closed` e JWT obrigatório; uma nova chamada autenticada confirmou o bloqueio. A garantia renovada permanece vinculada à reserva fictícia. Nenhum desvio de teste foi adicionado ao código do aplicativo.

A sessão do Portal Dev no computador está expirada. Estes dois novos pedidos foram conferidos na API autenticada e no histórico do banco; não foram conferidos visualmente no portal.

## 3. R$ 320 restantes: liberação ainda não comprovada

Reserva `57BBF31A42`, garantia `0bdd84ba-ba52-435d-b1e2-88d5d305ecd6`.

- Pedido: `ORDE_1E21B6EA-BC2A-4947-8BEC-7BF88A5C1F39`.
- Cobrança: `CHAR_000F9B67-B6E3-4D6A-B01B-04B3F7C05117`.
- Consulta autenticada renovada: HTTP 200, `PAID`.
- `amount.value=50000`, `summary.total=50000`, `paid=18000`, `refunded=0`, `incremented=0`.
- O objeto retornado não contém um campo de liberação do restante. O banco conserva `released_amount_cents=0` e `release_confirmed=false`.

Está comprovado que **R$ 180 foram capturados e R$ 320 não foram capturados**. Isso não comprova que o limite de R$ 320 já voltou ao cartão. A documentação de [captura parcial](https://developer.pagbank.com.br/reference/capturar-pagamento) apresenta o mesmo formato de saldo, mas não documenta ali um recibo de liberação da diferença. O endpoint de [cancelamento](https://developer.pagbank.com.br/reference/cancelar-pagamento) também atende a estorno de pagamentos capturados: enviar R$ 320 contra essa cobrança não seria uma liberação comprovadamente correta.

Não foi enviada uma operação de cancelamento de R$ 320, nem os R$ 180 foram estornados neste teste. Não foi alterado o saldo para aparentar sucesso.

### Pergunta pronta para o suporte — não enviada

Na API Order, após uma pré-autorização de R$ 500 e captura única de R$ 180 na cobrança acima, os R$ 320 restantes são automaticamente desautorizados? Qual campo, evento ou consulta comprova isso, e qual o prazo para recomposição do limite no emissor? Há operação específica para liberar somente o restante sem estornar os R$ 180 capturados? No sandbox, como homologar essa etapa?

**Resultado:** sequência de renovação validada no sandbox com disparo antecipado de teste; liberação dos R$ 320 depende de evidência/orientação do PagBank. A liberação para produção permanece pendente, incluindo os estornos de cartão já documentados.
