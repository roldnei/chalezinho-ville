# Custos e comprovantes

Entrada: `custos.html`, com links na Central, Financeiro e PMS. Base preservada: produção `721b053` (multicalendário em colunas e mês iniciado hoje). Nenhuma mudança no motor de reservas, pagamentos ou regras comerciais.

Cadastro administrativo de despesas com categoria, imóvel (ou geral), valor em centavos, competência, data do documento, pagamento, fornecedor, documento e observações. Fotos JPEG/PNG/WebP e PDF até 10 MB, originais privados, download autenticado individual ou ZIP do filtro com CSV e comprovantes. O CSV inclui totais e neutraliza fórmulas em conteúdo textual. ZIP sem compressão preserva bytes; limite de exportação conjunta de 100 MB para memória do dispositivo. Até 30 anexos no formulário.

Competência, mês de pagamento e mês fiscal são filtros independentes. Custos não viram deduções por padrão. As categorias previstas para exclusão começam pendentes de revisão; confirmação exige imóvel, comprovante previamente armazenado, pagamento, encargo do locador, justificativa, mês fiscal e valor parcial ou integral até o custo. Categorias operacionais são bloqueadas no banco para exclusão. Não há apuração automática do imposto nem transmissão/importação para Receita. Receitas, fonte pagadora, titularidade de rendimentos, deduções pessoais e saldo anual de IPTU exigem conferência separada. Para bens de terceiros, o custo deve ser atribuído ao contribuinte correto antes de qualquer declaração.

Fonte: Receita Federal, Perguntas e Respostas IRPF 2026, perguntas 209 e 445–449: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf . Comissões das plataformas podem ser excluídas quando suportadas pelo locador. Limpeza cobrada do hóspede integra rendimentos. Piscineiro, energia, limpeza e manutenção próprios não integram a lista legal de exclusões do aluguel de pessoa física; as regras de livro-caixa de trabalho autônomo não foram aplicadas ao aluguel.

## Dados e acesso

Migração `20261016125659_costs_receipts.sql`: tabelas `cost_entries`, `cost_receipts`, `cost_history`, bucket privado `cost-receipts`. RLS e privilégios restritos a administrador com acesso ativo. Sem permissão de apagar ou substituir comprovantes. Arquivamento retira dos totais e preserva documentos. Histórico de criação/alterações gerado em trigger privado, inacessível para escrita direta pelo navegador. Nenhuma leitura de metadados editáveis do usuário para autorização. Edição usa timestamp para detectar alterações concorrentes; cadastro e anexos usam IDs estáveis para permitir repetir falhas sem duplicação.

## Validação

- 7 testes próprios: moeda, três critérios de mês, filtros por imóvel/geral, exclusão de arquivados, CSV, ZIP, RLS, comprovação, categorias fiscais, valor, histórico, interface de cadastro/revisão, falha e reenvio de anexos sem duplicação.
- 16 testes existentes do financeiro/configuração e operação multicanal.
- Sintaxe dos scripts e build de prévia.
- ZIP aberto com `zipfile` Python e payload binário comparado byte a byte.
- DEV: migração aplicada; criação operacional e revisão fiscal com metadados de comprovante exercitadas como `authenticated` em transações com rollback. Não persistiram despesas de teste.
- Advisors DEV: nenhuma ocorrência nova para custos. Há avisos anteriores do projeto fora deste módulo.

Os testes de interface usam JSDOM com cliente de armazenamento simulado. O banco remoto foi testado com rollback, incluindo políticas reais e registro de metadados no Storage; isso não substitui uma captura de câmera nem upload físico pelo navegador. A instalação do Chromium neste executor falhou por download incompleto; não foi declarada homologação visual completa ou upload/download de um arquivo real em dispositivo físico.

Para disponibilização PROD: aplicar a mesma migração aditiva no projeto `irxsaladqhbzhkoaclxy` e publicar este commit no projeto Vercel `chalezinho-ville`, mantendo o perfil WhatsApp e a configuração PROD existentes. Retorno de frontend: deployment anterior; preservar tabelas e comprovantes, sem rollback destrutivo dos dados.

