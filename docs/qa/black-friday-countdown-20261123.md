# Black Friday — contador e presente — 23/11/2026

Destaque em preto e dourado exclusivo na home dos chalés, com −15%, contador de dias/horas/minutos/segundos e a experiência romântica exclusiva para reservas dos chalés Signature, Essenza e Amore de duas noites ou mais confirmada até 27/11/2026 às 23h59 em Brasília. A data da hospedagem pode ser futura, conforme disponibilidade.

O relógio usa o limite absoluto 2026-11-28T00:00:00-03:00 e não reinicia em recargas. Ao expirar, oculta presente, desconto e selos Black Friday e apresenta campanha encerrada com link para opções disponíveis. O presente acompanha somente os resumos do WhatsApp dos três chalés; a confirmação e entrega continuam no atendimento, sem inclusão de SKU pago nem alteração dos valores da cotação.

Validação: cinco testes da campanha passaram, incluindo limite de fuso, recarga, mínimo de noites, estado encerrado e integração com o fluxo atual de consulta/WhatsApp. Doze testes de catálogo, páginas e busca dos apartamentos também passaram. Sintaxe e build WhatsApp passaram.

A suíte antiga public-consultation-ui falha em sua fixture, que não fornece property_type=chalet exigido pelo filtro atual, antes de alcançar a mensagem do WhatsApp. A mesma falha foi reproduzida com booking.js da produção anterior, sem esta alteração. Foi adicionado teste do fluxo atual com a fixture correta para verificar a condição promocional e os valores preservados.

A revisão automática recusou criar um link público da prévia por risco de divulgação de conteúdo privado. Nenhum bypass ou novo link foi criado. A validação continuou sem esse compartilhamento. A página temporária bf-countdown-qa.html foi removida da árvore pública; a fixture fica somente em tests/.

Correção de escopo: o banner do presente foi retirado da coleção de apartamentos e sua menção foi removida das mensagens de atendimento dos apartamentos. A elegibilidade exige explicitamente CH1, CH2 ou CH3 e rejeita imóveis sem identificação, códigos de apartamentos ou tipo incompatível. O prazo e o mínimo de duas noites foram preservados.
