# Ville Faxinas — validação de 13/10/2026

Módulo independente implementado no repositório roldnei/chalezinho-ville. Base de inspeção: 2730681, branch feature/multichannel-operations-20261012; avanços até 6804f1d incorporados (Ville Moments, preferências e proporção de ofertas preservados): correção de campos de data no iPhone e conclusão guiada do PMS. Regras de preparação/saída do PMS mais recentes preservadas no adaptador. Produção, checkout e pagamentos de hospedagens não foram publicados ou substituídos por este trabalho.

## Acesso e fluxos

- `faxinas.html`: entrada pública, contratar ou trabalhar; os dois papéis na mesma conta.
- `faxinas-admin.html`: administração exclusiva. O servidor revalida cada ação; esconder botões não é o controle de acesso.
- Login: uma tela; criação de conta: uma tela com nome, celular, e-mail e senha compatível com o Auth existente. Novos usuários precisam confirmar o e-mail. Há tela de confirmação, reenvio, correção de acesso e recuperação do login quando o Auth informa e-mail não confirmado. Contas já confirmadas usam o mesmo acesso; telefone informado não é apresentado como verificado.
- Perfil: uma tela curta. A parte profissional aparece somente quando escolhida.
- Imóvel: duas telas; foto não é obrigatória. Metragem desconhecida exige análise ou preço administrativo explícito, sem metragem inventada.
- Pedido: duas telas após cadastrar o imóvel: dia/janela e revisão do preço/escopo/termos. Um imóvel é selecionado automaticamente.
- Profissional: uma tela de ofertas para decidir; uma tela do serviço para começar, conferir itens, enviar fotos e terminar. A foto tem prévia, confirmação e opção de refazer.
- Conferência: uma tela; avaliação opcional em um formulário curto. Estrelas não condicionam o repasse.

## Implementado

Tabela inicial editável com os oito valores solicitados; menor categoria que comporta simultaneamente todos os limites. Franquia por quarto, tratamento de quarto misto e adicional de R$ 5 em configuração. Tipos de cama, escopo, adicionais, taxas, duração, deslocamento, prazos, distribuição e piloto editáveis.

Valores em centavos e taxas percentuais em pontos-base. Taxas independentes dos dois lados e exceções por participante. Cópia de preços, escopos, adicionais, taxas, condições e versão dos termos na contratação. Aceite da profissional recalcula sua exceção de taxa e exige conferir o líquido mostrado.

Cadastro público, interesse registrado, liberação individual e aprovação profissional. Favoritas e nova contratação. Uma pessoa pode ser proprietária e profissional. Administração e auditoria separadas do PMS; acesso às faxinas não dá acesso ao PMS.

Atribuição transacional com bloqueio de agenda e intervalo de deslocamento. Pix tem ledger, idempotência, confirmação por consulta autenticada ao PagBank após webhook assinado, expiração conciliada, isolamento de pagamento tardio/duplicado, devolução e estados distintos de repasse. Nenhuma cobrança nasce apenas porque a tarefa foi gerada. Retorno de página não confirma pagamento.

Fotos em bucket privado, vinculadas a imóvel/serviço/item/autor/data; objetos sem substituição. Endereço e acesso são ocultos antes da confirmação. Checklist salvo por item; fila IndexedDB por conta, envios pendentes e nova tentativa. O servidor impede finalizar sem evidências obrigatórias. Ocorrências dos dois lados com resposta, fotos privadas, prazo e resolução administrativa, sem descontos automáticos.

Avaliações bilaterais com publicação conjunta ou por prazo; nota/comentário não podem ser editados pela moderação. Conteúdo abusivo pode ser ocultado ou reexibido com justificativa auditada; média e quantidade só consideram avaliações publicadas e não ocultadas.

PMS: vínculo por imóvel e controles independentes de exibição/geração, com autorização no PMS para vincular. Uma rotina vinculada por estadia/finalidade. Futuras entradas usam a preparação operacional; hospedagens em andamento podem gerar limpeza após a saída. Conferência de saída e suas fotos continuam separadas. Horário/andamento/responsável/conclusão são projetados na tarefa; a tela do PMS consulta as fotos da plataforma com a autorização própria. Não há duplicação de arquivos de foto.