## Valores em reais

Os campos de custo e exclusão fiscal validam números positivos com até duas casas decimais. Ao sair do campo, exibem BRL com agrupamento brasileiro (ex.: R$ 1.234,50); ao editar, removem o prefixo e os separadores de milhar. Ponto decimal do teclado e valores brasileiros colados com prefixo R$ são aceitos. Letras, negativos, excesso de casas e valores fora do limite não podem ser salvos. A terceira casa é bloqueada na digitação; conteúdo inválido colado mantém erro visível sem truncar ou arredondar silenciosamente. Nove testes específicos da aba passaram, incluindo formato, precisão, gravação em centavos e exclusão fiscal desativada.

## Leitura automática de notas

Fotos JPEG/PNG/WebP e PDFs iniciam leitura local ao serem adicionados ao formulário. O primeiro anexo adicionado é lido; outros anexos têm botão próprio “Ler dados da nota”. Anexos diferentes nunca são somados automaticamente em um lançamento. O leitor preenche estabelecimento, CNPJ do emitente, emissão, referência mensal, número do documento, total e categoria sugerida quando identificáveis. Preserva campos editados manualmente; antes de salvar exige a conferência dos campos preenchidos pelo leitor. O original continua no fluxo de anexação privada existente.

Tesseract.js 7.0.0, dados em português 1.0.0 e PDF.js 6.4.299 são dependências fixadas no lockfile. O build copia scripts, workers, WASM, modelo de idioma e recursos PDF para assets da própria origem, carregados sob demanda. Nenhuma imagem ou texto vai a um serviço externo de OCR/IA. O resultado permanece em memória do formulário; não é logado. A transcrição exibida usa textContent, sem executar HTML ou instruções do documento. PDF é aberto por bytes locais, com avaliação desabilitada.

PDF com texto é lido diretamente; páginas sem texto suficiente são renderizadas e reconhecidas. Limite: 10 MB por arquivo, até 6 páginas por PDF e 40 milhões de pixels na foto original, com redução antes do reconhecimento. Arquivos com senha/ilegíveis mantêm preenchimento manual. Há progresso, cancelamento, tempo limite e proteção contra resultado atrasado após fechar/trocar o formulário. Cancelamento ou falha não remove o anexo.

O parser privilegia rótulos explícitos de total a pagar/valor total da nota e ignora subtotal, itens, tributos, valor pago e troco. Totais conflitantes ou ausentes ficam pendentes; não é escolhido o maior número. CNPJ passa por verificação de dígitos, inclusive formato alfanumérico, sem consulta cadastral externa. CNPJ do consumidor não substitui o do estabelecimento. Data de pagamento e exclusão fiscal nunca são inferidas. Referência de DV: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf .

Validação: reconhecimento real em português de imagem sintética; extração real de PDF com texto; renderização e OCR de PDF digitalizado; casos de ambiguidade e campos ausentes; interface com preenchimento automático, preservação de edição, conferência obrigatória, erro e cancelamento. Dados e documentos usados nos testes são sintéticos e não foram cadastrados no banco. Os testes de interface continuam em JSDOM; não equivalem à validação de câmera em aparelho físico. Build completo verificado. Esta atualização permanece na prévia do módulo de Custos.

### Correção da leitura de fotos com fundo — 16/10

A foto recebe leitura inicial, localização por linhas fiscais e uma segunda leitura do recorte com contraste em escala de cinza quando a chave não foi identificada. O anexo original permanece intacto. O parser aceita pontuação de OCR em CNPJ somente quando seus dígitos verificadores são válidos; a chave de acesso numérica de 44 posições também pode recuperar emitente e número da nota, após validação do modelo, CNPJ e dígito da chave. Referência: MOC 7.0, estrutura e módulo 11 da chave, no Portal Nacional da NF-e.

