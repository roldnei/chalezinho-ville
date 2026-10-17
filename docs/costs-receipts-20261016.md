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

### Treinamento supervisionado com amostras públicas — 16/10

Executados dois pilotos reais de ajuste do modelo português Tesseract em CPU. Primeiro: 82 linhas brasileiras conferidas, 410 amostras com variações, 17 linhas de validação e 14 de teste de documentos distintos. Segundo: incorporação de recibos fotografados públicos em inglês, com 1.924 amostras de 145 documentos após excluir caracteres não suportados, 205 linhas de validação e 186 de teste. Documentos inteiros são separados antes de gerar linhas; versões e hashes das fontes, licenças, preparação, transcrições revistas, treino, escolha de checkpoint, métricas e avaliador de navegador em `scripts/receipt-training/`.

Checkpoint escolhido por CER de validação, sem usar fotos do usuário no treino ou na escolha. O piloto ampliado reduziu a CER do teste público de 24,63% para 15,97%. No formulário real em Chromium, com as mesmas quatro fotos privadas e cinco campos por foto, o leitor atual acertou 13/20, o piloto brasileiro 11/20 e o ampliado 12/20. Primeiro piloto: dois fornecedores preenchidos errados. Ampliado: nenhum preenchimento errado adicional, mas um total antes correto ficou pendente. Ambos reprovados para publicação; o modelo do build foi restaurado e comparado por hash ao original. Nenhum comportamento de produção ou da prévia foi alterado por este experimento.

Resultados são exploratórios: corpus brasileiro pequeno, base adicional em outro idioma, alinhamento automático de rótulos e quatro fotos observadas durante desenvolvimento. Não representam precisão geral ou solução completa. Não houve escrita no banco. Modelos/checkpoints e relatório foram preparados separadamente; imagens, transcrições e identificadores privados continuam fora do Git. Dois testes da preparação/pontuação passaram; o avaliador genérico também foi exercitado em Chromium com uma imagem sintética.

### Conferência visual e exemplos privados — 16/10

O envio abre o cadastro: um botão oferece Fotografar ou Anexar foto/PDF. O visualizador mostra o original com zoom, modo ampliado e navegação de páginas. Caixas editáveis de estabelecimento, CPF/CNPJ, valor, emissão e número ficam ligadas aos trechos encontrados. É possível ocultar as caixas para ler a nota, marcar uma posição ausente ou reposicionar a indicação. Quando não há evidência de posição, o campo aparece abaixo do documento, sem inventar localização. Fotos inclinadas recebem uma leitura adicional sem rotação apenas para localizar as caixas, preservando as decisões do extrator. PDFs com texto usam as coordenadas da página.

Correções atualizam os campos reais do formulário; emissão ajusta a referência ainda não editada e o nome ajusta a descrição ainda automática. Valor permanece em reais com duas casas e centavos exatos. A confirmação é desmarcada após correções. Cada anexo mantém suas próprias correções e marcações durante a sessão; trocar o documento não mistura os campos. Fechar, remover ou trocar libera o visualizador e invalida leituras atrasadas.

A opção explícita “Guardar esta conferência como exemplo privado para futuros treinos” salva, após a despesa e o original, uma fotografia dos dados previstos e revisados, posições normalizadas e versão do leitor em `cost_receipt_reviews`. Somente o comprovante ativo gera exemplo. Sem texto bruto do OCR, URL pública ou envio externo. RLS restringe consulta/inclusão a administrador ativo, sem atualização ou exclusão pelo cliente. Trigger exige que os campos revisados correspondam ao custo salvo e valida posições/páginas. IDs estáveis permitem repetir falha de gravação. As duas migrações aditivas deste recurso foram aplicadas apenas em DEV.

Guardar exemplos não treina nem modifica o modelo automaticamente. Um próximo treinamento pode usar esses originais privados com as correções revisadas, separado por documento entre treino, validação e teste. Publicação continua condicionada a superar o modelo atual nas métricas de texto e preenchimento do formulário; os pilotos anteriores permanecem reprovados.

