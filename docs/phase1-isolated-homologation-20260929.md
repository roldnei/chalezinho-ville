# Fase 1 — homologação no ambiente isolado

Escopo: Supabase `pxfqmnhqodqyaaqeyjgr`, branch `fix/reservation-finance-lifecycle`, PagBank sandbox. Sem promoção de produção. Estorno e caução estão fora desta rodada; a conferência de caução foi reagendada para domingo, 04/10/2026.

## Correções desta rodada

- Publicados os módulos PMS e notificações que ainda não existiam no ambiente isolado. Envio transacional permanece desativado enquanto faltarem provedor/credenciais.
- PMS verifica imóvel e permissão em tarefas, ocorrências, anexos, modelos e bloqueios; prestadores só executam tarefas atribuídas a eles. Evidências são filtradas antes da assinatura das URLs. Valores financeiros, inclusive valores aninhados nas experiências, não são entregues à equipe sem permissão.
- Somente administradores gerenciam equipe e acessam notificações globais. Administradores suspensos não passam pela autorização administrativa do motor de reservas.
- Check-in do PMS usa a mesma rotina transacional da central, preservando suas validações e auditoria. Liberação de tarefa exige etapa de vistoria e checklist completo. Não comparecimento não pode ser lançado antes da chegada ou depois do check-in.
- Preparação acompanha os itens efetivamente pagos, inclusive substituição por upgrade; alterações das datas e imóvel atualizam o planejamento operacional.
- Bloqueios operacionais e inventário direto compartilham bloqueio transacional do imóvel, fechando a corrida entre consulta prévia e gravação.
- URL padrão e callback do Auth apontam para o preview estável, corrigindo o retorno anterior para localhost.

## Evidências registradas

150 testes automatizados aprovados; TypeScript dos módulos alterados e sintaxe do PMS aprovados. Nove testes de interface com fixtures aprovados na rodada anterior.

Correções finais: a Área do Hóspede considera checkout registrado e horários configurados; notificações atrasadas do Brevo não apagam entrega confirmada, falhas de persistência retornam resposta repetível e timestamp inválido recebe erro controlado. Webhook v2 publicado e chamada sem credencial recusada (401). Entrega real pelo Brevo ainda não homologada.

Reserva de ensaio `DEDFD40744` / `7823e966-dc9b-4591-9601-0d9c5f03f696`: base criada manualmente como fixture, vinculada à conta QA. A hospedagem desta fixture NÃO foi vendida no gateway. Os adicionais abaixo foram transações reais de sandbox, sem simulação de status pago no banco:

| Caso | Evidência |
|---|---|
| Experiência adicional | Pagamento `371706cb-a258-4229-86f6-7932e3889a9b`, R$ 1,00, `paid`; cobrança `f1ffbfe3-910b-48c2-be46-fdfcea646353`, `applied` |
| Alteração com diferença de preço | Pagamento `3e20f64b-acc1-428d-884f-e90634ea7c77`, R$ 1,00, `paid`; cobrança `78537775-f597-4796-9820-1335de23403e`, `applied`; datas mudaram somente após confirmação |
| Repetição de pagamento | Mesma tentativa reutilizada enquanto pendente; sem segunda cobrança |
| Alteração sem custo | Cobrança zero exigiu confirmação explícita e aplicou novas datas |
| Cancelamento de solicitação | Cancelamento antes do pagamento preservou reserva |
| Carrinho removido | Item removido sem criar dívida |
| Expiração | Cobrança `ed0ecea3-518b-4838-b620-e6c6f861efb6` expirou e reserva permaneceu confirmada; prazo da fixture foi antecipado, sem alterar relógio global |
| Upgrade de experiência | Pagamento `341c3554-430a-42d8-9a23-07d0b5f46961`, R$ 1,00, `paid`; antigo item `upgraded`, novo `active`; checklist passou a exigir o novo pacote |
| Permissões | Gerente restrito ao imóvel 2: acesso a bloqueio/tarefa/anexo do imóvel 1 recusado; gestão de equipe 403; valores financeiros ausentes |
| Checklist | Pronto sem vistoria recusado; vistoria com itens pendentes recusada; conclusão dos itens → vistoria → pronto aprovada |
| Check-in/out | Fixture `QAOPS2909`: entrada, saída e auditoria; saída antes da entrada, repetição e no-show após entrada recusados |
| Confirmação de conta | E-mail recebido pelo proprietário e `email_confirmed_at` confirmado no banco |
| Administrador suspenso | `admin_hub` respondeu 403; acesso da conta QA restaurado após o teste |
| Bloqueios e liberação | Dois imóveis indisponíveis enquanto bloqueados; os três disponíveis após cancelamento dos bloqueios, sem cobertura Booking ainda |

A fixture operacional foi inserida diretamente no banco isolado para testar transições na data atual, pois os calendários externos bloqueiam os três imóveis nessa data. Isto NÃO constitui teste de uma venda disponível nessa data. Check-in utilizou exceção administrativa explícita e auditada, exclusivamente para a fixture sem hospedagem real.

## Ainda em execução

- Configurar Brevo, comprovar mensagens operacionais e concluir recuperação de senha.
- UI de adicionais conferida com valores e pagamentos aplicados. Equipe/prestador validados. Bloqueios, tarefas e ocorrências temporários cancelados; produtos de ensaio restaurados a rascunho e upgrade arquivado, preservando histórico.
- Configurar os três calendários privados Booking antes de declarar cobertura completa; produção já recusa pesquisa sem eles, desenvolvimento permite ensaios sem a integração.
- Consolidar documentação de lançamento/reversão e avaliação de conteúdo. Não declarar homologação geral ou liberação de produção antes dessas evidências.

Rodada de e-mails: migração phase1_notification_amount_units converte o total da confirmação para centavos e corrige somente snapshots legados ainda na fila; mensagens já enviadas são preservadas. Teste comprova conversão uma única vez. Dispatcher v2 formata datas de hospedagem sem deslocamento para o dia anterior em Brasília. Entrega externa segue pendente do Brevo.