O nome é extraído também após CNPJ no cabeçalho, com continuação de razão social na próxima linha. Fragmentos sem sentido são rejeitados e nomes sem contexto com baixa confiança ficam pendentes. Abreviações como DETERG, LAVA ROUPAS e PAPEL HIG sugerem produtos de limpeza; categoria sem evidência fica vazia e exige escolha. Valores, datas e documentos divergentes entre leituras pedem conferência; para o número da nota, a chave validada tem precedência sobre texto impresso sem validação.

Validação adicional: foto real fornecida pelo usuário processada apenas localmente, recuperando CNPJ, valor, mês/data e número pela chave. O nome ficou sem o complemento final da razão social e há alerta de ambiguidade na data da segunda leitura; a conferência do formulário continua obrigatória. Nenhuma foto, identificador ou transcrição desse comprovante foi incluído no repositório público. Regressões usam dados sintéticos, incluindo fundo texturizado, CNPJ pontuado, chave inválida, fragmentos de fundo, divergências e categoria pendente. Câmera e desempenho em celular físico ainda dependem da verificação na prévia.

### Troca de foto antes de salvar — 16/10

Ao selecionar outro anexo para leitura em um novo lançamento, o formulário limpa fornecedor, documento, número da nota, descrição, valor, categoria, emissão e referência anteriores antes de processar o novo arquivo. Isso inclui correções feitas nos dados da nota anterior. Campos ausentes na segunda leitura ficam vazios; a confirmação de conferência é desmarcada. Imóvel, pagamento e observações mantêm o contexto do lançamento. Uma releitura do mesmo anexo preserva correções manuais; ajustes feitos durante a nova leitura também são preservados. Em edição de lançamento existente, a limpeza se restringe aos campos preenchidos pela leitura nessa sessão. Anexos continuam na fila até remoção explícita.

Regressões de interface: troca com dados parciais e gravação do novo valor, ausência de CNPJ/número, correções da primeira nota, contexto do lançamento, resultado atrasado, falha, cancelamento, volta a um anexo anterior e releitura do mesmo arquivo. Testes em JSDOM; não equivalem a uma sessão de câmera em celular físico.

### Cupom térmico inclinado e QR code — 16/10

Incluída leitura local de QR com jsQR 1.4.0, fixado no lockfile e copiado com licença para os assets da própria origem. Duas tentativas limitadas a 5 MP: foto e contraste em cinza, preservando o original. O endereço decodificado não é aberto nem consultado. Só são extraídos CNPJ e número de uma chave com modelo 55/65, CNPJ e dígito verificador válidos, em payload direto ou parâmetro `p` de URL HTTP(S) em domínio governamental. Valores, datas, nomes, pagamento e enquadramento fiscal não são inferidos do QR.

Na OCR, a data da linha de emissão deixa de vencer automaticamente outras datas conflitantes. Exige concordância em linhas diferentes; sem acordo, emissão e referência ficam pendentes. O formulário limpa padrões intocados nessas condições, preservando datas escolhidas manualmente. Também diferencia número da nota junto de série do número do cupom do caixa e rejeita cabeçalhos de tabela como fornecedor.

Testada localmente a execução do leitor nas duas fotos reais enviadas, sem publicar as fotos, CPF do consumidor, chaves, identificadores ou transcrições no repositório. No cupom térmico inclinado, foram recuperados emitente, número da nota, total e categoria; fornecedor e emissão continuam pendentes por baixa legibilidade e divergência. O QR não contém esses dois campos no formato recebido, portanto exigem conferência manual. Regressão pública usa matriz QR sintética, com leitura real sob inclinação, rejeição de payloads/chaves inválidos, cancelamento, conflitos de datas e preservação de edições. Build verificado; desempenho/câmera no aparelho físico seguem dependentes da prévia.

### Diferença entre arquivo reduzido e foto do celular — 16/10

Reproduzida a falha em Chromium real usando o build da aplicação e uma variação da foto com 2.000 px de largura: CNPJ vazio e dia de emissão incorreto. O redimensionamento global antes do QR perdia detalhes da impressão térmica. A leitura passa a buscar também regiões sobrepostas, preservando resolução, e a tentar contraste, binarização e ampliação controlada. Cada tentativa permanece limitada a 5 MP, com cancelamento entre tentativas. Não depende de um tamanho exato da imagem.

