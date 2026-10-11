# Escapadas Ultra Premium — 11/10/2026

Executado somente no DEV `pxfqmnhqodqyaaqeyjgr`, branch `feature/staged-whatsapp-launch`. PROD `irxsaladqhbzhkoaclxy` consultado apenas para confirmar taxas comerciais. Vercel `prj_qXld7h9Z3I7mV9mZKuXJ4yQ1j3dc`, equipe `team_YfhCyXyWKAtieREJ6eXj3szW`. Nenhuma publicação, promoção ou alteração de produção.

## Comercial e geração

Duas configurações ativas: **Escapada Ultra Premium · à vista** e **Escapada Ultra Premium · cartão**, com a mesma composição aprovada (pétalas/ambientação, frutas, escolha Vinho/Espumante e queijos). Experiência R$539 à vista ou R$569 no cartão, até 4x sem juros. O parcelamento anunciado pertence à experiência; hospedagem é consultada no atendimento.

Três chalés, duas pessoas, 2 e 3 noites. Janela móvel de **check-in nos próximos 21 dias**, a partir de amanhã no horário de Guarapari. Em 11/10: entradas de 12/10 até 01/11; a saída pode ocorrer até três noites depois da última entrada. Janelas são calculadas a partir dos calendários, mínimos de noites, regras, capacidade/antecedência da experiência e PriceLabs existentes. Prioridade a gaps reais e opções econômicas. Nas sugestões de fim de semana, chegadas sexta/sábado são priorizadas sobre entradas de domingo. A cotação é recalculada na seleção e antes do WhatsApp.

Mantida regra existente: desconto de 5% na composição de segunda a quinta; noites em fins de semana e feriados sem esse desconto. Duas condições explicitamente nomeadas, sem escolha silenciosa da forma de pagamento. A tarifa do card identifica a cotação; na revisão, o visitante precisa escolher Reembolsável ou Não reembolsável. Vinho/Espumante também precisa ser escolhido antes de continuar.

Taxas DEV alinhadas ao catálogo vigente lido em PROD: Signature R$150; Essenza e Amore R$292. Antes DEV tinha R$290 nos três. Mudança auditada e sem alteração dos contratos históricos. O catálogo antigo de R$1 e escapadas de QA continuam pausados/arquivados.

## Expiração

As sugestões são ocorrências calculadas, não reservas nem registros falsos de hospedagem. Seu cadastro-base continua ativo e gera novas datas. Entradas passadas desaparecem da vitrine; links antigos são rejeitados pelo servidor. Datas além do horizonte de 21 dias também são recusadas para essas escapadas. A identidade do cache inclui a data brasileira e o catálogo; CDN não atravessa meia-noite com sugestões anteriores. Página aberta retira cards expirados a cada minuto.

Para escapadas cadastradas com início/fim fixos, `end_date` significa última saída. A rotina privada `stay_internal.pause_expired_offers()` pausa quando `end_date - min_nights` fica antes da data brasileira atual. Não espera o checkout para permitir uma entrada que já passou. Job `stay-offer-expiry` executa no minuto 3 de cada hora; reads públicos rejeitam a oferta imediatamente, mesmo antes do job. Auditoria registra pausa automática. Não há reativação automática de cadastros manualmente pausados.

## Evidências

