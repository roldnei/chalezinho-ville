# Campanha Chalezinho Ville — preparação de 26/10/2026

## Estado real
Material de campanha pronto; NÃO cadastrado nem ativado no Google Ads. Google Ads exigiu autenticação. Nenhum orçamento ou gasto autorizado. Código preparado em branch isolada, baseado no commit publicado 1efbbf7. Não publicado. A versão main do repositório é antiga e não deve ser usada para publicar este trabalho.

## Arquivos
- anuncios-editor.csv: quatro anúncios responsivos em três grupos, todos pausados; títulos <=30 e descrições <=90 caracteres, verificados por script.
- palavras-chave-editor.csv: 24 critérios (12 buscas, exata/frase). Sem estimativas inventadas de volume/CPC.
- negativas-editor.csv: 18 expressões negativas; revisar termos reais antes de ampliar.
- sitelinks.csv: quatro links complementares; mapear e conferir no Google Ads.
- configuracao.json: proposta sem orçamento e sem data de início.
- controle-atendimentos.csv: estrutura de controle, sem registros fictícios.
- painel-diario.csv: cabeçalhos do relatório, sem resultados inventados.

Importar pelo Ads Editor com prévia, mapear cabeçalhos e conferir erros antes de postar. Não é um backup de conta nem um upload já aplicado. Não ativar anúncios durante a importação. Configure campanha/grupos na conta antes de importar anúncios e critérios. A conta pode exigir ajustes de idioma nos nomes dos campos. Mantenha a campanha pausada até concluir a configuração e o teste.

## Estratégia inicial
Uma campanha de Pesquisa concentra o orçamento. Grupos: piscina/spa (Signature), hidromassagem (dois anúncios, Essenza e Amore) e romântico em Guarapari (coleção). Google pode favorecer um dos anúncios de hidro: isso não é um teste A/B aleatório. Não dividir o mesmo termo de hidro em dois grupos concorrentes. Na busca genérica, excluir termos de piscina/spa/hidro/banheira para direcionar intenção aos grupos específicos. Rever variações e correspondências próximas no relatório real. Campanha de marca só se dados justificarem, separada para não inflar resultado de novos clientes.

Proposta inicial de geografia: Espírito Santo, opção presença, idioma português e todos os dispositivos. É hipótese de partida, não uma conclusão sobre origem dos hóspedes. Expandir para MG/RJ somente com orçamento e dados de reservas. Nenhuma restrição por idade ou renda. Só Pesquisa; parceiros e Display desligados inicialmente. Sem Performance Max nesta fase. Não habilitar recomendações automáticas ou expansão automática de URL/textos sem revisão.

O destino genérico usa ?view=site#colecao para manter a coleção do site no celular. Destinos específicos vão ao chalé correto, depois reservar.html com código do chalé. Não ativar nem misturar com o teste A/B mobile-home-v1.

## Orçamento proposto, ainda não aprovado
Cenários: R$600/mês (R$19,73/dia), R$900/mês (R$29,60/dia), R$1500/mês (R$49,34/dia), arredondados para baixo sobre 30,4. São opções de investimento, não previsões de reserva. Google pode gastar até duas vezes a média diária em determinados dias para a maioria das campanhas; os limites mensais dependem das regras da conta e de alterações de orçamento. Não tratar orçamento diário como teto rígido. Definir teto e duração antes da ativação.

Escolher teto de CPC após Planejador de Palavras-chave e leitura do mercado na conta. Começar com controle de cliques e teto; não definir CPA/ROAS com dados inexistentes. Não fixar metas de conversão sem qualidade e volume. Exemplo meramente ilustrativo: reserva de R$1500 com CAC permitido de 8%=R$120. Se 10% dos pedidos qualificados reservam, CPL máximo R$12. Usar margem de contribuição real, custos variáveis, cancelamentos e capacidade para calcular o limite.

## Medição preparada no código
ads-measurement.js é independente do A/B e está desativado em app-config.js. Ao informar IDs reais e ativar marketing.enabled, apresenta aceitar medição/somente necessários, impede tags antes do aceite, respeita DNT/GPC/exclusão local e permite alterar a escolha. Não dispara evento de reserva. Integra páginas, consultas, resumo e WhatsApp. Só aceita UTMs das campanhas planejadas. Armazena identificadores de clique localmente após aceite, por até 30 dias. Texto de WhatsApp preserva preço/datas e acrescenta origem/referência VA quando houver atribuição consentida. Eventos não enviam nome, telefone, e-mail, documento, datas ou motivo da viagem. Tags usam caminho sem query. Configuração inicial nega dados fornecidos pelo usuário e personalização. Não habilitar medição automática adicional, formulário ou coleta de dados pessoais sem revisão.

