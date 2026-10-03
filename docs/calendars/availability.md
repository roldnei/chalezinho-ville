# Disponibilidade por imóvel — desenvolvimento

Acessos: Calendário → Disponibilidade (na linha do imóvel), Imóveis →
Disponibilidade, ou Links de calendários → selecionar imóvel → Configurar disponibilidade.

Regras em `properties.features.availability`, alteráveis somente por administrador,
com validação no servidor, auditoria e controle de edição concorrente.

Valores iniciais: mínimo 1 noite, mínimo 2 quando inclui sexta/sábado, máximo 1125,
antecedência 0 dias, corte às 11:00 de Brasília, preparação 0 dias, janela 9 meses,
todos os dias permitidos para entrada/saída. O mínimo do PriceLabs permanece
habilitado e vale o maior; pode ser desabilitado por imóvel.

Regras personalizadas usam a data de entrada (limites inclusivos), substituem
mínimo/máximo gerais e rejeitam sobreposição. Janela limita a última noite.
Preparação bloqueia dias antes/depois de períodos ocupados próprios e importados.
Bloqueios operacionais já definem seu próprio período.

Pesquisa, cotação, solicitação/aprovação de alteração e início de um novo pagamento
usam essas regras no servidor. Repetições de pagamentos com reserva/hold existente
mantêm o fluxo anterior. Reservas existentes não são canceladas por mudança de regras.
Reserva manual administrativa conserva o fluxo operacional anterior; não equivale
à venda pública nem depende de disponibilidade de tarifa PriceLabs.

Conforme orientação final do usuário de 03/10, TODOS os bloqueios do Airbnb são
mantidos. Não há filtro ativo de evento de mesmo dia. iCal informa ocupação, não
configura mínimo, antecedência ou janela no Airbnb/Booking. Regras do site somam-se
às indisponibilidades importadas; o cadastro não muda as plataformas externas.

Validação: 6 cenários de regras (cutoff, fuso, mínimo/máximo, PriceLabs, antecedência,
janela, dias permitidos, período personalizado, preparação, entradas inválidas),
1 teste de interface gravando regras somente no imóvel selecionado e recarregando,
regressão do cadastro de calendários, sintaxe, TypeScript e build. Endpoint DEV
sem autenticação rejeitado com 403 admin_required. Supabase DEV booking-engine v32.