Estadias encerradas, checkout registrado, registro de saída do proprietário, testes, cancelamentos ou hospedagem ainda pendente de confirmação não geram novas rotinas. Bloqueios/iCal ambíguos não são convertidos pela plataforma em reservas. Alterações de contratos aceitos ficam sinalizadas; não cancelam silenciosamente serviços. Novo horário exige consentimento dos dois lados e nova checagem de agenda, mantendo o preço aceito. Correções exigem iniciar outra etapa e enviar uma nova foto. O tempo de execução soma etapas ativas e exclui espera pela conferência. Desativar preserva histórico; reativar reconcilia somente elegíveis, sem duplicidade. A criação é sugestão, sem contratação ou pagamento automático.

Dois jobs novos e independentes de manutenção/conciliação executam a cada cinco minutos no DEV, usando o mecanismo protegido já existente; os jobs anteriores não foram modificados. Função Edge nova `cleaning-platform`; as funções de hospedagem não foram substituídas.

## Evidência e limites

- Regressão completa final: 618/618, incluindo os avanços incorporados do PMS e as mudanças finais da plataforma; log `full-tests.txt`.
- Suíte específica atual: 66/66, ver `local-tests.txt`; inclui preços/camas/taxas, concorrência, privacidade, configuração, evidências, ocorrências, avaliações, PMS, estados financeiros controlados e interface DOM com falha de conexão.
- API publicada: `remote-smoke.json` (entrada pública e negação sem login).
- API autenticada publicada: 21 verificações em `remote-authenticated-tests.json`, com Auth e Postgres reais, quatro contas QA e propriedades fictícias próprias. Cadastro, piloto, preços, disputa de aceite, conflito de agenda, isolamento e bloqueio de Pix foram reais chamadas do endpoint.
- A execução/fotos/conferência/avaliações remotas usaram um serviço explicitamente marcado como teste, com **estado inicial de execução simulado no DEV**. Não houve Pix ou repasse. Fotos QA foram efetivamente salvas e lidas por URL assinada.
- As contas QA foram bloqueadas para novos serviços e perderam aprovação/liberação/administração das faxinas. Histórico de evidências permanece privado e identificado como teste. Serviços de teste ficam fora de ofertas e não podem criar pagamentos.
- Após instalação e testes: mesmos 26 registros operacionais de hospedagem, 56 tarefas do PMS, 30 reservas e 34 pagamentos de hospedagem. Zero pagamentos de faxina e nenhum vínculo dos imóveis QA ao PMS.
- Revisão de segurança Supabase: sem privilégios de tabelas/RPCs das faxinas para anon/authenticated; RLS em todas as tabelas e bucket privado. Avisos informativos de RLS sem política são intencionais: o acesso passa exclusivamente pelo endpoint autenticado. Aviso anterior de proteção de senhas vazadas não foi modificado.
- Verificação de interface por DOM/CSS, com fonte relativa e botões de 52 px. **Validação visual em navegador real/celular, câmera real, fonte ampliada e rede limitada ainda não realizada:** o navegador de QA indicado pelo ambiente não está disponível. Não há screenshots apresentados como prova de dispositivo real.

## Bloqueios financeiros e configurações para operação real

A versão continua publicada somente para validação. O modo **Pix manual** usa uma chave da administração e dispensa integração PagBank: exige cadastrar/liberar a chave, conferir identidade/titular/chave das profissionais, conferir créditos no banco e registrar repasses/devoluções já realizados. Dinheiro real deve usar o ambiente de operação real, que ainda não foi publicado por este trabalho. A lista abaixo se aplica **se o PagBank for escolhido**; suas pendências não bloqueiam o modo manual.

1. Conta/aplicação PagBank habilitada especificamente para marketplace/split, Pix com custódia e autorização dos recebedores. A integração de hospedagem não comprova isso.
2. Credenciais próprias do módulo no servidor: `CLEANING_PAGBANK_SANDBOX_TOKEN` ou `CLEANING_PAGBANK_PRODUCTION_TOKEN`, `CLEANING_PAGBANK_PLATFORM_ACCOUNT`. Não copiar credenciais de hospedagem para presumir habilitação.
3. Homologar criação/consulta, assinatura real de webhook da API Order, expiração, pagamentos repetidos/tardios, estorno e liberação de custódia. A documentação usa um formato de assinatura diferente para algumas outras APIs; notificações sem assinatura confiável são recusadas.
4. **Concluir e homologar a integração de liquidação/EDI**, com fonte de confirmação do recebimento efetivo e conciliação de taxas do intermediador. O ledger possui a observação privada de liquidação, mas não há conector EDI habilitado neste ambiente. `CLEANING_SETTLEMENT_INTEGRATION` permanece ausente; não configurar `verified` sem concluir essa integração e testar os valores líquidos. Liberação de custódia só move para processando.
5. O PagBank pode liberar custódia automaticamente em seu prazo máximo. Definir uma janela que cubra serviço/conferência/ocorrência e não prometer retenção indefinida. A criação é bloqueada quando o serviço excede a janela configurada.
6. Verificar identidade e recebimento dos participantes reais, cadastrar a referência de autorização e liberar individualmente. Nada foi enviado a profissionais/proprietários externos.
7. Os imóveis ativos autorizados no PMS são carregados automaticamente na conta proprietária do mesmo ambiente ao entrar/salvar perfil. Completar endereço, cidade/bairro, quartos, banheiros, camas e dados de limpeza que não existem no PMS. Área continua desconhecida até informação ou orçamento assistido. Definir profissional/regra e habilitar a geração automática separadamente na administração.
8. Revisar juridicamente termos, cancelamento, privacidade e tratamento de ocorrências. São propostas para revisão, não garantia de isenção ou seguro.
9. Verificar URLs de retorno do Auth para o domínio definitivo de validação. A prévia mantém a proteção de acesso da Vercel existente.