Validação adicional: testes de regiões, prioridades de evidência, isolamento de anexo e snapshot final; banco PGlite com RLS, autoria, igualdade com o custo, rejeição de posições inválidas e proibição de alteração/exclusão. Chromium real em tela móvel com OCR sintético, edição das caixas, marcação manual, ocultação, zoom, ampliação, PDF e navegação de duas páginas; layout desktop também inspecionado. Autenticação/armazenamento do navegador são mocks locais, sem upload remoto ou câmera física. Permissões reais da tabela DEV conferidas; nenhum novo achado de segurança para a tabela. Avisos de índices ainda não usados são esperados em tabela nova.

Resultado final desta atualização: 156 testes específicos e de regressão financeira passaram, build DEV verificado e fluxo Chromium móvel/desktop aprovado. Inclusão real como administrador autenticado em DEV exercitada em transação com rollback, sem persistir dados sintéticos.

### Caixas compactas com arraste por toque — 16/10

As indicações passam a uma linha com rótulo e valor editável (Valor, CNPJ/CPF, Nome, Data e Nota), mantendo contornos verdes com rótulos no texto original. Removido o botão Mover caixa. Um toque seleciona o valor para edição; segurar por 350 ms e arrastar move a caixa, inclusive começando pelo texto. A alça permite o mesmo gesto e movimento por setas no teclado. A caixa manipulada fica à frente das demais. Zoom mantém a posição relativa durante a sessão e cada anexo guarda sua disposição própria.

Mover a caixa muda apenas a visualização: a região que indica o dado no comprovante e os exemplos de treinamento continuam intactos. Campo sem posição pode ser localizado explicitamente. Gestos pendentes são cancelados ao trocar/fechar o documento. Validação: Chromium móvel com eventos reais de mouse e toque CDP, toque curto para editar, arraste prolongado em texto/alça, limite compacto de altura, preservação de posição no zoom e preservação da região original; fluxo de fotos/PDF de duas páginas e 18 regressões de formulário/regiões aprovados. Não equivale a teste em aparelho Android físico.

### Campos pendentes sobre a imagem e leitura progressiva — 16/10

Corrigido o caso de leitura sem coordenadas: todas as cinco caixas permanecem flutuantes, compactas, editáveis e arrastáveis sobre a imagem. Campos sem localização usam borda tracejada e um ícone para indicar explicitamente o trecho da nota. Não são criados retângulos de evidência para posições de exibição; arrastá-las continua sem alterar os exemplos de treino. Durante a leitura, uma faixa na própria imagem mostra o progresso e os valores ficam somente para leitura até concluir/cancelar.

A emissão padrão do novo cadastro é limpa ao anexar um documento, preservando uma data escolhida manualmente. Resultado vazio também limpa referência/data ainda automáticas. Assim uma leitura ausente ou com erro não apresenta o dia corrente como se estivesse na nota. QR válido comunica CNPJ/número antes de aguardar OCR; esses resultados permanecem disponíveis se a etapa de texto falhar. Atualizações parciais de uma leitura cancelada/trocada são ignoradas e o snapshot privado pode registrar a previsão parcial validada.

Regressões cobrem resultado vazio/falha sem data fictícia, campos parciais e atraso após troca, snapshot parcial e cinco caixas sobre imagem sem texto. Chromium móvel exercita arquivo ilegível real, edição manual e volta ao anexo anterior, além dos fluxos anteriores de arraste/toque/zoom e PDF. Um recorte privado da captura do usuário foi processado no leitor real, com CNPJ/número corretos e valor/data ainda pendentes; isso não comprova reconhecimento integral da foto original. Captura, recorte, identificadores e transcrição não entram no repositório.

Validação final desta correção: 53 testes específicos passaram, build DEV verificado e fluxo Chromium móvel/desktop aprovado, incluindo arquivo sem texto, edição das cinco caixas, arraste por toque/mouse, zoom, PDF e isolamento por anexo.

### Total sem vírgula e marcações claras — 16/10

