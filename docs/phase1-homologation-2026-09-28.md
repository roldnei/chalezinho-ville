# Homologação Fase 1 — 28/09/2026

## Escopo e evidências desta rodada

- Base inspecionada: branch `finance_full_integration` em cópia isolada; alterações concorrentes na branch `integracao-pagbank` não foram incorporadas.
- 21 testes automatizados passaram: criação de ordem Pix/cartão, parcelas com juros, autorização de caução, estorno parcial, idempotência, assinatura do webhook e fronteiras da política de cancelamento. Estes testes exercitam adaptadores e regras, não substituem uma reserva completa no navegador.
- Banco conectado: 3 propriedades; tabelas financeiras, de reservas, experiências, outbox e histórico de estornos presentes, com RLS habilitada.
- Supabase em execução: `booking-engine` v65, `pagbank-webhook` v4, `booking-engine-financial-preview` v1; a função de preview e a branch local não são a mesma versão implantada.
- Pagamentos registrados: 10 cartões PagBank sandbox aprovados, 6 recusados e 1 Pix expirado; também existem pagamentos mock. Nenhuma evidência de captura em produção nesta rodada.
- E-mail: 33 mensagens marcadas como entregues, 1 descartada pelo sandbox. As 18 marcadas como falhas são avisos `payment_awaiting` invalidados por mudança de estado (`payment_state_changed`); 7 avisos de pré-estadia aguardam envio.
- Interface no preview: busca exibiu três opções para 21–23/12, com tarifas; havia confirmação visual de uma reserva sandbox anterior. Isto não comprova a execução ponta a ponta de uma reserva nova nesta rodada.

## Correção local

O cancelamento de política com reembolso calculado em zero dispensou a disponibilidade do token PagBank. A operação de pré-verificação informa que não há cobrança a estornar; a aprovação continua usando a transação no banco. A alteração ainda não foi implantada; requer teste integrado após incorporar as mudanças concorrentes.

## Bloqueios de GO-LIVE

1. Seis estornos de sandbox estão em estado `uncertain` e dois em `prepared`, todos com `confirmed_cents = 0`. A quantia total solicitada nesses oito registros é R$ 5.937,60; conciliar o resultado de cada cobrança no provedor e no banco antes de qualquer conclusão de estorno. Não reenviar solicitações incertas.
2. `payment_settings.active_provider = mock`; o checkout PagBank está confinado ao desenvolvimento/sandbox. Pix aprovado, cartão parcelado, caução autorizada/capturada e estorno confirmado precisam de comprovação integrada com o provedor escolhido para operação real.
3. Políticas reembolsável e não reembolsável ativas são versão 1.0. As versões posteriores e os documentos de termos, regras e privacidade estão em rascunho. Aprovação jurídica e ativação consciente são necessárias para a jornada pública.
4. Falta registrar uma execução nova e completa, com evidências correlacionadas de tela, API, reserva, pagamento, webhook, experiência, e-mail, cancelamento, estorno e caução. Também falta verificar fluxos de alteração paga/não paga e recuperação após falha do provedor no mesmo conjunto de versões.
5. A função financeira de preview e o código local divergem da versão ativa. Integrar as alterações em curso, implantar somente no preview protegido, executar regressão e conferir logs e estados resultantes antes da decisão final.

**Decisão desta rodada: NO-GO.** Não promover CTAs ou gateway à produção até fechar os itens acima.

## Atualização da investigação do estorno

- Cinco das tentativas incertas têm resposta HTTP 400 do PagBank; quatro registraram explicitamente o código `40008`. A documentação do PagBank identifica `40008` como `refund_temporarily_unavailable`.
- As consultas posteriores das cobranças afetadas continuaram a mostrar `PAID` e saldo estornado zero. Nenhum estorno pode ser declarado concluído ou reenviado cegamente.
- O banco contém 10 pagamentos de cartão aprovados em sandbox e nenhum estorno confirmado. A caução permanece simulada: 17 registros `mock`, nenhuma autorização PagBank.
- O preview protegido `reservation-refund-preview` foi atualizado para v19 com a correção do cancelamento de valor zero e a indicação estruturada de indisponibilidade do provedor. A interface de administração correspondente está apenas no commit local `858cea6`; requer publicação isolada e verificação visual.
