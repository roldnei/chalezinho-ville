# Feelings — sons e análise local

## Sons

Seis efeitos de som da Freesound, todos marcados CC0 1.0 na página de origem em 9 de outubro de 2026. Usados como arquivos próprios do projeto; nenhuma chamada à API Freesound em tempo de execução. Acesso gratuito ao arquivo não substitui a licença: novas entradas devem ser verificadas individualmente antes de entrar no catálogo.

| Arquivo | Autor | Origem |
| --- | --- | --- |
| coffee.mp3 | Federico_Casazza | https://freesound.org/people/Federico_Casazza/sounds/538932/ |
| pour.mp3 | Rudmer_Rotteveel | https://freesound.org/people/Rudmer_Rotteveel/sounds/700352/ |
| bubbles.mp3 | Electroviolence | https://freesound.org/people/Electroviolence/sounds/234556/ |
| fire.mp3 | ceich93 | https://freesound.org/people/ceich93/sounds/263864/ |
| birds.mp3 | Magnesus | https://freesound.org/people/Magnesus/sounds/723913/ |
| rain.mp3 | esh9419 | https://freesound.org/people/esh9419/sounds/417616/ |

Licença: https://creativecommons.org/publicdomain/zero/1.0/. Os autores são registrados por procedência, mesmo sem exigência de atribuição. Os arquivos foram derivados das prévias MP3 de alta qualidade disponibilizadas nas páginas, recortados em no máximo 20 segundos (café e líquido com silêncio inicial/final reduzido), normalizados com FFmpeg loudnorm (I=-22, TP=-3, LRA=7), convertidos a estéreo 44,1 kHz e MP3 96 kbps. `catalog.json` registra duração efetiva, repetição, etiquetas de busca, licença, origem e SHA-256 do arquivo servido. Café e líquido não se repetem; os ambientes podem se repetir durante a cena. O backend aceita apenas os seis IDs, nunca URLs de áudio arbitrárias.

## Modelo e dependências

TensorFlow.js 4.22.0 (`tf.min.js`) e MobileNet v1 alpha 0.25 / entrada 224 px, sob Apache 2.0, de Google/TensorFlow. `LICENSE-tensorflow.txt` contém a licença; os avisos originais dos scripts foram mantidos.

- https://www.npmjs.com/package/@tensorflow/tfjs/v/4.22.0
- https://github.com/tensorflow/tfjs-models/tree/master/mobilenet
- https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json
- Classes ImageNet: https://github.com/tensorflow/tfjs-models/blob/master/mobilenet/src/imagenet_classes.ts

Os 55 grupos originais de pesos foram concatenados na ordem do manifesto em `weights.bin`, e o manifesto foi consolidado sem alterar tensores. Scripts e pesos são carregados somente ao pedir análise Feelings. A classificação usa pixels locais, não o nome do arquivo. Nenhuma foto ou vídeo é enviado a serviços externos de IA.

A análise reconhece objetos gerais; não identifica eventos sonoros precisos nem garante sincronização com um gesto. Fotos usam uma classificação; vídeos usam três quadros do trecho escolhido. Sugestões exigem confiança >=0,28 e margem >=0,12. Conteúdo incerto fica sem som sugerido. Chuva permanece disponível para escolha manual. O usuário deve ouvir e pode mudar posição, recorte e volume. Não há transcrição.