A leitura de fotos com fundo texturizado usa palavras fiscais confiáveis para recortar o papel, mesmo quando o ruído reduz a confiança da linha completa e alarga seus limites. O recorte inclui valores monetários completos na coluna direita. Suas coordenadas são transformadas de volta para a foto original; regiões de uma passagem já sem rotação também podem completar posições ausentes. CNPJ/número procuram rótulos e palavras correspondentes, evitando marcar a chave de acesso como se fosse o número impresso da nota.

No OCR de um total explicitamente rotulado, valores sem separador usam os dois últimos dígitos como centavos, inclusive cinco dígitos contínuos. Exige concordância com outra linha de pagamento, confiança suficiente e ausência de conflito entre totais; não reinterpreta quantidades, parcelas, número de nota, texto nativo de PDF ou digitação manual. A passagem localizada pode recuperar um total ausente, mantendo conflitos explícitos pendentes. O resultado continua em centavos inteiros e BRL com duas casas, com conferência obrigatória.

Retângulos sobre os trechos e caixas de edição usam verde-claro com transparência, inclusive em modo escuro. A área da nota declara color-scheme apenas claro para evitar escurecimento automático pelo navegador; o campo em edição recebe fundo claro para legibilidade. Arraste, zoom e vínculo ao formulário permanecem.

Validação: 58 testes específicos passaram; Chromium real aprovou reconhecimento sintético de cinco dígitos sem vírgula como BRL com duas casas, além das regressões de foto/PDF, toque, arraste, zoom e campos pendentes. Verificados cor/transparência em modo escuro e posicionamento dos trechos. Quatro fotos do usuário foram exercitadas privadamente: no cupom elétrico, total e emissão antes pendentes foram recuperados corretamente, com quatro marcações; CNPJ/número permaneceram corretos. Nas outras fotos não surgiram totais ou datas incorretos; um cupom continua com total/data pendentes. Nome do estabelecimento pode exigir revisão/preenchimento manual. Documentos, identificadores, recortes e transcrições privadas ficam fora do repositório público. Nenhum modelo treinado foi substituído, nenhuma migração nova e produção não alterada.

### Confiança por trecho e concordância entre passagens — 16/10

A recuperação de total/emissão passa a avaliar as palavras fiscais, evitando que ruído na mesa invalide palavras claras. Totais rotulados, com dígitos de alta confiança, precisam coincidir em pelo menos duas passagens distintas do OCR. Valores sem vírgula mantêm os últimos dois dígitos como centavos. Datas válidas precisam coincidir entre passagens em contexto de NFC-e/emissão/autorização; vencimentos e parcelas são excluídos. Resultados divergentes ou já preenchidos não são substituídos por essa recuperação. Não há treinamento nem consulta externa.

As regiões do total e da data também aceitam palavras confiáveis em linhas de confiança global baixa. O total é ligado ao rótulo fiscal e aos dígitos correspondentes; a data ao próprio texto no contexto fiscal. As coordenadas continuam transformadas para a foto original. Assim os campos recuperados recebem retângulos translúcidos e caixas editáveis próximas, em vez de ficarem apenas como campos vazios em posições padrão.

Validação privada do recorte de uma captura da nota de maio: total e emissão corretos, cinco caixas flutuantes e marcações nos dois trechos. O número da nota ficou pendente no recorte comprimido. Isso não equivale à validação da foto original em resolução completa. A captura e seus dados não foram publicados. Regressões sintéticas cobrem concordância entre passagens, números fracos, centavos, datas impossíveis, vencimentos, divergências e preservação de valores existentes. 62 testes específicos e fluxo Chromium móvel/desktop aprovados.

### Comprovantes de venda com cabeçalho e dados do cliente — 16/10

A identificação do estabelecimento considera o cabeçalho anterior a “não é documento fiscal”/“comprovante de venda” e prefere uma razão social com sufixo empresarial. Vendedor, cliente, rótulos do documento e fragmentos isolados deixam de ser candidatos a fornecedor; a seção de cliente também delimita a busca pelo CNPJ do emitente. A recuperação por palavras locais aceita razão social completa confiável e concordante entre passagens. O documento continua sendo armazenado como comprovante, sem presumir validade fiscal ou dedutibilidade.

