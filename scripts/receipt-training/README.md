# Experimentos de treinamento de OCR de cupons

Treinamento real de Tesseract LSTM, executado em 16/10/2026. O processo gera modelos experimentais e mede sua qualidade; não altera automaticamente o leitor do aplicativo. Resultados agregados em `results.json`. Documentos do cliente não fazem parte do treino nem do repositório.

## Fontes e licenças

- George Krajan Godas, `tesseract-training-receipt` (2015), MIT: https://github.com/ggodas/tesseract-training-receipt . Nove imagens/arquivos de caixas de caracteres, dos quais sete documentos têm linhas selecionadas e transcrições revistas neste piloto. As caixas originais têm erros e não são aceitas indiscriminadamente como verdade. `reviewed-labels.json` contém somente as linhas conferidas nas imagens públicas.
- Manoela Auad, Sarah Alves, Gabriel Kakizaki, Julio C. S. Reis e Michel Silva, *A Filtering and Image Preparation Approach to Enhance OCR for Fiscal Receipts*, SIBGRAPI 2024. DOI https://doi.org/10.5281/zenodo.13633335 , CC BY 4.0. O ZIP efetivamente baixado contém 198 JPGs e 195 transcrições de recibos em inglês. Usado para ampliar diversidade de fotografias; não é apresentado como base brasileira. Pares de linha/transcrição alinhados automaticamente com similaridade mínima de 0,85; não foram todos revisados manualmente.
- Modelo inicial: `tesseract-ocr/tessdata_best`, português, Apache-2.0: https://github.com/tesseract-ocr/tessdata_best . O treinamento usa o modelo em ponto flutuante, e exporta versões inteiras para avaliação com o mesmo motor do navegador.

`sources.json` registra URLs, tamanhos e SHA-256 dos bytes usados. `fetch.py` recusa fontes com hash diferente. Dados brutos, modelos, checkpoints e fotos privadas ficam fora do Git. Preserve os avisos MIT e Apache das fontes e a atribuição CC BY ao redistribuir artefatos derivados.

## Execução

Requer Linux, Python com Pillow, Tesseract 5.3.4 com `tesseract`, `lstmtraining`, `combine_tessdata` e configurações de treino. O experimento usou `OMP_THREAD_LIMIT=1`. Execute a partir da raiz do repositório e use diretórios externos ao Git.

```bash
python scripts/receipt-training/fetch.py /tmp/receipt-pilot
python scripts/receipt-training/prepare.py /tmp/receipt-pilot
python scripts/receipt-training/build_samples.py /tmp/receipt-pilot
python scripts/receipt-training/create_lstmf.py /tmp/receipt-pilot --keep-order --keep-unsupported
python scripts/receipt-training/train.py /tmp/receipt-pilot --iterations 1200
python scripts/receipt-training/select.py /tmp/receipt-pilot
```

Primeiro piloto: 82 linhas brasileiras originais de quatro documentos, 410 amostras após variações determinísticas de contraste, desfoque e inclinação. Validação: 17 linhas de outros dois documentos; teste: 14 linhas de um terceiro. O primeiro piloto mantém a ordem original para reproduzir a execução inicial.

Para o experimento ampliado:

```bash
python scripts/receipt-training/unpack_restaurants.py /tmp/receipt-pilot
mkdir -p /tmp/receipt-photo-pilot/models
cp /tmp/receipt-pilot/models/por.traineddata /tmp/receipt-photo-pilot/models/por.traineddata
python scripts/receipt-training/prepare_restaurants.py /tmp/receipt-pilot /tmp/receipt-photo-pilot
python scripts/receipt-training/create_lstmf.py /tmp/receipt-photo-pilot
python scripts/receipt-training/train.py /tmp/receipt-photo-pilot --iterations 2000
python scripts/receipt-training/select.py /tmp/receipt-photo-pilot
```

A lista ampliada é embaralhada com semente fixa 20261016. Linhas contendo caracteres não suportados pelo modelo inicial são excluídas apenas do treino, sem facilitar validação/teste. A divisão é por documento antes de gerar linhas ou variantes. As listas contêm 1.924 amostras de treino (76 excluídas), 205 de validação e 186 de teste. Há 146 documentos de treino antes da exclusão de linhas (145 depois), 17 de validação e 19 de teste. Não há documento compartilhado entre os três grupos.

`selection.json` aponta o checkpoint escolhido exclusivamente pela menor taxa de erro de caracteres na validação. Para avaliar esse arquivo, use o diretório do modelo apontado em `best.model`:

```bash
python scripts/receipt-training/evaluate.py /tmp/receipt-photo-pilot /caminho/do/modelo --output /tmp/avaliacao.json
python scripts/receipt-training/test_pipeline.py
```

## Critérios e limites

CER é distância de edição dividida pelo número de caracteres esperados; somente espaços e composição Unicode são normalizados. Não corrige letras, dígitos ou valores para facilitar o resultado. Nomes legais, CNPJ, número, total e emissão do formulário são avaliados separadamente por correspondência exata nas quatro fotos privadas, com pontuação/formatação normalizadas. Campos em branco e campos preenchidos errados são contados separadamente. As fotografias não são recortadas manualmente para facilitar o teste do formulário.

