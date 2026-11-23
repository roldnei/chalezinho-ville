# Reserva direta com aprovação manual

A página `reserva-direta.html` recebe um convite privado no fragmento da URL. O PMS (`reservas-diretas-admin.html`) gera links por proposta e revisa os cadastros. O responsável entra com a própria conta, confere as datas e o valor acordados, informa o nome e telefone, cadastra CPF/passaporte caso necessário, envia identificação com foto e aceita os documentos.

As datas e a ocupação do convite são a proposta acordada no atendimento. Alterações exigem novo link antes do envio, para não manter um preço ou aceite associado a datas diferentes. O aceite inclui cópia integral dos termos, versão, resumo da proposta, identidade e IDs dos anexos, conta autenticada e horário do servidor. Os registros de aceite não podem ser reescritos.

## Confirmação e inventário

Pedidos ficam em `direct_booking_requests.status = pending`, sem criar reservas financeiras, holds, bloqueios ou tarefas. A administração confere pagamento por Pix ou link enviado manualmente, informa uma referência e aprova. Antes de criar uma nova hospedagem, o servidor lê os feeds externos e o banco verifica reservas, hospedagens, bloqueios e eventos sobrepostos. Uma transação serializa a conferência final e a criação de exatamente um `ops_stays` confirmado, direto e manual. O exportador iCal existente já exporta essa origem. Checkout é exclusivo. Importações iCal dos canais continuam sujeitas aos intervalos deles; o mecanismo não é uma API de channel manager em tempo real.

Convites que complementam uma hospedagem real existente preservam seu estado e datas durante o cadastro, pendência, aprovação ou recusa. Aprovar vincula a ficha à mesma hospedagem; não cria outra e não afirma ter processado pagamento. Pagamento precisa ser conferido pelo administrador inclusive nesse caso.

## Proteção dos dados

As quatro tabelas novas usam RLS, sem privilégios anon/authenticated. Apenas a função de servidor, após validar a sessão com `auth.getUser`, acessa os dados. Administradores ativos podem revisar; equipe e outros hóspedes não podem acessar. Não se usa `user_metadata` para autorizar o acesso. As funções SQL são SECURITY INVOKER e executáveis somente pelo service_role. O getter existente de identidade preserva o acesso limitado ao esquema privado, sem novas concessões ao Auth.

Anexos ficam no bucket privado `direct-booking-documents`, sem políticas de leitura direta para visitantes. JPEG, PNG, WebP e PDF têm assinatura de conteúdo e limite de 5 MB verificados no servidor. Links de leitura duram 120 segundos, são concedidos ao titular ou à administração, e as consultas após submissão são auditadas. Os documentos não entram no calendário iCal, nas métricas, no código público ou nas telas da limpeza.

## Termos e pagamentos

O complemento versionado de reserva manual prevalece sobre referências ao checkout e garantia automática nos documentos de hospedagem existentes. Ele não autoriza cartão, pré-autorização, renovação ou cobrança automática. Valor e condições acordadas de cancelamento ficam na proposta e no snapshot do aceite. Imóveis que não são chalés recebem regras gerais, sem prometer comodidades de CH1/CH2/CH3.

O release permanece `whatsapp`: funções financeiras não foram habilitadas. O novo backend é independente (`direct-bookings`), sem substituir `booking-engine` ou os trabalhos financeiros de desenvolvimento.

## Validação

Testes de banco cobrem pendência sem inventário, conta verificada, documento e aceite obrigatórios, reenvio idempotente, convite usado/expirado/revogado, autorização administrativa, confirmação manual de pagamento, conflito com reservas/bloqueios/eventos, exclusividade do checkout, preservação de estadia existente, imutabilidade e execução pelo service_role. Testes de interface cobrem retorno do login, envio de datas e versão aceita, ausência de ações financeiras, arquivos inválidos e capacidade. Regressões das telas de operação e login também foram executadas. Prévia em navegador conferida a 320 e 390 px, com dados sintéticos.
