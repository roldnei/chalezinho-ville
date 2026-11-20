# Escapadas: preço em dez parcelas

Todos os exportadores de escapadas exibem `10x174,41`, com `10x` menor e o valor maior, já na lista e na prévia. A renderização do vídeo usa a mesma função da prévia.

O cálculo parte sempre da cotação original em centavos: acréscimo de 7%, seguido da divisão por dez e arredondamento da parcela para centavos. Uma nova consulta não reaplica acréscimos ao valor armazenado. A cotação original e os preços de reservas não são alterados. Preço anterior riscado usa a mesma base de parcelamento.

Validação: 51 testes de preço, seleção por datas e integração com o editor aprovados; sintaxe dos três scripts e build do perfil WhatsApp aprovados. Renderização real do canvas em 720×1280 conferida com foto e preço de exemplo. Gravação MP4 no navegador não foi reexecutada nesta mudança; o overlay compartilhado foi testado e renderizado.
