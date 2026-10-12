# Lançamento parcial — publicado em 11/10/2026 (São Paulo)

## Versão e escopo

Domínio https://chalezinhoville.com.br/ promovido para `dpl_DCDcTiTk5wfYqN77bjvVZGkTgK31`, frontend `45fcdec8b4d9039680efc926b218e6acc9868ec8`. Build de produção validado antes da promoção; não foi promovido um build com configuração DEV. A consulta de deployment pelo domínio retornou esse ID após a promoção. Configuração pública observada: production, whatsapp, projeto irxsaladqhbzhkoaclxy, sem referência ao projeto DEV.

Backend complementar versionado em `01972b18f07ce46f646406aa0a023ccfbb27664d`: entrada PMS compatível com a versão anterior e novo editor de descrição/comodidades. A diferença não modifica os assets do frontend promovido.

Liberado: três chalés, intro com seletores e fotos próprias (Amore: interior autorizado), vitrine de Escapadas, disponibilidade/preços e resumo para WhatsApp 5593991592266, sem cadastro obrigatório. Limpeza R$290 incorporada ao total. Feelings, publicação de hóspedes e recursos sociais não foram liberados em produção; checkout completo e financeiro permanecem no DEV.

## Navegador real e evidência

Na candidata: intro e Amore → página do chalé → datas 17–19/10 → R$1491,75 → resumo e link WhatsApp. Ville Moments → escolher datas → três imóveis → Essenza R$1531,65. Viewports 360×800, 412×915 e 1440×1000; são viewports de navegador, não aparelho Android físico.

Após promoção, domínio oficial: abertura mobile → intro → Signature → página → 19–21/10 → R$1419 → resumo/encaminhamento. Não foi enviada mensagem real. A versão candidata apresentou uma falha temporária na primeira consulta; a repetição, a consulta posterior na versão final e a consulta no domínio oficial funcionaram. Não foi estabelecida a causa da primeira falha.

No PMS de produção, com login fornecido pelo proprietário: painel, períodos iCal, três imóveis, editor de descrição, comodidades, galeria, calendário, regras e formulário da Escapada carregados. Salvar descrição sem mudar seu conteúdo retornou ao imóvel e gerou audit_events/listing_section_updated às 01:02:47 UTC de 12/10. Editor exige usuário autorizado; chamada anônima retornou 403 operator_required. Upload/remoção de foto, edição de comodidade e pausa/reativação foram testados em DEV anteriormente, não repetidos como alteração de catálogo real em PROD. Não afirmar homologação integral de limpeza/manutenção/financeiro da produção.

Capturas reais em outputs do chat: official-intro-360.png; official-consultation-360.png; prod-final-intro-1440.png; prod-candidate-intro-360.png; prod-candidate-whatsapp-360.png. Demais jornadas DEV e evidências detalhadas: qa-execution-20261011.md. Não usar a captura prod-final-intro-412.png como imagem final da foto: foi capturada durante a transição entre imagens.

## Segurança, banco e integrações

POSTs reais no domínio oficial /api/create-hold e /api/update-hold-guest retornaram 410 legacy_reservation_endpoint_retired. hold, start_payment, create_reservation e start_post_booking_payment no engine de produção, com cabeçalho development e persist/mode manipulados, retornaram 403 public_checkout_disabled. Relatório local: outputs/prod-official-server-guards-20261011.json. A proxy pública é limitada a leituras; cotação retorna quote_id=null.

Antes/depois das consultas: reservas 0/0, pagamentos 0/0, garantias 0/0, quotes 138/138, notification_outbox 3/3, pms_calendar_blocks 1/1. Nove integrações preservadas. Seis fontes iCal ativas sem último erro: três Airbnb e três Booking. Os zeros resultam da limpeza autorizada anterior, não de ausência de histórico prévio. Nenhuma captura, cobrança ou estorno no provedor foi executado por essa limpeza.

Alterações PROD: migration aditiva partial_launch_compatibility; limpeza de 47 reservas diretas/manuais, 52 pagamentos e 25 garantias com dependências após backup privado das 51 tabelas; limpeza R$290 nos imóveis; seis fontes legítimas; uma Escapada ativa sem produtos adicionais; automatização de publicações inicialmente desativada. Contratos/usuários não copiados de DEV. Ver histórico detalhado em qa-execution-20261011.md.

Funções: booking-engine v66; public-consultation v1; villegram-content v1; pms-operations v13 (entrada pms-launch-compat); endpoints antigos de QA fechados: booking-engine-financial-preview v20, guarantee-preview v9, reservation-refund-preview v20. Rotinas financeiras DEV preservadas. pms-launch-compat preserva as operações anteriores de produção e incorpora apenas listingsAction com escopo de imóvel e permissão manage_listings; não equivale à versão completa do PMS DEV.

Ambiente Vercel: quatro variáveis de release públicas configuradas; domínio atribuído somente após verificação; autoAssignCustomDomains restaurado para true. Proteção das prévias mantida (all_except_custom_domains). Não expor chaves privadas, backups, URLs privadas iCal ou sessões em relatórios públicos.

## Airbnb e testes

Signature 19–21/10: R$1419 em ambos. Amore 17–19/10: R$1491,75 em ambos. Essenza 17–19/10: site R$1531,65, Airbnb R$1533,65. Login do anfitrião confirmou limpeza Airbnb R$292; site mantém os R$290 solicitados. Nenhuma configuração Airbnb/Booking/PriceLabs foi alterada. Captura airbnb-essenza-cleaning-292.png.

Suíte final em 01972b18: 488/488, zero falhas, zero ignorados, duração ~54s; outputs/launch-final-tests-20261011.tap. Testes automatizados são complementares às jornadas reais, não substitutos.

## Limites e retorno

Esta é aprovação do lançamento comercial parcial; não é homologação integral de checkout, estornos, caução, social ou PMS financeiro em produção. Pendências sociais/vídeo permanecem no DEV, desativadas publicamente. As três publicações de vídeo de teste foram removidas do DEV com backup; dez objetos de mídia associados ainda aguardam remoção física via Storage (não estão no feed). Aviso já existente de proteção contra senhas vazadas no Supabase permanece; não foi alterado plano ou contratado serviço.

Retorno frontend: promover `dpl_GfCE3VYLNmxwSorGBUPYQjU6ys41`, commit `9bc9e0e7d3b9d18bb643e724f999ff37f64bc2fc`, então repetir consulta e conferir aliases. Isso não restaura dados/funções. Manter guardas financeiras e endpoints QA fechados. Backup privado integral e versões anteriores das funções estão em work/private-backups; a migration é aditiva e deve permanecer se houver apenas retorno visual. Restaurar banco somente com comparação e plano específico para não sobrescrever novos registros/importações. A limpeza autorizada não deve ser revertida automaticamente.
