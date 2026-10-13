# Ville Faxinas — validação de 13/10/2026

Módulo independente implementado no repositório roldnei/chalezinho-ville. Base de inspeção: 2730681, branch feature/multichannel-operations-20261012; avanços até 16e78d6 incorporados: correção de campos de data no iPhone e conclusão guiada do PMS. Regras de preparação/saída do PMS mais recentes preservadas no adaptador. Produção, checkout e pagamentos de hospedagens não foram publicados ou substituídos por este trabalho.

## Acesso e fluxos

- `faxinas.html`: entrada pública, contratar ou trabalhar; os dois papéis na mesma conta.
- `faxinas-admin.html`: administração exclusiva. O servidor revalida cada ação; esconder botões não é o controle de acesso.
- Login: uma tela; criação de conta: uma tela com nome, celular, e-mail e senha compatível com o Auth existente. A confirmação de e-mail pode exigir abrir o link externo.
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

A versão permite validar cadastro, pedidos e aceite, mas **não operar serviços pagos reais** enquanto estas dependências estiverem pendentes. A UI informa o bloqueio; não gera QR Pix fictício nem afirma que o repasse foi pago.

1. Conta/aplicação PagBank habilitada especificamente para marketplace/split, Pix com custódia e autorização dos recebedores. A integração de hospedagem não comprova isso.
2. Credenciais próprias do módulo no servidor: `CLEANING_PAGBANK_SANDBOX_TOKEN` ou `CLEANING_PAGBANK_PRODUCTION_TOKEN`, `CLEANING_PAGBANK_PLATFORM_ACCOUNT`. Não copiar credenciais de hospedagem para presumir habilitação.
3. Homologar criação/consulta, assinatura real de webhook da API Order, expiração, pagamentos repetidos/tardios, estorno e liberação de custódia. A documentação usa um formato de assinatura diferente para algumas outras APIs; notificações sem assinatura confiável são recusadas.
4. **Concluir e homologar a integração de liquidação/EDI**, com fonte de confirmação do recebimento efetivo e conciliação de taxas do intermediador. O ledger possui a observação privada de liquidação, mas não há conector EDI habilitado neste ambiente. `CLEANING_SETTLEMENT_INTEGRATION` permanece ausente; não configurar `verified` sem concluir essa integração e testar os valores líquidos. Liberação de custódia só move para processando.
5. O PagBank pode liberar custódia automaticamente em seu prazo máximo. Definir uma janela que cubra serviço/conferência/ocorrência e não prometer retenção indefinida. A criação é bloqueada quando o serviço excede a janela configurada.
6. Verificar identidade e recebimento dos participantes reais, cadastrar a referência de autorização e liberar individualmente. Nada foi enviado a profissionais/proprietários externos.
7. Cadastrar dados reais dos chalés (endereço, área, camas, materiais e acesso), vincular cada imóvel autorizado do PMS e definir sua profissional/regra. Não inventamos dados faltantes nem habilitamos imóveis reais automaticamente.
8. Revisar juridicamente termos, cancelamento, privacidade e tratamento de ocorrências. São propostas para revisão, não garantia de isenção ou seguro.
9. Verificar URLs de retorno do Auth para o domínio definitivo de validação. A prévia mantém a proteção de acesso da Vercel existente.

Referências oficiais consultadas: [Pix com split](https://developer.pagbank.com.br/reference/pedido-com-divisao-de-pagamento-com-pix), [custódia](https://developer.pagbank.com.br/reference/crie-e-pague-um-pedido-com-custodia), [liberação](https://developer.pagbank.com.br/reference/liberar-divisao-de-pagamento-com-custodia), [cancelamento](https://developer.pagbank.com.br/reference/cancelar-pagamento), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage privado](https://supabase.com/docs/guides/storage/security/access-control).

## Operação e retorno

Publicação autorizada somente da prévia. Para interromper: desabilitar a geração por imóvel e pausar somente os dois jobs `cleaning-marketplace-*`; preservar tabelas/evidências/histórico. Retorno da interface é o deployment anterior. Nunca apagar o ledger ou copiar fixtures DEV para PROD. Produção exige revisão das migrações, dependências financeiras e validação visual antes de um novo pedido de publicação.
