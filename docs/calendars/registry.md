# Cadastro de links de calendários — desenvolvimento

O menu **Links de calendários** lista os links por imóvel. Selecione o imóvel,
informe nome e URL HTTPS iCal e salve. O mesmo cadastro permite editar, testar,
desativar e excluir fontes. Não há mais limite fixo de 20 fontes por imóvel.
As consultas paginam todas as fontes; a agenda é recarregada após salvar/excluir.
Cada período identifica sua fonte, evitando colisão entre calendários com datas iguais.
A exclusão é lógica e não remove reservas próprias nem outros calendários.

Validação em 2026-10-03: 12 testes de calendário, 1 fluxo DOM de cadastro/edição/
exclusão com 25 fontes, regressão de 6 testes de hóspedes, typecheck e build.
Backend publicado somente no Supabase de desenvolvimento, versão 31.

URLs dos três calendários Airbnb migradas para os cadastros em 03/10/2026.
Os três vínculos de hóspedes foram preservados com os identificadores das fontes.
Conforme orientação posterior, manter todos os bloqueios do Airbnb e configurar
regras próprias por imóvel; consultar availability.md.
