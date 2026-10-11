# Primeiro Trip com os três chalés — 11/10/2026

## Implementação

O feed de descoberta começa com um único Trip de apresentação dos chalés ativos, na ordem Signature, Essenza e Amore. Ele alterna três fotos reais distintas, mantendo nome, comodidade principal e destino de Conhecer sincronizados. Seletores com os três nomes permitem escolher sem esperar a animação e pausam a apresentação. Focar o botão do chalé ou os controles sociais mantém a cena parada durante a interação. A animação de arrastar para cima e a navegação inferior permanecem.

Fotos inspecionadas visualmente como arquivos reais do repositório:

- Signature: `assets/ch1-04-piscina-chale-dia-opt-w1152.webp`, piscina e chalé ao fundo, posição vertical 65%.
- Essenza: `assets/manifesto-hidro-romance-1-opt-w1152.webp`, hidro em primeiro plano, posição 80%.
- Amore: `assets/03-banheira-petalas-compartilhada-opt-w1200.webp`, hidro com pétalas, posição 80%.

Os arquivos possuem hashes diferentes. A associação das imagens usa o catálogo visual existente, inclusive a fotografia compartilhada cadastrada no Amore; não representa uma nova sessão de fotos exclusiva de cada unidade. Nenhuma imagem foi gerada, substituída ou apagada.

Cada botão abre a página correspondente: chale-premium.html, chale-com-hidro.html e chale-romantico.html. Essas páginas mantêm a consulta pelo WhatsApp do lançamento. O Trip de abertura não cria reservas, holds, preços persistidos ou cobranças.

Curtidas/comentários usam a publicação editorial existente de cada chalé quando disponível. A foto, identidade e publicação ficam congeladas ao interagir, evitando atribuir a ação ao chalé seguinte. A apresentação não recebe um ID fictício de publicação. Caso falte a publicação correspondente, só o compartilhamento permanece disponível nessa cena. As regras de recursos por ambiente e as permissões de servidor não mudaram.

As publicações existentes continuam no feed. Entradas por link de uma publicação ou pelo feed de pessoas seguidas mantêm o destino original. Recarga/retorno recuperam a cena escolhida somente quando a posição salva pertence a esse mesmo Trip. O compartilhamento da apresentação aponta a `index.html?view=moments&intro=1`, sem datas ou oferta inventadas. Modo de movimento reduzido conserva a escolha manual dos três chalés.

## Validação e limites

- 41 testes automatizados relacionados passaram: villegram-intro, villegram-navigation, villegram, public-consultation. Cobrem imagens distintas, nomes/destinos sincronizados, seleção manual, pausa por foco, navegação, retorno/recarga, movimento reduzido, entrada compartilhada, feed de pessoas seguidas, propriedade inativa/ausente, IDs sociais corretos e proteções de consulta/pagamento. DOM/CSS e relógio são JSDOM/fixtures; não equivalem à validação visual num navegador ou aparelho físico.
- `npm run check`, verificações finais de sintaxe, build WhatsApp DEV e `git diff --check` passaram.
- Leitura HTTP real de public_feed DEV retornou os três chalés ativos e suas três publicações editoriais: Signature `4069a585-7cc6-48ad-9263-567358a45c0c`, Essenza `4fe5af08-361d-441c-a8e1-6fbb871df3e9`, Amore `b62d6d66-86d7-4802-94d3-bb93376a2f03`. As chamadas de inspeção foram public_feed; não acionam geração automática de publicações. Não houve envio de mensagem, comentário, curtida ou reserva de teste.
- A conferência visual do novo Trip em computador/celular e o screenshot permanecem pendentes, porque o navegador de validação ficou bloqueado pela proteção de credenciais da autenticação anterior. As imagens foram inspecionadas diretamente, e a interface foi testada em DOM simulado. Não houve tentativa de contornar a proteção.

## Ambientes e retorno

Alteração somente na branch DEV feature/staged-whatsapp-launch do repositório roldnei/chalezinho-ville, sobre `0f137ea757f88b56de4a06f4bf88a195d1b413c4`. Vercel chalezinho-ville; DEV Supabase pxfqmnhqodqyaaqeyjgr; PROD irxsaladqhbzhkoaclxy. Não houve publicação/promover deployment, alteração de configuração ou de dados de produção. Não houve migração nem alteração de banco DEV nesta etapa.

Retorno: reverter o commit desta apresentação na branch DEV e gerar outra prévia. A prévia anterior continua disponível como referência; não é necessário restaurar ou apagar dados. A versão completa com checkout e Feelings continua preservada para homologação no perfil checkout-development.

## Ajuste após imagem do aparelho do usuário, 19:22

A imagem enviada confirma o primeiro Trip com os três seletores na interface real do aparelho do usuário. A pedido dele, texto, seletores e botão foram deslocados juntos para baixo: afastamento inferior de 156 para 124 px (32 px de deslocamento); em telas de altura até 680 px, de 144 para 124 px (20 px). Permanecem a navegação inferior, os ícones laterais e os links sincronizados. Foi atualizada a versão de cache do CSS. Essa imagem evidencia a posição anterior; a posição nova ainda não foi validada visualmente neste navegador, que continua bloqueado pela proteção de credenciais.