- Suíte completa: **449 testes aprovados**, zero falhas; sintaxe, TypeScript e build WhatsApp aprovados. Testes afetados após mudanças finais também aprovados. Fixtures/JSDOM são evidência de código, não aparelho físico.
- API real DEV: **24 sugestões** cobrindo chalés, durações, categorias e condições. Todas conferidas contra novas cotações com `quote_id:null`. Arquivo `ultra-escapadas-api-20261011.json` contém datas/totais verificados, sem dados de hóspedes. A primeira consulta real e a revisão da priorização de fins de semana foram validadas separadamente.
- API real recusou entrada passada, fora de 21 dias, duração de uma noite, operações de pagamento e hold. Atualização de oferta compartilhada pelo Ville Moments conferiu o mesmo total.
- SQL DEV real: oferta transacional com última entrada ontem foi pausada, com auditoria. ROLLBACK removeu integralmente o cadastro e evento de teste. `anon` sem EXECUTE da rotina privada.
- Chrome remoto real: home carregou os 24 cards, condições explícitas e filtros 2/3 noites. Entrada da vitrine chegou à revisão Amore 19–21/10, com ambas tarifas desmarcadas. Seleção explícita de Não reembolsável exibiu total R$1.722,63: hospedagem R$982,30 + limpeza R$292 + Ultra R$539 - desconto R$90,67. Escolha de bebida encontrou proteção de credenciais do navegador, que continuou restringindo observação após recarregar. **Não declarar a jornada visual completa de WhatsApp homologada nesta atualização.** Mensagem/resumo, reconsulta e invalidação têm evidência JSDOM; preços têm evidência de API real.
- Nenhum teste enviou mensagem real, criou pagamento ou reserva. Nenhum aparelho físico utilizado.
- PMS: configuração e status persistidos conferidos via SQL/API, catálogo público conferido e pausa automática testada. Nova condição cash/card tem campo no editor e validação do servidor; roundtrip autenticado visual desse novo campo permanece pendente. Testes históricos do PMS continuam em `staged-whatsapp-20261011.md`.

## Ausência de bloqueios e efeitos financeiros

Antes/depois: 30 reservas, 34 pagamentos, 346 cotações persistidas, 2 bloqueios, 14 pedidos de experiências, 30 tarefas PMS e 136 notificações. Nenhuma nova reserva/pagamento/cotação durante esta execução. Digest integral de reservas estável `f6e4d95aa4e607d7fc68ce64f9f7ceaa`.

O digest integral de pagamentos mudou por `updated_at` de pagamentos sandbox históricos durante o cron financeiro já existente; ele permaneceu ativo conforme solicitado. Isso não deve ser apresentado como igualdade integral das linhas financeiras. Todos os registros afetados foram criados antes da execução. Digest dos campos financeiros estáveis `a71d9ea03c9842dceb7610bd7bcc7085`, conferido em duas leituras após consultas reais, e ausência de novos pagamentos servem para separar reconciliação legítima de qualquer nova cobrança da consulta. Não foram desativadas as rotinas financeiras, notificações ou importação de calendários.

Endpoint público permite somente leituras, repassa consulta sem persistir cotação e recusa pagamento/hold no servidor. Condições comerciais das novas experiências também impedem iniciar pagamento antes de hold no checkout original. Formulas de preço continuam no motor, incluindo limpeza, tarifa, composição e desconto. Cadastros não geram notificações ou tarefas de experiências.

## Produção e retorno

Mudanças revisáveis: migration `20261011123523_ultra_escapada_expiry.sql`, funções/shared e editor desta branch; dados DEV em `ultra-escapadas-dev.sql` como referência de homologação, **não executar cegamente em PROD**. Primeiro concluir os pré-requisitos de schema/ambiente/public-consultation do relatório de lançamento, homologar os dados comerciais PROD e limpar exposição de QA preservando histórico. Produção ainda contém catálogo/configurações antigos apontados no relatório anterior.

Após autorização posterior: preparar migration mínima compatível com PROD (sem aplicar todas as migrations DEV), configurar perfil WhatsApp explicitamente, registrar os pacotes comerciais e escapadas, aplicar a proteção de servidor/expiração, construir a candidata com variáveis PROD, validar e somente então promover mediante autorização. Testar em celular físico e concluir validação visual bebida → mensagem/cópia e editor PMS antes de declarar primeiro lançamento pronto.

Retorno desta alteração DEV: pausar as duas novas escapadas, preservar seus cadastros/auditoria; se necessário desativar apenas `stay-offer-expiry` via `cron.alter_job`, sem tocar outros jobs. Restaurar o código anterior `4d05b96`/Edge da mesma versão após pausar as escapadas comerciais. Taxas DEV anteriores eram R$290, só restaurar se o objetivo for reproduzir a homologação antiga. Nunca desfazer contratos financeiros nem excluir reservas/publicações/mídias. Retorno de produção deve usar o deployment PROD READY efetivamente vigente, capturado antes da publicação autorizada; não promover esta prévia DEV.
