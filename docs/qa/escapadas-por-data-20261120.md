# Escapadas por datas no Ville Moments

A seleção de chalé, entrada e saída carrega a oferta ativa de Escapada por consulta real, mesmo fora da janela de sugestões automáticas. As fotos e o vídeo usam o mesmo catálogo e renderizador do Ville Moments. O fluxo não cria nem edita uma publicação.

Editar escapada e Carregar escapada por datas abrem villemoments-escapadas.html. O período do cartão selecionado é passado na URL. Trocar datas, hóspedes ou chalé invalida a prévia e o valor anterior. Uma resposta atrasada não pode restaurar esse valor. O download reconfirma exatamente a mesma seleção.

O overlay compartilhado não desenha mais a chamada nem o botão de WhatsApp nos vídeos exportados.

Validação: 56 testes de fluxo, modelo, compositor e timeline passaram. Testes adicionais verificam consulta de datas fora da janela automática, mudança de chalé, descarte de resposta antiga, ausência de gravação de postagem e ausência de CTA no vídeo. Build WhatsApp e sintaxe passaram. O catálogo público foi conferido. O teste completo do navegador continuou impedido por socket() Operation not permitted antes de abrir a página; o download via MediaRecorder em dispositivo real não foi validado neste ambiente.
