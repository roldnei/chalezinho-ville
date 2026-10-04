# Homologação em andamento — 04/10/2026

Escopo autorizado: Fase 1 completa em desenvolvimento, excluindo estorno. Não autoriza produção.
Versão publicada conferida: 43273816b33b77ab33b92ddd8bf3c373e816a617, branch feature/guest-directory. Supabase DEV pxfqmnhqodqyaaqeyjgr.

## Evidências desta rodada

- 213/213 testes automatizados aprovados. Um teste de contatos ainda usava o fluxo anterior do calendário; atualizado para abrir detalhes e depois contato. Não foi necessária mudança funcional nesse caso.
- Sintaxe admin.js, booking.js, account.js e TypeScript dos três módulos financeiros passaram.
- Publicação DEV READY. Nenhuma promoção de produção.
- Consulta de disponibilidade pelo navegador, 16–18/11/2026, duas pessoas: CH1 ocupado, CH2 e CH3 disponíveis. Tarifas CH2: reembolsável R$ 1.452,80; não reembolsável R$ 1.355,90. Seleção avançou para experiências; nenhuma sugestão disponível nessa etapa. Não houve pagamento nesta rodada.
- Seis fontes iCal ativas com last_error nulo na última consulta registrada. Isso não comprova ausência de conflitos externos entre sincronizações.
- Pedido de mesmo dia aprovado com horário de chegada preenchido. E-mails same_day_requested e same_day_decided com entrega confirmada no banco em 03/10.
- Quatro jobs: 288/288/288/1440 execuções succeeded nas últimas 24 horas. Respostas HTTP agendadas na última hora: 72 HTTP 200, sem timeout.
- Autorização de caução renovada automaticamente em 02/10, atualizada pelo processamento em 04/10, com validade até 07/10 para estadia de 03–05/10. Evidência do banco; não foi feita nova consulta ao provedor nesta rodada.
- Nenhuma tabela pública sem RLS. Isso não substitui testes remotos de isolamento entre contas.
- Há mensagens antigas queued no ambiente de teste, que possui restrição de destinatário documentada. Não classificadas como falha de envio sem conferir elegibilidade.

## Bloqueio atual

O navegador de testes não possui sessão. A abertura do PMS redirecionou ao login. O formulário seguro de autenticação retornou page_changed; a tela continuou no login, sem erro visível e sem confirmação de sessão. Credenciais não foram inspecionadas.

## Ainda necessário para encerrar

Continuar com sessão autenticada: revisão de administração e salvamento, sessão persistente, jornada completa hóspede/pagamento sandbox, adicionais/alterações, garantia/ocorrência, notificações e isolamento de acesso. Aproveitar evidências anteriores válidas, sem declarar testes simulados como transações novas. Confirmar com o provedor a pendência histórica de liberação do saldo não capturado de caução (distinta de estorno).

Estado: homologação geral NÃO concluída; estorno permanece fora do escopo. Este documento é um checkpoint, não certificado de aprovação.