Datas e valores com confiança global de OCR inferior a 65 ficam pendentes, inclusive quando a mesma leitura incorreta se repete. Quando a leitura recupera outros campos sem uma emissão válida, o formulário limpa data/referência iniciais que não foram escolhidas manualmente. Corrigida ainda uma referência a variável inexistente no tratamento de “Razão social”/“Nome fantasia”.

Validação: 41 testes de campos/interface/leitores; fluxo adicional em Chromium real com upload pelo input da página de custos, scripts/workers/WASM/modelo/QR da própria origem e imagens sintéticas de 800/2.200 px. A autenticação e as consultas desse teste são mocks locais: ele valida arquivo → leitor real → campos/revisão sem criar registros no banco. Script reproduzível: `node scripts/build-finance-preview.mjs && node tests/browser/cost-receipt-flow.mjs`, com Playwright Chromium instalado ou `CHROMIUM_EXECUTABLE_PATH` para um executável existente.

A foto real foi verificada privadamente no navegador, incluindo variações de resolução, sem publicar a imagem nem identificadores/transcrições. Nas variações fracas do cupom, a correção preenche CNPJ, número e descrição genérica da nota e deixa nome, total, emissão e referência pendentes. Uma variação também leu o total incorretamente; o limite de confiança impede esse preenchimento automático. O total não está presente no QR desse documento. Chromium local não equivale a homologação em Android físico; câmera original não está disponível na mesma resolução enviada pelo aparelho.

### Nome confundido com linha de valores e compras parceladas — 16/10

O fornecedor passa a ser procurado no cabeçalho anterior ao título fiscal/tabela de itens. Linhas como “Valor Produtos R$”, quantidades e preços são rejeitadas como nome, mesmo quando o OCR omite todo o cabeçalho. Identificadores lidos posteriormente no corpo continuam utilizáveis, sem acessar índices inexistentes no cabeçalho. CNPJ com espaços nos separadores é aceito somente após validação dos dígitos. Vencimentos e parcelas não disputam a data de emissão. Assento sanitário, perfil de embutir e fonte de alimentação sugerem manutenção quando os termos forem reconhecidos.

Validação: 45 testes específicos passaram, mais o fluxo real em Chromium com duas resoluções sintéticas. Duas novas fotos do usuário foram verificadas privadamente no formulário real, com autenticação/dados simulados e sem registros ou uploads remotos. Na compra de ferragens, CNPJ, número, total e emissão permanecem corretos; a categoria passa a manutenção e o fornecedor fica pendente, sem reaproveitar a linha de valores. Na compra elétrica, CNPJ e número são recuperados do QR e a categoria é reconhecida; nome, emissão e total ainda ficam pendentes por qualidade insuficiente do OCR. Tentativas locais de recorte/contraste do cabeçalho não produziram transcrição confiável e não foram incorporadas ao fluxo. Não há afirmação de reconhecimento completo. Nenhuma foto, identificador ou transcrição real foi publicada; regressões usam dados sintéticos.

### Selecionar novamente uma foto já anexada — 16/10

Corrigida a seleção pelo input de uma foto que já está na fila: anteriormente, após ler outro anexo, selecionar novamente a primeira foto não disparava leitura e mantinha os dados da segunda. A seleção agora ativa o item existente e seu resultado, sem duplicar o anexo, limpando campos da nota anterior e exigindo nova conferência. Selecionar o próprio anexo ativo continua preservando correções manuais. O limite de anexos não impede selecionar novamente um item existente.

Validação: regressão que falhou antes da correção e passou depois, 46 testes específicos, build e Chromium real na sequência foto A → B → A. A mesma sequência foi verificada privadamente com duas fotos reais: o número da nota voltou ao documento selecionado; emissão/referência/valor ausentes não conservaram os valores da outra nota. Não se reproduziu duplicação do campo de data do documento; HTML e formulário no navegador contêm apenas um. Limitações de OCR de nome, emissão e total continuam presentes, sem afirmar reconhecimento completo. Nenhum documento, identificador ou transcrição real integra os testes públicos.