Referências oficiais consultadas: [Pix com split](https://developer.pagbank.com.br/reference/pedido-com-divisao-de-pagamento-com-pix), [custódia](https://developer.pagbank.com.br/reference/crie-e-pague-um-pedido-com-custodia), [liberação](https://developer.pagbank.com.br/reference/liberar-divisao-de-pagamento-com-custodia), [cancelamento](https://developer.pagbank.com.br/reference/cancelar-pagamento), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage privado](https://supabase.com/docs/guides/storage/security/access-control).

## Operação e retorno

Publicação autorizada somente da prévia. Para interromper: desabilitar a geração por imóvel e pausar somente os dois jobs `cleaning-marketplace-*`; preservar tabelas/evidências/histórico. Retorno da interface é o deployment anterior. Nunca apagar o ledger ou copiar fixtures DEV para PROD. Produção exige revisão das migrações, dependências financeiras e validação visual antes de um novo pedido de publicação.

## Ajuste de conta e importação do PMS — 13/10/2026

- Importação idempotente no carregamento autenticado. Administrador ativo do PMS pode importar imóveis ativos; anfitrião importa apenas seus `pms_property_ids`. Participante da plataforma ou administrador exclusivo das faxinas não ganha acesso ao PMS. Conta bloqueada não importa. Identidade vem de `Auth.getUser()`, nunca de um ID enviado pelo navegador.
- Importamos identificador, nome e tipo existentes, sem copiar taxa de limpeza da hospedagem nem presumir endereço, área, quartos, banheiros ou camas. Campos numéricos faltantes são nulos. Imóvel incompleto não pode receber preço nem pedido, mesmo com exceção administrativa. Depois de completar, os dados são preservados em novas entradas.
- Vínculo existente pertence a um único imóvel/conta; importação não transfere propriedade nem sobrescreve dados preenchidos. Vincular ao PMS não ativa `Mostrar no PMS` ou geração automática.
- Novos usuários precisam confirmar e-mail, com reenvio e espera visíveis. O backend também recusa usuário autenticado sem `email_confirmed_at`. O serviço Auth real no DEV está com `mailer_autoconfirm=false`; não foi alterada a autenticação das hospedagens. Celular continua sem OTP nessa etapa.
- 78 testes do módulo passam, incluindo 12 novos testes de importação/isolamento/edição e confirmação/reenvio/negação no servidor. Evidência: `account-import-tests.txt`. A suíte completa atualizada está em `account-import-full-tests.txt`; um teste legado do Ville Moments foi atualizado para a nova regra existente de uma oferta por chalé, sem alterar seu comportamento.
- Sete verificações remotas de leitura passam com Auth e Edge reais: `account-import-remote.json`. Importação positiva também validada no Postgres DEV em transação revertida: escopo de um imóvel, ausência de suposições, idempotência, orçamento pendente e ausência de privilégios de execução para o navegador. Nenhum vínculo QA foi mantido.
- Após a transação revertida e chamadas HTTP: 26 estadias, 56 tarefas do PMS, 30 reservas, 34 pagamentos de hospedagem, zero pagamentos de faxina e zero vínculos QA ao PMS. Nenhuma alteração em produção.
- As contas de produção e DEV permanecem separadas. Não copiamos usuários, senhas ou vínculos administrativos entre ambientes. A conta usada deve ser a do PMS correspondente ao ambiente da plataforma.
- Entrega do e-mail na caixa real e retorno pelo domínio protegido da prévia ainda precisam de validação com um usuário convidado; os testes de interface/reenvio usam Auth simulado e não são prova de entrega SMTP. A exigência de confirmação e as chamadas remotas de Auth foram verificadas. URLs autorizadas de retorno devem incluir o domínio de validação.

## Pix manual para o começo do piloto — 13/10/2026

O pagamento inicial pode usar a chave Pix da administração. O cliente transfere no aplicativo do próprio banco. A plataforma informa a chave, o titular e o valor exato; não gera QR, não transfere dinheiro, não divide saldo e não oferece custódia de intermediador nesse modo. A configuração inicial do DEV foi alterada para `manual_pix`, mas permanece **desabilitada e sem chave real** até o administrador preencher os dados. A integração PagBank continua disponível para uso futuro.

Fluxo do cliente: aceite da profissional → ver chave/nome/valor → copiar chave e transferir no banco → “Já fiz o Pix” → aguardar conferência administrativa. O aviso não marca pagamento como recebido. Somente administrador autorizado e autenticado pode registrar o crédito, informando ID da transação, valor, data/hora e confirmação de conferência do extrato. A profissional continua sem endereço completo até a confirmação.

Após a limpeza e conferência, o repasse fica autorizado. A administração faz o Pix à profissional no banco e registra a transferência efetivada. A indicação “vou fazer o repasse” move apenas para processando; o registro do lançamento bancário com valor líquido exato move para pago. A tela identifica que o recebimento foi registrado pela administração e informa a data do Pix. O prazo de conferência após aviso (inicial: 120 minutos) e a previsão de repasse após aprovação (inicial: 24 horas) são editáveis e ficam nas condições aceitas, junto com preços e taxas. Não há desconto escondido ou promessa de saldo imediato.

Chaves de recebimento das profissionais ficam privadas. Elas podem informá-las após aprovação, sem aumentar o cadastro inicial. A administração confere identidade/titular/chave antes de emitir instruções de pagamento ao cliente. Alterar a chave exige nova conferência; instruções já emitidas preservam destino e destinatária registrados. A chave da administração não aparece na configuração pública nem no orçamento/contrato. Somente cliente responsável e administradores autorizados consultam a instrução de pagamento.

Regras de segurança financeira: um ID bancário não pode quitar dois pagamentos; repetição do mesmo registro é idempotente. Outra transferência é registrada separadamente para análise/devolução, sem contar como segunda contratação. Valor divergente fica em análise e não confirma serviço nem aplica desconto. Créditos tardios não ressuscitam atribuições expiradas. Devoluções exigem lançamento bancário efetivado e valor integral do crédito; o crédito válido de um serviço só pode ser devolvido após decisão administrativa. Ocorrência ou mudança aberta impede repasse. Evidências e destinos registrados não podem ser apagados/sobrescritos.

Condições anteriores não mudam de forma de pagamento silenciosamente. Contratos que já aceitaram PagBank exigem revisão administrativa para um novo acordo, enquanto novas solicitações usam o modo escolhido na configuração.

Validação final: **652/652 testes completos**, incluindo **98 testes do módulo** e 20 novos testes de Pix manual/contrato anterior/interface. Evidências: `manual-pix-full-tests.txt` e `manual-pix-tests.txt`. Interfaces testadas em DOM ligado ao Postgres local; Auth e lançamentos bancários desses testes são simulados, sem transferência real. O fluxo positivo também passou no Postgres DEV em transação integralmente revertida: instrução, aviso sem pagamento, crédito administrativo, idempotência e autorização/processamento/registro de repasse. A execução foi uma fixture explícita; não houve faxina ou banco real.

API Edge versão 5 publicada no DEV. Sete verificações HTTP públicas/negação sem autenticação estão em `manual-pix-remote-public.json`; não são testes de banco nem de sessão autenticada nessa versão. As verificações autenticadas anteriores permanecem como evidência das versões precedentes. Depois do rollback: 26 estadias, 56 tarefas, 30 reservas, 34 pagamentos de hospedagem, zero pagamentos de faxina, zero instruções manuais, zero lançamentos bancários e zero chaves reais cadastradas. Produção e fluxos de hospedagem preservados.

Para o piloto real: cadastrar chave/titular da administração e dados conferidos das profissionais; liberar os participantes; aplicar/publicar o módulo no ambiente real em etapa própria e configurar o ambiente de pagamentos correspondente; combinar quem confere o extrato e executa os repasses/devoluções. A conferência manual exige essa rotina operacional. PagBank, webhook e credenciais não são requisitos desse modo. Continua pendente a validação de e-mail em caixa real e a QA visual em dispositivo real, relatadas acima.

Referência: [Banco Central — receber Pix por chave ou dados de conta](https://bcb.gov.br/estabilidadefinanceira/pix-sobre).

## Listas com muitos cadastros — 13/10/2026

Participantes, imóveis/PMS, serviços administrativos e recebimentos aparecem em linhas de resumo. O botão com texto abre os campos apenas quando necessário. Pagamentos manuais e chaves das profissionais têm listas separadas; chaves bancárias ficam dentro da edição, fora do resumo e do índice de pesquisa.

Todas essas listas têm pesquisa sem distinção de acentos/maiúsculas, filtros por situação, opções de 10/25/50 itens e navegação anterior/próxima com contagem. A pesquisa considera todos os registros autorizados recebidos, não apenas a página visível. Participantes também podem ser encontrados pelo celular com ou sem pontuação. A lista de imóveis do proprietário continua filtrada pela conta, inclusive para administradores acessando a tela pública.

Na área do participante, imóveis e suas faxinas também usam pesquisa e paginação; o botão Editar/Completar do imóvel abre diretamente o cadastro de duas etapas, sem expandir outro cartão. A tela inicial mostra até quatro profissionais, com acesso ao catálogo completo pesquisável e filtro de favoritas. Resumos, filtros, botões e edição têm disposição responsiva, foco visível e rótulos de texto. Não há ação dependente de gesto escondido.

A troca de filtro ou página mantém os mesmos formulários e os valores digitados; uma marca avisa sobre alterações não salvas. Pesquisa/página/quantidade são lembradas durante esta aba, separadamente por conta e lista. Esses controles não salvam preços, permissões ou dados pessoais no armazenamento persistente e não alteram os endpoints existentes. Não há migração nem alteração de dados do PMS, pagamentos ou produção. A paginação é feita sobre o conjunto autorizado que a API já fornece; não é anunciada como paginação SQL para volume ilimitado.

Evidências: `lists-tests.txt` contém 11 cenários com 37 registros, incluindo última página, 10/25/50, acentos/celular, filtros combinados, lista vazia, preservação de edição, isolamento de conta/tela, nomes com HTML, envio da liberação/integração/Pix para o registro correto, imóveis de outros proprietários ocultos e pesquisa/favoritas no catálogo. Os lançamentos bancários desses testes são locais e simulados; nenhum dinheiro é movimentado.

A regressão completa passou em 663/663 testes (`lists-full-tests.txt`). Após o ajuste final para abrir a edição do imóvel direto no botão da linha, os 17 testes das listas/interface foram repetidos e passaram (`lists-ui-final-tests.txt`). O build mantém o ambiente DEV e publica o novo módulo de listas como asset. A verificação HTTP da prévia usa o conector autorizado da Vercel. O navegador remoto chegou à autenticação da Vercel, sem sessão; também não consegue acessar o servidor local. Por isso não há evidência nova de dispositivo real, zoom de fonte ou rede limitada, nem captura de tela apresentada como validação visual. A proteção da prévia permanece habilitada.

Referências de organização: [Carbon — data tables](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) e [Atlassian — DynamicTable](https://developer.atlassian.com/platform/forge/ui-kit/components/dynamic-table/).

## Correção de “Suas faxinas” para contas administrativas — 13/10/2026

A captura enviada mostrava dois serviços QA de outro proprietário na aba pessoal. A leitura administrativa da API inclui o histórico geral por autorização, mas a interface reutilizava esse conjunto integral em “Suas faxinas” e no resumo inicial. Essas duas telas agora usam apenas serviços cujo proprietário ou responsável é a conta atual, excluindo os marcados `is_test`. Gestão mantém o conjunto completo e as evidências; não houve exclusão, migração nem mudança de permissões. A tela vazia informa que nenhum pedido foi enviado e tem botão direto para pedir faxina.

O banco DEV e seu histórico foram consultados: a conta Roldnei Costa tem Signature, Essenza e Amore cadastrados, mas nenhuma solicitação registrada; os dois serviços da captura são QA, de outra conta. A ausência do pedido Signature é uma questão distinta; ainda depende de identificar o dia/horário e a resposta recebida ao enviar. Nenhuma contratação foi criada a partir dessa investigação.

Validação afetada: 19/19 testes em `personal-jobs-tests.txt`. Inclui conta administrativa na interface pessoal, serviço próprio, serviço atribuído, serviço alheio, QA próprio/alheio, busca/contagem sem QA, lista vazia e preservação integral do histórico em Gestão. Os fluxos existentes de cadastro, imóvel, pedido com preço/condições aceitos e falha de conexão também passaram. O build continua DEV; produção e pagamentos não foram alterados.
