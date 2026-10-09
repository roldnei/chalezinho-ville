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

## Feelings com áudio original (v2)

O fluxo principal não carrega TensorFlow, MobileNet ou outro modelo. Os arquivos históricos do classificador permanecem para compatibilidade do acervo, mas não são requisitados pelo editor.

A análise usa PCM decodificado localmente, janelas de 50 ms, RMS, picos, pausas, variação temporal e amostras visuais de baixa resolução (até 12 quadros). O perfil conservador limita o ganho positivo, preserva silêncio e saturação e só remove zumbido estreito de 50/60 Hz quando detectado de forma persistente. Não há transcrição nem adição automática de música/sons. Os áudios desta pasta são opcionais.

Veja `docs/feelings-original-audio.md` para arquitetura, testes e limites de validação.
