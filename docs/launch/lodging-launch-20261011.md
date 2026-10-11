# Primeira etapa: Escapada e preço total — 11/10/2026

Implementação incremental na branch feature/staged-whatsapp-launch, partindo do conteúdo mais recente e0d9c76. Código candidato 0240247f630142fcf18b7e49150b198edf933c0b. Nenhuma publicação, promoção, alteração de configuração ou dados de produção.

## Ambientes confirmados
DEV pxfqmnhqodqyaaqeyjgr; PROD irxsaladqhbzhkoaclxy. Projetos Supabase ativos. Vercel chalezinho-ville, prj_qXld7h9Z3I7mV9mZKuXJ4yQ1j3dc, equipe team_YfhCyXyWKAtieREJ6eXj3szW; deployment candidato de preview, target null. Autenticação de deployment preservada.

## Mudanças
O endpoint público só apresenta Escapada de hospedagem, sem experiências ou alternativas reembolsáveis. Configuração e catálogo completos permanecem no motor autenticado de homologação. Oferta pública renomeada Escapada, sem produtos ou desconto de pacote. O plano público aplica zero acréscimo; planos do checkout completo não foram alterados.

Limpeza DEV: R$290 nos três chalés. Resumo e mensagem apresentam apenas total, datas, noites, hóspedes e Seleção: Escapada, sem valores de diária, limpeza ou desconto separados. Mensagem pede finalização pelo atendimento, sem confirmação. O total é reconfirmado antes de preparar o link; mudanças pedem nova confirmação. Falhas invalidam o resumo e link anteriores. Cópia manual funciona quando a área de transferência não está disponível.

Preço e desconto calculados exclusivamente no servidor com o motor existente priceStayOffer. PriceLabs fornece as diárias; limpeza não recebe desconto. DEV features.channel_pricing.last_minute contém enabled true, discount_bps 500, horizon_days 7. Essa regra foi inferida da comparação de noites na fronteira de 7 e 8 dias, não lida da configuração privada do Airbnb. Não há integração automática das promoções do Airbnb: revalidar se mudarem. Não foi zerado ou apagado o cadastro de tarifas para o checkout completo.

## Comparação real no Airbnb (2 hóspedes, BRL)
Consulta pública no navegador remoto, com modal de detalhes do preço, sem iniciar reserva.

| Chalé | Datas | Site DEV | Airbnb | Resultado |
| --- | --- | --- | --- | --- |
| Signature | 17–19/10 | R$1.755,85 | R$1.755,85 | Igual |
| Amore | 17–19/10 | R$1.491,75 | R$1.491,75 | Igual |
| Essenza | 17–19/10 | R$1.531,65 | R$1.533,65 | Site R$2 menor |
| Signature | 18–20/10 | R$1.505,00 | R$1.505,00 | Igual; desconto só na diária de 18/10 |
| Signature | 19–21/10 | R$1.419,00 | R$1.419,00 | Igual; sem desconto |
| Signature | 24–26/10 | R$1.650,00 | R$1.650,00 | Igual; sem desconto |

Essenza: PriceLabs R$1307, Airbnb bruto R$1599 (diferença R$292), desconto R$65,35. Com limpeza solicitada de R$290 o site fica R$2 menor. Pendente conferir e alinhar a configuração do anúncio Essenza no Airbnb; não alteramos esse anúncio nem inventamos um acréscimo adicional. Não declaramos paridade universal para todos os períodos, hóspedes ou promoções futuras.

## Validação
468 testes automatizados passaram, incluindo regras, calendários, autorização, checkout, PMS, financeiro e mídia. Sintaxe e TypeScript passaram. Depois do ajuste no texto de busca, 13 testes afetados passaram. Fixtures/JSDOM não substituem homologação real.

Navegador remoto real: vitrine → Ville Moments → seleção Signature 17–19/10 → resumo → botão continuar, em desktop e conteúdo 390×740. Sem login de visitante. Vitrine e Ville Moments mostram o mesmo total consultado. Link wa.me decodificado comparado ao resumo: igualdade exata, exceto saudação acrescentada. Botão copiar verificou alternativa textarea porque clipboard indisponível no navegador remoto. Nenhuma mensagem enviada; abertura de aplicativo WhatsApp em aparelho físico não testada.

Requests reais ao endpoint público: start_payment, create_reservation, hold, consult_start_payment com tentativa de perfil checkout/persist true retornam 403 consultation_operation_not_allowed. Injeção de experiência em quote retorna 403 experiences_not_available_in_launch. Quotes reais têm quote_id null e experiências vazias. Leitura no motor de checkout DEV preserva as opções refundable e non_refundable, sem persistir consulta. PagBank e contratação completa não foram repetidos em navegador neste ajuste; suas implementações e testes anteriores permanecem.

Contagens antes/depois: reservas30; holds/pending0; pagamentos34; quotes346; bloqueios calendário2; notification_outbox136. Mesmas contagens após consultas e teste de mensagem. Atualização de cache de vitrine é permitida e separada de reserva. Sem cobranças, reservas fictícias, holds, bloqueios ou notificações de confirmação. Calendários reais e regras de mínimo permanecem: vitrine real apresenta feriados de 3 noites e oculta chalés ocupados.

PMS nesta execução: conferidos cadastros de limpeza dos três chalés, oferta ativa sem produtos, produtos/tarifas preservados e permissões do motor nos testes. Não foi repetida a homologação de todos os formulários do PMS em navegador; consultar relatórios anteriores e revalidar antes de produção. A configuração da promoção é administrativa no banco, sem novo formulário PMS nesta entrega.

## Produção e retorno (não executados)
Após autorização: confirmar limpeza e promoção no Airbnb dos três anúncios; comparar novamente períodos de 2 e 3 noites; revisar configuração PROD sem copiar IDs DEV; aplicar limpeza290 e promoção de canal equivalente, oferta Escapada sem produtos; instalar código do motor compartilhado e endpoint allowlist; configurar explicitamente perfil WhatsApp e referência PROD no build segundo procedimento de lançamento existente; testar preview ligado ao ambiente autorizado; só depois publicar deployment aprovado. Preservar bloqueios, reservas e financeiro existentes.

Retorno: redeploy do frontend candidato anterior e0d9c76/c2e3df1, função DEV booking-engine v67 (fonte preservada), restauração das configurações comerciais anteriores se desejada: limpeza CH1 150; CH2/3 292; remover apenas features.channel_pricing criado nesta execução; nome anterior da oferta hospedagem-only 'Escapada · hospedagem e limpeza'. Não restaurar backup completo de dados, apagar históricos ou desfazer reservas legítimas. Produção continua na sua versão anterior, sem necessidade de rollback nesta execução.

Prévia validada: https://chalezinho-ville-4vo8spzxl-roldneicosta-4140.vercel.app/index.html?view=site#estadias-completas

Evidência visual: evidence/lodging-launch-mobile-20261011.jpg. Igualdade da mensagem confirmada em desktop e conteúdo 390px, sem envio.
