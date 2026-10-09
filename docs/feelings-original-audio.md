# Feelings — áudio original e timeline visual

Implementação em `feature/feelings-original-audio`, baseada em `feature/ville-moments` / `6a7f7c0`. Somente desenvolvimento. O build existente rejeita `VERCEL_ENV=production`; o serviço rejeita qualquer projeto diferente de `pxfqmnhqodqyaaqeyjgr`.

## Experiência

Adicionar vídeos → Criar Feelings → prévia pronta → tocar para ouvir → ajustar ou concluir. A ativação explícita do som respeita autoplay. O atalho de criação aparece com vídeos; o ícone da timeline permanece em todas as etapas.

Prévia vertical grande, cenas com miniaturas e largura proporcional, cursor central e rolagem para buscar um instante, alças, pressionar/segurar para ordenar com rolagem automática nas bordas e vibração quando disponível. Duas faixas distinguem original e som opcional. Pinça e botões controlam o zoom; teclado permite recortar, buscar e reordenar. Ferramentas contextuais, transições, comparação Original/Tratado e histórico de 35 alterações. Mudanças externas ao reabrir invalidam o histórico antigo para não sobrescrever textos novos.

Referências oficiais consultadas em 09/10/2026:
- https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/
- https://about.fb.com/news/2026/04/one-year-of-edits-built-for-and-with-creators/

A interação se inspira em edição por clipes/timeline; não é uma cópia da interface do Instagram.

## Análise e tratamento implementados

- Decodificação de áudio no navegador, em sequência; resumos em cache (máximo 12 fontes), sem guardar PCM entre cenas e sem modelo pesado. Fotos não geram áudio.
- Janelas de 50 ms, RMS/picos por canal (evita cancelamento estéreo), percentis do envelope, proporção de amostras saturadas, energia grave e detecção estreita de zumbido persistente 50/60 Hz.
- Ganho com alvo aproximado de -23 dB RMS, aumento máximo de 6 dB e margem para picos. Não é normalização LUFS certificada. Sons estacionários não recebem ganho positivo nem compressão automática. Silêncio e saturação mantêm original.
- Filtro passa-altas suave de 35 Hz somente quando graves predominam; notch estreito apenas com evidência de zumbido; compressor suave quando há picos dinâmicos. Barramento de saída comum limita somas de faixas.
- Entradas/saídas de 80/120 ms nos vídeos analisados; sons opcionais mantêm seus fades. Original/Tratado compara o processamento da cena, mantendo a proteção comum da saída.
- Sugestões de recorte por eventos/variações do envelope, com pequena folga antes do início, e preferência moderada por trechos de menor variação visual em até 12 quadros de 32×18. Não há identificação semântica de gestos. Pausas/ambiências estáveis e recortes manuais não são substituídos. Ordem, velocidade, filtros e textos são mantidos.
- Sem recuperação de clipping, vento forte ou remoção de conversas. Sem denoise amplo que pudesse apagar texturas de chuva/água/fogo. Falha de decodificação mantém original e informa na interface.

## Contrato e consistência

`audio_treatment` v1 é opcional por vídeo, validado no backend (ganho, filtros, estados e até 240 picos de waveform). URLs arbitrárias de som continuam proibidas; propriedade da mídia e aprovação de hóspedes não mudam. Arquivos originais são mantidos. Não foi necessária migração de banco: metadados ficam no JSON de mídia já existente.

Editor, feed e exportação usam `VillegramTimeline.player` e `VillegramFeelings.graph`. O vídeo é o relógio durante cenas de vídeo, com recorte e velocidade aplicados no tempo de origem. Busca, movimento e transições compartilham a função temporal. Canvas mantém os textos de hóspedes/equipe e marca pequena em um canto sem texto, quando há canto disponível. A escolha do canto não reconhece objetos importantes da imagem.

Supabase DEV: `villegram-content` versão 20. Comparação com a versão 19 confirmou que só mudou a validação do novo perfil; os demais arquivos da função eram idênticos. Autenticação interna e `verify_jwt=false` preexistente foram preservados.

## Evidências de validação

- `npm run check`, `npm run typecheck`, build com guarda de ambiente DEV.
- 144 testes automatizados do conjunto Villegram, incluindo permissões, aprovação, contratos legados, textos e efeitos; 9 testes focados de áudio/timeline.
- Chromium real automatizado: larguras 390×844 e 1920×1080. Upload pelo input real, inspeção de vídeo, criação de posters e protocolo TUS exercitados com endpoint simulado; 2 vídeos + 6 fotos, 10 arquivos enviados (inclui posters).
- Oito mídias: seleção, alças, proporção temporal, reordenação longa com autoscroll, controles acessíveis, desfazer/refazer, comparação Original/Tratado, progressos, cancelamento, erro de análise, reabertura após salvar e disponibilidade da timeline nas três etapas.
- Emulação de toque via CDP: pinça na timeline e rolagem vertical sobre a prévia.
- Feed e pausa/sincronização testados pela interface real, com respostas da API simuladas. Persistência/reabertura validadas no contrato real e no estado devolvido pelo endpoint de teste; não equivalem a um salvamento autenticado no serviço online.
- Exportação real inspecionada com ffprobe: MP4, vídeo H.264 e áudio Opus; amostra móvel 6,934567 s. O navegador não disponibilizou AAC nesse teste. Nenhuma compatibilidade de upload no Instagram foi afirmada.
- Áudio: silêncio, clipping, ruído estacionário, zumbido e eventos sintéticos; gravações reais CC0 de chuva, fogo e água no grafo offline. Picos de saída medidos aproximadamente -2,83 / -0,73 / -1,01 dBFS. Chuva permaneceu praticamente no mesmo RMS; fogo/água ganharam aproximadamente 3,8–3,9 dB, sem amostras saturadas.

Problemas encontrados e corrigidos: ícone de transição cobria alça; atualizações de metadados recriavam alças durante interação; ordenação longa precisava continuar rolando na borda; inicialização de ramos de áudio poderia somar original e tratado no primeiro instante; exportação cancelada precisava rejeitar antes de finalizar o recorder.

## Limites reais

Não houve sessão autenticada do usuário disponível neste navegador para gravar e reabrir publicações no Supabase online. Os testes de escrita usam API/TUS simuladas e validadores reais; o serviço DEV atualizado está disponível para homologação autenticada. Nenhuma publicação existente foi modificada pelos testes.

Não houve teste em aparelhos físicos Android/iPhone, Safari, upload no Instagram nem avaliação auditiva humana. As medições de áudio e inspeções de vídeo não substituem essa escuta. A exportação depende de MediaRecorder/canvas e dos codecs do navegador; onde MP4 não é suportado, continua informando indisponibilidade em vez de renomear outro formato. Análise usa `decodeAudioData`; formatos não decodificáveis preservam original. Exportação em tempo real exige a aba ativa. Não há processamento no servidor ou transcrição.
