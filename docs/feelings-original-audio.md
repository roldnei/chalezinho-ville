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
- Sem recuperação de clipping, vento forte ou remoção de conversas. O tratamento v2 acrescenta atenuação multibanda conservadora, descrita abaixo. Falha de decodificação mantém original e informa na interface.

## Contrato e consistência

`audio_treatment` v1 ou v2 é opcional por vídeo, validado no backend (ganho, filtros, estados e até 240 picos de waveform). URLs arbitrárias de som continuam proibidas; propriedade da mídia e aprovação de hóspedes não mudam. Arquivos originais são mantidos. Não foi necessária migração de banco: metadados ficam no JSON de mídia já existente.

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


## Evolução de limpeza local — 09/10/2026

`villegram-audio-dsp.js` compartilha o banco de 12 faixas entre análise e um AudioWorklet causal. O piso estimado de cada faixa é seu percentil 20 em janelas de 50 ms; o contraste com o percentil 90 limita a ação automática. Faixas graves relativamente persistentes recebem no máximo 6 dB de atenuação; faixas superiores variáveis recebem no máximo 2 dB. Isso é uma estimativa acústica, não identificação semântica de ar-condicionado. Não distingue perfeitamente vento/água de máquinas.

A abertura rápida (2 ms) e o fechamento suave (70 ms) preservam ataques e evitam ligar/desligar o som abruptamente. Ganhos são ligados entre os canais para preservar o estéreo. Filtros complementares recompõem a entrada exatamente quando a atenuação é zero. Não há lookahead ou deslocamento de amostras no DSP; buscas reinicializam o histórico. A velocidade continua aplicada pelo elemento de vídeo, que é o relógio da montagem.

A suavização de caudas usa a queda de energia em relação a uma referência com decaimento de 160 ms. A ação automática é limitada a 1,5 dB quando há contraste temporal suficiente; a escolha explícita “Mais limpeza” permite até 3 dB nas caudas e acrescenta até 3 dB de redução por faixa (máximo 9 dB). Isso não é deconvolução nem remoção completa de reverberação: reflexões que coincidem com o som desejado permanecem. Sons constantes não são tratados como uma cauda só por serem constantes.

Ao limpar um fundo, não há ganho positivo nem compressor de cena com compensação automática que volte a elevá-lo. A proteção comum de saída permanece. “Original / Tratado” e as duas intensidades participam de desfazer/refazer e do JSON de mídia. O backend aceita os perfis v1 existentes e valida rigorosamente os novos vetores e intensidades; nenhuma migração ou alteração de mídias/publicações antigas.

A prévia, o feed e a exportação carregam o mesmo processador. Carregamento tem prazo de 10 s e pode ser tentado novamente. Falha mantém o original com aviso na reprodução; a exportação recusa produzir um resultado com tratamento diferente do salvo. Não é carregado modelo de IA, não há transcrição e os arquivos originais nunca são substituídos.

Validação adicional: 148 testes Villegram; amostras sintéticas de ruído, impulso com cauda, silêncio, clipping e estéreo em oposição de fase; reconstrução sem atraso em 8/44,1/48 kHz. Duas gravações de celular de 1,90 e 3,90 s, além dos sons naturais, usadas na análise e na interface. Fontes HEVC foram convertidas localmente para H.264 mantendo o AAC de origem para teste no Chromium; não se afirma suporte HEVC universal.

O Playwright foi atualizado de 1.55.1 para 1.62.1 para resolver o travamento documentado de AudioWorklet (https://github.com/microsoft/playwright/issues/37592). O servidor local permite explicitamente o módulo do worklet, que é carregado fora da interceptação de páginas. A validação também corrigiu rolagem programática tardia que podia pausar o vídeo e reforçou o estado visual das opções de áudio.

Supabase exclusivamente DEV: `villegram-content` v21, somente o validador de timeline foi substituído a partir da função v20. Permanecem os limites de homologação: browser móvel emulado, API/TUS simulados, sem aparelho físico, sem sessão autenticada para escrita online e sem escuta crítica humana. Medições não certificam qualidade perceptiva nem remoção total de reverberação.

Medições das cópias de celular com “Mais limpeza”: energia abaixo de 500 Hz caiu 4,46 dB e 3,65 dB. Essa faixa inclui tanto ruído quanto som natural, portanto os números não são uma medida isolada de HVAC/SNR. Correlação cruzada da saída PCM encontrou deslocamento de 0 e −1 amostra a 48 kHz. As cópias para avaliação são MP4/H.264 720×1280 + AAC 48 kHz, com originais preservados. A exportação do navegador continua dependente dos codecs disponíveis.

Jornadas adicionais exercitadas com as duas gravações: upload real pelo seletor, análise, duas intensidades, comparação, desfazer/refazer, salvamento/reabertura na API simulada, prévia no feed e exportação real, em 390×844 e 1920×1080. Falha de carregamento do worklet foi simulada: prévia avisa e mantém original, exportação rejeita. Cancelamento da exportação continua rejeitando a gravação parcial; temporizadores são liberados mesmo antes de iniciar o recorder.