Uma data simples explicitamente rotulada como “Data:” antes dos dados do cliente pode ser recuperada com alta confiança tanto do rótulo quanto da data, sem exigir rótulo NFC-e. Datas fracas, inválidas ou conflitantes ficam pendentes. As marcações também reconhecem esse rótulo simples.

Validação: 68 testes específicos passaram, incluindo OCR real de comprovante sintético com caixas, nome, data simples, total, vendedor e CNPJ do cliente. No recorte privado da nova captura, a data foi preenchida corretamente e recebeu marcação; o fornecedor permanece pendente por falta de texto confiável nessa captura com caixas sobrepostas e o total está fora do recorte. A foto original completa não foi disponibilizada nesta mensagem. Não foram publicados imagem ou dados privados. Build DEV verificado, sem alteração de produção.

## Leitura gratuita por regiões — revisão 9

Fotos agora passam por PP-OCRv6 small/PaddleOCR.js local, com polígonos, retificação de linhas e associação de rótulos/preços pela inclinação. Assets e modelos fixados por versão/SHA-256 são servidos pela aplicação. Tesseract verifica nomes duvidosos e continua disponível como alternativa; PDFs mantêm o leitor existente. Não há API de OCR paga nem envio a terceiros. O download inicial e o processamento podem demorar em celulares.

Na regressão privada de quatro fotos originais: 14/20 para 18/20 campos exatos; quatro totais, quatro datas, quatro CNPJs e quatro números corretos. Dois nomes pendentes, nenhum preenchimento errado. Não é estimativa independente de precisão: os casos já eram conhecidos. Critérios dos próximos treinos, fontes oficiais e gate de comparação estão em `scripts/receipt-training/README.md`.

A migração `20261016220000_cost_review_neural_engine.sql`, aplicada somente em DEV, permite registrar a versão real do leitor nos exemplos opcionais. Não altera políticas de acesso nem dados existentes. Correções continuam exemplos para revisão futura, sem retreino automático.

## Conferências automáticas — revisão 10

Ao salvar o custo com o comprovante ativo, o sistema registra automaticamente a leitura original, os dados finais e as regiões. A gravação ocorre depois de persistir o custo e o anexo; editar ou cancelar não gera exemplo. Somente o comprovante ativo recebe os dados finais, evitando atribuí-los aos outros anexos. A confirmação dos dados lidos continua necessária; foi removida somente a opção separada de guardar o exemplo. Custos sem comprovante ativo não geram exemplos. Isso não treina o modelo automaticamente.

O botão único Anexar comprovante abre diretamente o seletor do aparelho, aceitando fotos e PDF. O botão exclusivo Fotografar e seu campo de câmera foram removidos.

## Análise gráfica de custos

O painel inclui evolução mensal (12 meses, inclusive zeros), comparação anual e comparação dos imóveis por mês ou ano. Mostra total do mês, total anual do imóvel/filtro e total geral anual de todos os imóveis, incluindo compartilhados. As barras permitem selecionar mês, ano ou imóvel, sincronizando filtros e lançamentos. Os valores mensais também estão disponíveis em tabela acessível.

Usa os lançamentos carregados e exclui arquivados. Compartilhados não são rateados automaticamente; imóveis sem cadastro carregado mantêm identificação própria. O critério selecionado vale para os gráficos: competência, pagamento (sem despesas ainda não pagas) ou exclusão fiscal (somente valor de exclusões confirmadas, com título específico). Comparação por imóvel mostra todos os imóveis no período, enquanto evolução e totais no filtro respeitam o imóvel selecionado.

Sem dependência gráfica externa nem mudança no banco. Validado com 21 testes direcionados e Chromium em 390px/1440px: somas exatas em centavos, filtros interativos, período vazio, total geral, compartilhados e ausência de rolagem horizontal na página. Dados do teste de navegador são fictícios e não são gravados no banco.
