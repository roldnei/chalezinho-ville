# Escapadas automáticas em vídeo

A área promocoes.html agora lista os cartões reais de /api/stay-showcase, com filtro pelo chalé e intervalo de entrada. Cada vídeo usa uma única estadia e as mesmas fotos do catálogo do Ville Moments.

Prévia e exportação usam VillegramTimeline.renderSequenceFrame, com a identidade, datas, preço anterior e total desenhados sobre as cenas. A consulta do preço reconfirma o mesmo imóvel, pacote, hóspedes, tarifa e datas; falhas não usam valores históricos nem trocam o pacote por hospedagem simples. Fotografias não exigem AudioContext para gravar o vídeo.

Editar abre o compositor já existente em villegram-admin.html; importar copia uma nova composição sem publicar ou alterar a Escapada automática. Criar nova abre o mesmo editor. Salvar rascunho preserva a edição. A exportação pode ser feita sem publicar.

## Validação

- Modelos de filtro, identidade da estadia e fotos: passaram.
- Regressões do editor, importação da Escapada, rascunhos, mídia e publicação: 41 passaram.
- Regressões de timeline, efeitos, seleção de tarifa e comunidade: passaram.
- Verificação de sintaxe e build WhatsApp: passaram.
- O renderizador real gerou quadros diferentes com movimento, preços/datas gravados na imagem e saída de referência H.264 de 720 x 1280. O arquivo de referência foi codificado com FFmpeg para verificar os quadros; não comprova a gravação pelo MediaRecorder do navegador.
- Teste de navegador móvel escrito em tests/browser/escapadas-video.spec.mjs. A execução foi impedida pelo ambiente antes de abrir a página: Chromium socket() Operation not permitted. A prévia pela ferramenta do navegador também não alcançou o servidor local. O download completo por MediaRecorder em um dispositivo real permanece sem validação neste ambiente.
