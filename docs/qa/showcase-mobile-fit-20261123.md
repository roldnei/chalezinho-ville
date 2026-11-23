# Vitrine móvel por disponibilidade — 23/11/2026

Cada grupo de datas ocupa uma altura de tela, descontando o menu inferior e a área segura do aparelho. A grade divide o espaço restante em três, duas ou uma linha, conforme os cards efetivamente disponíveis no catálogo. O cabeçalho com datas fica fora dessa divisão. Não houve alteração de preços, reservas, mínimos ou disponibilidade.

O CSS móvel é carregado depois da campanha Black Friday e substitui as proporções de imagem que alongavam os grupos com um ou dois chalés. Mantém fotos, pontos de enquadramento, valores, desconto, links e ações. O desktop conserva o layout anterior. Detalhes abrem em diálogo no celular, com fechamento e retorno ao foco e à posição da página.

Validação: 18 testes existentes de vitrine, proxy e imagens passaram. O teste adicional de detalhes móveis passou, incluindo datas e URL de reserva preservadas, card fechado, retorno de foco e restauração da rolagem. Build WhatsApp e verificação de sintaxe passaram.

Prévia em navegador real com fixture de catálogo, scripts reais, CSS e fontes DM Sans/Playfair do site. Grupos com três, dois e um chalé foram conferidos em áreas móveis de 320×568, 360×640, 390×740 e 430×860. Quando o grupo está alinhado ao topo, cabe acima do menu inferior; cards têm alturas iguais dentro do grupo, sem transbordamento dos controles nem valores sobre os botões. A tela de 320×568 usa uma composição mais compacta. As dimensões são áreas de conteúdo do navegador, sem a barra externa do aparelho. A rolagem normal da página continua disponível para chegar à vitrine e às outras seções.

As fixtures usam dados fictícios, não consultam o PMS e permanecem apenas em tests/fixtures. As duas páginas temporárias de prévia foram removidas da árvore de publicação. Não houve teste em aparelho físico; o navegador em nuvem foi usado com viewports de iframe para conferir os limites da grade.
