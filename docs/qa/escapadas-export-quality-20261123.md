# Qualidade do download das escapadas — 23/11/2026

## Alteração

- As escapadas de fotos sem trilha usam WebCodecs/AVC quando disponível. Cada quadro é renderizado no mesmo compositor da prévia, com os arquivos originais do PMS, enquadramentos, transições, preços e datas existentes.
- 1080 × 1920, 30 fps, alvo de 20 Mbps (antes 12 Mbps). Codificação em modo `quality`, com espera pelo encoder, sem depender do relógio de reprodução do celular. MP4 convencional com metadados antes da mídia (`fastStart`).
- O encoder e a dependência Mediabunny 1.66.3 são empacotados no build e carregados somente ao exportar. Licença MPL distribuída junto ao bundle. Não utiliza CDN para codificar e não envia fotos para outro servidor.
- Navegadores sem WebCodecs/AVC e sequências com áudio ou vídeos continuam no exportador MediaRecorder, com o novo alvo de 20 Mbps. A qualidade/taxa efetiva dessa alternativa depende do navegador; não há garantia de 30 fps nesse caminho.
- Downloads individuais e ZIP usam a mesma função. A reconfirmação de cotação e as fotos aprovadas do Signature são preservadas.

## Validação

- 26 testes passaram: fotos aprovadas, duração, seleção, cancelamento de lote, ZIP sem recompressão, valores e regras de parcelas, consulta por datas, sequência multimídia e carregamento das cenas.
- Build WhatsApp e verificação de sintaxe passaram.
- Playwright local não pôde iniciar o Chromium: `socket() failed: Operation not permitted`. O teste de integração foi atualizado para verificar H.264, 450 quadros, 30 fps, duração e MP4 fast start, mas não executou nesse ambiente.
- Validação alternativa no navegador em nuvem, em prévia Vercel isolada, usando `tests/fixtures/escapada-export-qa.html` e os scripts reais do site. Não acessou contas, fez reservas, alterou preços ou executou transações. Os valores na imagem de teste eram fictícios.
- Novo encoder: H.264 High, 1080 × 1920, 450 quadros, 30/1 fps constante, duração 15,000 s, taxa efetiva 16.241.494 bps, 30.455.494 bytes. `ffprobe` verificou o arquivo efetivamente baixado. `moov` na posição 32, antes de `mdat` na posição 2687. Reprodução e quadro extraído conferidos.
- Controle sem WebCodecs, no mesmo navegador: MP4 reproduziu, porém com 15,7365 s e média de aproximadamente 2,24 fps. Isso confirma a limitação do caminho em tempo real neste ambiente, não uma medição dos arquivos anteriores do usuário.
- Cancelamento do novo encoder interrompeu a geração sem oferecer um arquivo parcial.
- A página temporária de QA da prévia foi removida da árvore usada para produção. A fixture permanece somente em `tests/` e não integra os arquivos públicos.

## Limites

Não houve publicação de teste em WhatsApp/Instagram. As redes recomprimem uploads; a melhora comprovada é no MP4 original baixado. O tamanho do arquivo pode aumentar. Resolução insuficiente de uma foto original não é recuperada pelo encoder.