Eventos GA4: page_view, view_item, search_started, search_completed, consultation_prepared, whatsapp_clicked, summary_copied. whatsapp_clicked é conversão SECUNDÁRIA. Escolher só uma fonte para essa conversão: tag Ads direta OU importação do GA4, evitando duplicidade. Reserva confirmada é a meta comercial principal futura, validada no servidor/PMS, nunca no clique. Não incluir cliques secundários em meta personalizada usada para lances.

LIMITAÇÃO CONCRETA: a captura local de GCLID e referência VA ainda não é um vínculo durável no PMS e não permite importar reservas sozinha. Precisa concluir integração do servidor: registrar lead com referência+identificador de clique consentido, consulta, imóvel/datas/hóspedes; permitir apenas administrador ativo vincular uma reserva existente/confirmada; verificar correspondência, origem direta e criação posterior ao clique; ler valor real do banco; deduplicar por reserva; tratar cancelamento/estorno; exportar ao Google Data Manager e conferir aceitação. Não afirmar ROAS por reserva enquanto essa ligação não for validada. Não usar a tabela de A/B como substituta: ela cobre apenas entradas móveis elegíveis na home.

## Conta Google: execução pendente de login
1. Confirmar conta/CID, moeda BRL, fuso America/Sao_Paulo, acesso e faturamento. Não criar conta ou aceitar termos automaticamente.
2. Confirmar/criar propriedade GA4 e fluxo web correto; obter G-..., AW-... e rótulo secundário, habilitar codificação automática e vincular Ads/GA4.
3. Conferir política de privacidade e configuração de consentimento à luz das tags efetivamente usadas. IDs vazios não devem ser substituídos por exemplos.
4. Concluir o vínculo durável com PMS e fonte de conversões off-line; escolher o conector/formato vigente da Central de dados e validar um evento de ensaio na propriedade de teste.
5. Inserir IDs na configuração, publicar o perfil WhatsApp correto e homologar móvel/desktop: busca, preço indisponível, alteração de total, abertura/cópia, rejeição/aceite, cancelamento e deduplicação.
6. Importar os arquivos pausados; configurar negativas entre grupos, locais, idioma, orçamento aprovado, lances e sitelinks. Conferir URLs e revisão de anúncios.
7. Ativar só após escolher investimento/duração e validar medição. A autenticação permite preparar a conta, não define um valor de gasto.

## Atendimento e rotina operacional proposta
Resposta rápida com resumo do período; registrar referência e pedido efetivamente recebido. Estados: recebido, qualificado, proposta, confirmado, perdido, cancelado. Não pedir informações já fornecidas na mensagem. Motivos de perda: preço, datas, localização, capacidade, não respondeu, outro. Separar contato sem datas de pedido qualificado. Concluir atendimento não significa pagamento/reserva confirmada.

Diariamente: gastos, reprovações, URLs, falhas, disponibilidade e resposta; termos claramente irrelevantes; registrar pedidos/reservas. Sem alterar estratégia todos os dias. Sem rotina automática criada nesta entrega.
Semanalmente: comparar campanha/grupo e dispositivo; custo/pedido qualificado, custo/reserva, receita e cobertura de atribuição. Não somar únicos de dias para obter pessoas únicas. Relatório de volume diário separado de conversão por coorte do dia de clique, para respeitar atraso no fechamento. Não inferir causalidade ou novos clientes únicos só a partir de UTMs; confirmar primeira estadia no PMS.
Após 30 dias propostos e pelo menos um ciclo completo de venda, revisar viabilidade; alongar se houver poucos dados. Não prometer resultado nem declarar vencedor com poucas reservas. Google Ads de marca separado de aquisição genérica. Excluir testes e equipe. Acompanhamento só começa após ativação real.

Fórmulas: CPC=gasto/cliques; CPL=gasto/pedidos qualificados recebidos; CAC=gasto/reservas confirmadas atribuídas; ROAS bruto=receita confirmada atribuída/gasto; cobertura=reservas com origem verificável/reservas diretas do período. Denominador zero significa sem base, nunca zero de custo. ROAS não é lucro. Ajustar cancelamentos em relatório separado e por coorte.

## Referências oficiais consultadas em 26/10/2026
- https://support.google.com/google-ads/answer/7684791
- https://support.google.com/google-ads/answer/10486637
- https://support.google.com/google-ads/answer/11461796
- https://support.google.com/google-ads/answer/7012522?hl=pt-BR