A avaliação do formulário usa Chromium real, leitor/scripts/worker/modelo reais e autenticação/dados simulados. Nenhum custo é salvo e nenhum comprovante é enviado ao banco. A substituição do asset de idioma é temporária no `dist`, restaurada em `finally`. Os resultados privados detalhados não são publicados. A aprovação de um modelo exige melhora dos campos e ausência de novos preenchimentos errados; melhorar somente a validação de recortes não é suficiente.

Este é um experimento limitado: corpus brasileiro pequeno, base ampliada em outro idioma, rótulos de fontes públicas sujeitos a erro, alinhamento automático e quatro fotografias do cliente. A escolha de hiperparâmetros não usa valores esperados das fotos privadas, mas os mesmos casos foram observados em sucessivas versões; portanto não constituem uma estimativa independente de precisão em toda a população. A avaliação de câmera em Android físico continua pendente.

## Resultado deste experimento

No desafio privado de quatro fotos e 20 campos, o leitor atual acertou 13; o piloto brasileiro, 11; o ampliado, 12. O primeiro piloto preencheu dois nomes incorretos; o ampliado não acrescentou valores errados, mas deixou um total correto pendente. Os dois modelos foram reprovados para publicação. No teste público ampliado, a CER caiu de 24,63% para 15,97%, evidenciando que a melhora em recortes de texto não garantiu melhora na foto completa. O leitor da aplicação não foi alterado.

O avaliador de navegador pode ser repetido sem embutir documentos privados no código:

```bash
CHROMIUM_EXECUTABLE_PATH=/caminho/chromium node scripts/receipt-training/browser_evaluate.mjs /caminho/casos-privados.json /caminho/resultado-privado.json /caminho/por.traineddata.gz
```

O JSON de casos é uma lista de pares `[caminho_da_foto, campos_esperados]`, com `supplier`, `supplier_document`, `document_number`, `amount` (ex.: `140,00`) e `document_date` (`AAAA-MM-DD`). O modelo é opcional. O servidor local pode fornecer os bytes experimentais sem sobrescrever assets do build. Não publique manifestos ou saídas privados.

## Revisão do pipeline em 16/10/2026

Os pilotos acima continuam reprovados. A nova versão usa PP-OCRv6 **small** pré-treinado, via PaddleOCR.js 0.4.2 e ONNX Runtime Web 1.24.3, no aparelho. O detector encontra polígonos e o reconhecedor lê linhas retificadas. Uma reconstrução de linhas considera a inclinação do papel ao associar rótulo e preço; ponto decimal vira vírgula somente em linhas monetárias rotuladas com exatamente dois centavos. QR/chave continuam validados. O leitor Tesseract anterior permanece como alternativa quando o novo motor não está disponível. PDFs mantêm o pipeline anterior.

Nomes exigem um cabeçalho empresarial com confiança alta ou concordância com uma leitura Tesseract independente da região retificada. Discordâncias ficam pendentes. As coordenadas dos polígonos geram marcações sobre a foto original. Não há chamada para API de OCR paga, envio de foto a terceiros nem treinamento automático. O primeiro carregamento baixa os modelos da própria aplicação e pode demorar em celular. A qualidade em Android físico ainda precisa ser verificada.

Na comparação privada das mesmas quatro fotografias originais, a versão anterior desta revisão acertou 14/20 campos (dois nomes preenchidos errados); a nova acertou 18/20, com dois nomes pendentes e nenhum preenchimento errado. Valor, emissão, CNPJ e número: 4/4 cada. O modelo tiny também foi experimentado, mas não foi incorporado: os erros de letras e valores tornavam insuficiente trocar somente o motor. São casos de regressão já conhecidos, não uma promessa de 90% de acurácia em novas notas.

Para repetir a comparação sem divulgar fotos ou resultados detalhados:

```bash
node scripts/receipt-training/compare.mjs /tmp/baseline.json /tmp/candidate.json
```

O gate exige os mesmos arquivos e rótulos, mais acertos, nenhum campo com menos acertos e nenhum campo com mais preenchimentos errados. Ele também conta campos pendentes. O avaliador do navegador registra duração por foto. O gate não substitui medição de tempo/memória em celulares, revisão de privacidade ou teste em documentos inéditos.

### Próximos treinos: critérios de dados

1. Conferir transcrições humanas das linhas e seus recortes; os campos corrigidos no formulário são exemplos de extração, não transcrições completas para treinar reconhecimento de caracteres.
2. Separar por estabelecimento, modelo de cupom e documento **antes** de qualquer aumento de dados. Versões da mesma foto jamais atravessam treino, validação e teste.
3. Reservar documentos brasileiros inéditos, com autorização de uso, como teste final; não escolher pesos, limiares ou regras usando esse conjunto. As quatro fotos já vistas ficam somente na regressão.
4. Selecionar com métricas de detecção/linha na validação, mas liberar apenas após comparar os cinco campos na foto inteira, falsos preenchimentos, pendências e tempo no aparelho. CER menor isoladamente não aprova um modelo.
5. Guardar versões de rótulos, licença/origem, sementes, hashes e resultados agregados; permitir retorno ao modelo anterior. Correções privadas não entram no Git nem em treino sem uma etapa explícita de preparação e revisão.

Referências primárias consultadas: https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html ; https://github.com/tesseract-ocr/tesstrain ; https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html ; https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js . O primeiro recomenda corrigir segmentação/qualidade antes de retreinar. O segundo especifica pares de imagem de linha e transcrição. O último documenta o SDK local e seus modelos. Versões, hashes dos modelos e licenças estão fixados no build.
