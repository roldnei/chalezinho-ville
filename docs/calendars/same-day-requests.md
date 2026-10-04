# Pedidos de reserva para hoje — desenvolvimento

Habilitados por imóvel em Disponibilidade → Permitir pedidos de reserva para hoje.
A busca normal apresenta “Sujeito à aprovação” e “Pedir aprovação”. O hóspede entra
na conta, informa nome, telefone e chegada prevista/mensagem. Nada é cobrado.
O pedido passa a constar em Minhas reservas e gera notificação crítica na central.
O painel consulta novos pedidos a cada 30 segundos enquanto estiver visível.

A equipe aprova ou recusa dentro do pedido. Abrir link de e-mail nunca aprova.
Aprovação vale por até 1 hora, limitada ao dia do check-in em America/Sao_Paulo.
Não reserva inventário nem garante preço. Checkout e início do pagamento validam
aprovação, proprietário do pedido, imóvel, datas, hóspedes, validade e disponibilidade.
A emissão do hold marca o pedido como reserva criada; pagamento segue o fluxo existente.
O limite é cinco pedidos por conta/dia; pedidos idênticos são reutilizados.

O pedido dispensa somente antecedência e horário limite de venda instantânea.
Mantém capacidade, mínimos/máximos, preparação, dias permitidos, tarifas e bloqueios
externos, incluindo todos os bloqueios do Airbnb. Se o Airbnb bloqueia hoje, o site
não oferece esse imóvel para pedido. Desabilitar a opção restaura a venda instantânea
sujeita às regras normais. Reservas financeiras existentes não são alteradas.

Segurança: tabela privada com RLS, sem acesso direto para anon/authenticated;
endpoint exige login e isola hóspede; decisão exige administrador; atualização
condicional impede decisões concorrentes. Trigger transacional cria aviso crítico
junto com pedido e enfileira e-mail, sem perder aviso quando há falha no provedor.

E-mail: integração com outbox/dispatcher Brevo existentes. Alerta administrativo
para o proprietário configurado, com link da branch de desenvolvimento. Agendamento
existente a cada minuto. Ambiente mantém restrição EMAIL_TEST_RECIPIENT; entrega
na caixa do destinatário ainda não homologada. WhatsApp automático não configurado.
Nenhum serviço pago foi criado. Nenhuma alteração em produção.

Verificações: 4 testes de serviço (idempotência, acesso, expiração e disponibilidade),
2 testes DOM (pedido sem cobrança e decisão explícita), regressão do formulário de
regras, TypeScript/build. Em transação revertida: criação atômica de notificação
critical e RLS/privilégios. DEV booking-engine v33 e notification-dispatcher v8.
