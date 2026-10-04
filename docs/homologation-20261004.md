# Homologação consolidada — 04/10/2026

Escopo: desenvolvimento, Fase 1/PMS, PagBank sandbox, excluindo execução de estornos. Supabase `pxfqmnhqodqyaaqeyjgr`; branch `feature/guest-directory`. Nenhuma promoção ou alteração em produção. Nenhuma cobrança real.

## Parecer

Rodada de execução e revisão encerrada, com **ressalva impeditiva para declarar aprovação integral da caução**: o PagBank não fornece comprovação da liberação dos R$ 320 restantes após captura parcial de R$ 180. A consulta foi repetida no PMS em 04/10 e continuou sem confirmação. Não se trata do estorno excluído pelo proprietário. Os demais resultados abaixo possuem evidências especificadas; testes automatizados e evidências históricas não são apresentados como novos testes de navegador.

## Correções publicadas nesta rodada

- Login: bloqueio do envio HTML nativo que apagava os campos e navegava para `auth.html?`; envio só habilitado depois da inicialização, erro explícito se dependências não carregarem. Login manual posterior funcionou e a sessão persistiu entre conta, reservas e administração. A causa de falhas de rede anteriores não foi comprovada.
- Parcelamento: atualização da cotação pelo BIN preserva 6x selecionado quando permitido; se a opção deixar de existir, exige nova escolha explícita, sem mudar silenciosamente para 1x.
- Confirmação de cobrança adicional distingue alteração de reserva de experiência.
- Lembrete pré-estadia: mensagens ainda na fila acompanham datas, imóvel, horário de check-in e fuso. Mensagens entregues/em processamento não são reescritas nem duplicadas. Migração `20261004141000_reschedule_pre_stay_notification.sql` aplicada somente em DEV; lembrete da reserva de ensaio corrigido para 16/11, 15h BRT, referente à chegada em 17/11.
- Regressão de contatos atualizada para a navegação atual: evento → detalhes → contato.

## Evidências atuais

| Área | Resultado e limite |
|---|---|
| Regressão | **220/220 testes** aprovados, nenhum ignorado. Sintaxe dos três frontends e TypeScript dos três módulos financeiros aprovados. |
| Login/sessão | Login manual confirmado pelo proprietário, navegação autenticada e recarga sem novo login. Testes cobrem armazenamento persistente/temporário, erro de rede e envio duplicado. Não representa semanas de sessão transcorridas. |
| Cadastro | CH2 aberto, campos carregados e salvamento sem alteração concluído. Cabeçalho/voltar e ações do formulário revisados. |
| Calendário | Multicalendário abre por Calendário; mês/semana, filtro por imóvel e disponibilidade por imóvel presentes. Seis fontes iCal ativas e sem último erro na consulta registrada. |
| Hospedagem com cartão | **AB3F33E60F**, CH2, 16–18/11, R$ 1.452,80, **6x**, pagamento `paid` do PagBank sandbox e reserva confirmada. Escolha 6x preservada após preenchimento do cartão. |
| Alteração de datas | Hóspede pediu 17–19/11; administrador aprovou R$ 50,40. Reserva original permaneceu 16–18 enquanto aguardava pagamento. |
| Pix complementar | R$ 50,40 `paid` pelo sandbox; só então datas 17–19/11 aplicadas. Conta mostra total R$ 1.503,20, recebidos R$ 1.503,20, saldo R$ 0,00 e histórico do adicional. |
| E-mails | `payment_awaiting`, `payment_paid`, `reservation_confirmed`, `modification_requested`, `modification_payment_required` e `modification_confirmed` com entrega registrada, uma tentativa, sem erro. Lembrete futuro permanece corretamente na fila. Não prova leitura pelo destinatário. |
| Mesmo dia | Pedido anterior aprovado com chegada 18:30; avisos de solicitação e decisão entregues em 03/10. Em 04/10 a conta exibe sua expiração corretamente; não foi criada nova reserva para hoje. |
| Renovação da garantia | **5F7627F740**: renovação automática em 02/10 às 11:15 BRT, R$ 500, validade até 07/10 às 11:15; cobre saída em 05/10. Autorização anterior liberada depois da nova. Consulta ao PagBank feita no PMS em 04/10. |
| Captura parcial | **57BBF31A42**: R$ 500 autorizados, R$ 180 capturados, R$ 320 não capturados. Consulta em 04/10 permanece com `release_confirmed=false`. Interface informa “Aguardando comprovação do provedor”. |
| Agendamentos | Quatro jobs: 288/288/288/1440 execuções bem-sucedidas nas 24h consultadas; 72 respostas HTTP 200, sem timeout, na hora consultada. |
| RLS | Nenhuma tabela pública sem RLS na consulta desta rodada. Isso isoladamente não comprova isolamento entre contas. Evidências remotas de papéis abaixo. |

## Evidências anteriores reaproveitadas

`docs/phase1-isolated-homologation-20260929.md` e `docs/finance/homologation-live-20260929.md` registram testes no mesmo DEV: experiência adicional e upgrade pagos no sandbox; alteração gratuita, cancelamento de pedido, expiração e idempotência; checklist, vistoria, prontidão, check-in/out e auditoria; acesso de gerente restrito por imóvel e 403 para gestão de equipe; administrador suspenso recusado; webhooks e destinatário de e-mail de teste. Os produtos de ensaio foram restaurados a rascunho/arquivados, explicando ausência de ofertas no checkout atual. Não foram reativados nesta rodada.

Cadastro de comodidades, destaque de oito itens, busca, ícones, escopo por imóvel, operação e papéis também fazem parte da regressão atual. A suíte não equivale a uma revisão visual de todas as telas/dispositivos ou novo ensaio remoto com cada perfil.

## Limites explícitos

- Estornos não foram executados nesta rodada, conforme instrução do proprietário. Pendências de testes antigos preservadas.
- Para fechar caução integralmente, obter orientação/evidência do PagBank para desautorização do restante após captura parcial; pergunta e identificadores em `docs/finance/guarantee-renewal-live-20260929.md`. Não realizar cancelamento de R$ 320 sem saber se a operação estorna o montante capturado.
- iCal não é inventário transacional compartilhado. Há janela entre alterações externas e sincronização; não garante ausência de reservas simultâneas em plataformas diferentes.
- E-mail foi validado. Esta rodada não certifica entrega automática via WhatsApp nem chat próprio.
- Preview/sandbox não é autorização de produção. Credenciais de e-mail de ensaio têm vencimento documentado em 29/10/2026; revisão para produção é separada.

## Rastreabilidade e reversão

Correções de login: `68857ee7526e96b6c8be05353056a880660bd21f`. Parcelamento: `774ae4ed3aa2b0f8e8c32c6c438c96bf47b43d7e`. Este documento acompanha o commit de fechamento com texto de pagamento, migração e teste de reagendamento. Preservados históricos e reservas de ensaio.

Se o último frontend apresentar regressão, republicar o preview de `774ae4e`, mantendo correção do login/parcelamento. A migração nova é aditiva: eventual reversão remove somente seu trigger/função; não desfaz mensagens já entregues nem pagamentos. Não executar reversão automaticamente sem falha comprovada.
