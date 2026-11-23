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

## Identificação digitada e cadastro da conta

CPF ou passaporte permanecem no cadastro canônico de identidade e no snapshot da solicitação. O CPF continua disponível ao fluxo de pagamento existente; não é substituído pelo RG. Para o titular autenticado, o formulário reapresenta o número já salvo em um campo de leitura. RG, CIN, CNH ou passaporte do documento com foto têm tipo e número digitados obrigatoriamente; RG também exige órgão emissor e UF. CIN deve corresponder ao CPF e um passaporte já cadastrado deve corresponder à identificação da conta. A imagem é complementar e não preenche os campos automaticamente.

Na mesma transação da submissão, nome e telefone são atualizados em `profiles`, mantendo a identidade da conta, papel, consentimentos opcionais e dados de pagamento existentes. O snapshot preserva CPF/passaporte, país emissor, documento com foto, anexos e termos. Nenhum dado foi extraído ou inventado a partir de imagens. O link já enviado e a disponibilidade do CH3 são preservados.

## E-mail para checagem administrativa

Ao concluir a submissão com os documentos e o aceite, a mesma transação coloca um aviso na fila para o administrador ativo que gerou o convite. Nome, imóvel e período aparecem no e-mail; CPF, RG e anexos permanecem exclusivamente no PMS. O botão abre a solicitação exata após autenticação. Abrir o link não aprova nem altera disponibilidade.

O disparo dedicado executa a cada minuto e usa a configuração interna protegida de entrega já existente. Deduplicação por solicitação/administrador, repetição com a mesma chave do provedor e tentativas após falhas evitam duplicidade ou perda silenciosa. O trabalhador genérico não consome esses avisos. Solicitações já decididas ou com administrador desativado são descartadas antes do envio. A fila guarda somente o identificador da solicitação. A nova função valida a credencial interna e reapura o destinatário e o estado no servidor. Desenvolvimento força sandbox no provedor.

Validação: sete testes do aviso (gatilho, deduplicação, autorização, descarte de pendências encerradas, link e escape de conteúdo, sandbox e falha de envio), seis testes de interface incluindo abertura pelo e-mail sem aprovação e doze testes do fluxo de reserva direta passaram. A homologação de entrega em produção utiliza somente um aviso verdadeiro de ativação para o administrador, sem criar uma solicitação fictícia nem marcar o cadastro de um hóspede como concluído.

No primeiro teste de 23/11, o Brevo retornou HTTP 401. A inspeção do painel confirmou chave ativa e bloqueio do endereço de saída do servidor. Após autorização explícita do proprietário, somente esse endereço foi adicionado à lista; o bloqueio dos demais permaneceu ativo. O mesmo aviso de ativação foi reenviado e o webhook confirmou entrega em 23/11/2026 às 16h44 de Brasília. O gatilho e o cron estão ativos. Erros 401/403 mantêm o aviso na fila para repetição a cada hora, sem esgotar tentativas. Nenhum cadastro fictício foi criado em produção, e o hóspede CH3 ainda não havia submetido o cadastro nesta conferência.
