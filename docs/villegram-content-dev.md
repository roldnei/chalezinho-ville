# Villegram — desenvolvimento e verificação de 06/10/2026

## Escopo e preservação

O trabalho partiu de `eeded3731368c7e50dacdc327c26f127cecf0be8`, confirmado como HEAD remoto antes da implementação. O código existente foi ampliado; a vitrine, as páginas dos chalés e o motor de reservas foram mantidos. Atualizações da branch usam comparação do HEAD para evitar sobrescrever trabalhos concorrentes.

Somente DEV (`pxfqmnhqodqyaaqeyjgr`) recebeu migrações e a função `villegram-content`. A função recusa execução em qualquer outro projeto. Nenhum deploy de produção foi feito. `booking-engine`, webhook PagBank, políticas e contratos publicados não foram alterados. A reserva recebeu apenas integração opcional de atribuição e encaminhamento da experiência escolhida.

## Implementado

- Home móvel abre o Villegram; computador preserva a vitrine. Navegação fixa: Villegram, Chalés, Escolher datas e Minha conta, além de Site completo.
- Publicações próprias, separadas das ofertas: autor, origem, título/legenda, fotos ou vídeo, capa, enquadramento, vínculos, ação, ordem, destaque, status e datas. Curtidas/comentários usam a publicação, preservando as interações antigas das ofertas.
- Editor em `villegram-admin.html`, acessível pelo painel existente: mídia privada, fotos do catálogo ou upload, prévia, rascunho, edição com proteção contra conflito, publicação e arquivamento. Equipe autorizada publica; hóspedes não recebem permissão pública. A origem `guest_submission` e o estado `pending_review` são estrutura para uma etapa futura.
- Fotos normalizadas/comprimidas em WebP com orientação EXIF; vídeo MP4/WebM até 120 segundos e 50 MiB, capa separada e enquadramento inteiro por padrão. Upload TUS em blocos de 6 MiB com retomada e progresso. Falhas da capa preservam o vídeo já enviado. Não existe transcodificação/compressão automática de vídeo.
- Motor automático compõe fotos reais de chalés, experiências, ofertas e conteúdo de orientação. Modelos, textos, movimento, frequência e publicação automática são configuráveis. Por padrão gera rascunhos. Chaves estáveis impedem duplicação, substituição de edições e republicação de conteúdo arquivado. O cron verifica a geração de hora em hora; a frequência configurada define quando novos itens de catálogo podem ser gerados. Não produz um novo post idêntico a cada execução.
- Nove apresentações do catálogo DEV foram geradas, revisadas e publicadas para conferir o feed. Datas/preços das ofertas são ligados à vitrine atual; não ficam incorporados à mídia. Disponibilidade/preço são reconfirmados pelo fluxo existente de reserva. Nenhum desconto, avaliação, escassez ou previsão de procura foi criado por este motor.
- Troca de reel depende do visitante. Leitura/detalhes pausam mídia e navegação, som começa desligado, há alternativas por botões/teclado, imagens horizontais podem ser vistas inteiras e posição/foto são restauradas ao retornar. O feed é finito e diversifica os próximos itens, preservando o item atual.
- Elegibilidade, preferência explícita de datas/motivo, cliques/curtidas, variedade e oportunidades de calendário orientam regras iniciais de ordenação. Tempo de tela não determina interesse. O aprendizado permanece neste navegador; não é um modelo preditivo nem personalização entre dispositivos.

## Sinais e atribuição

Cada navegador tem um identificador de visitante; a sessão usa 30 minutos de inatividade. A visualização é identificada separadamente e começa após 800 ms de apresentação ativa. Pausa, painel de leitura e aba oculta não somam tempo. Recarregamento/retorno em até 30 minutos preserva a visualização. A fila retenta eventos com identidade estável; o banco usa unicidade `(view_id, kind, sequence)` e o relatório considera o maior tempo acumulado por visualização, não a soma dos checkpoints.

São coletados exibição, tempo ativo, conclusão/repetição, passagem rápida, curtida, comentário, compartilhamento, aberturas, inclusões, consulta de datas e intenção de reserva. GPC/Do Not Track desativam a telemetria. Os sinais anônimos representam observações do cliente, não prova de pagamento ou intenção causal.

A atribuição é a última publicação com ação explícita no mesmo navegador, em até 24 horas, preservada no login. Na criação do pagamento, uma chamada autenticada verifica propriedade da reserva direta e existência da visualização correspondente. A atribuição é única por reserva. Falha de atribuição não interfere no pagamento; há retomada na página da reserva. Reserva iniciada é registro de servidor; reserva paga exige reserva confirmada e pagamento PagBank confirmado, excluindo mock e cobranças de outro tipo. O painel apresenta visualizações, visitantes/sessões, interesse/cliques, consultas, intenção, reservas iniciadas e pagas. A associação não demonstra causalidade.

## Evidências e limites da verificação

Prévia efetivamente usada no navegador: https://chalezinho-ville-dy6oa8kkv-roldneicosta-4140.vercel.app/ — commit `00f786e7041a23821c2fa497e2353c1c20aa3ed7`. As correções posteriores recebem outra prévia DEV; não houve verificação visual dessa versão após o bloqueio descrito abaixo.

| Jornada | Evidência obtida |
| --- | --- |
| Home desktop e entrada no feed | Navegador; vitrine existente preservada, Villegram aberto pelo menu |
| Home móvel e navegação fixa | Navegador em iframe responsivo de 390 × 844; abertura automática e acesso aos controles, sem simular aparelho físico |
| Som, pausa e compartilhamento | Navegador; alternância de som/pausa, painel de compartilhamento e cópia com mensagem de sucesso |
| Legenda e avanço | Navegador; legenda aberta, tentativa de avançar permaneceu no mesmo reel; avanço após fechar mostrou outro tipo de publicação |
| Comentários | Painel abriu no navegador; publicação de comentário não foi exercitada |
| Datas, hóspedes e motivo | Navegador; preenchidos 16–19/11/2026, 2 hóspedes e Romântico; busca entrou direto no resultado, sem repetir formulário durante carregamento |
| Login e painel da equipe | Login seguro abriu o editor e mostrou publicações, controles, automação e relatório. Interações posteriores foram bloqueadas pela proteção de credenciais do navegador |
| Upload, capa, edição, rascunho, publicação e arquivo | Testes automatizados de UI/serviço/retomada e banco; NÃO certificados no navegador com Supabase real |
| Experiências, troca de motivo, preços, duas tarifas, retorno após login e pagamento | Cobertura existente de reserva continuou passando; jornada completa real no navegador NÃO concluída |
| Feed vazio, links compartilhados, indisponibilidade, mídia, retomada e falhas | Cobertura automatizada e tratamentos implementados; conexão lenta/erros de serviço/mídia NÃO exercitados no navegador |

Capturas desta execução: `villegram-desktop-first.jpg` e `villegram-mobile-dates.jpg`. Foram produzidas no navegador, antes do bloqueio, e disponibilizadas na entrega. Não são imagens geradas nem evidência das etapas pendentes.

Validação final: **296 testes aprovados** (269 anteriores + 27 novos), `npm run check` e `npm run typecheck` aprovados. Novos testes cobrem RLS/privilégios, dados inválidos, identidades e deduplicação, elegibilidade/geração, atribuição e exclusão de pagamentos mock, recomendações, leitura/pausa, links antigos/compartilhados, restauração de foto, feed vazio, ciclo do editor e upload retomável com falha de capa.

Verificação DEV após a jornada pública: 17 reservas, 18 pagamentos, hash das reservas `2dc8cb6ea8ca709e00810222c61938a7`, igual ao inicial. Bucket privado; geração automática configurada para aprovação (`auto_publish=false`). Os sinais reais vistos no banco incluem visualização, progresso, conclusão/repetição, compartilhamento, inclusões e consulta de datas. Não se geraram reservas/pagamentos para fabricar métricas de conversão.

## Pendências concretas

1. Retomar uma sessão de navegador segura e completar os testes de editor/upload com Supabase real e toda a composição/finalização da reserva. O navegador bloqueou as operações após a entrega segura das credenciais; novas tentativas de documento/runtime também foram recusadas. Não se contornou a proteção.
2. Verificar visualmente a última prévia de correção, com celular e computador. Capturar editor, ofertas, experiências, tarifas e preservação pós-login.
3. Exercitar no navegador conexão lenta, falhas de upload/serviço/mídia, oferta indisponível e feed vazio. Os testes automatizados não substituem essa verificação.
4. Validar atribuição de uma reserva/pagamento PagBank sandbox pelo fluxo completo; a lógica está implementada e testada, mas nenhuma conversão real nova foi criada nesta execução.
5. Compressão/transcodificação de vídeos, geração de arquivos de vídeo, recepção/moderação de vídeos de hóspedes e recomendação entre dispositivos não foram implementadas. A composição automática de fotos funciona sem gerar arquivos de vídeo.

Esta entrega representa implementação DEV com validação visual parcial; não está homologada para produção.

## Ajuste de navegação e orientação por gesto — 06/10/2026

Após as capturas enviadas pelo proprietário, a navegação móvel do feed e do site convencional foi uniformizada. Os quatro destinos usam os mesmos rótulos e ícones SVG decorativos: reel, chalé, calendário e conta. O CSS dos links deixa de herdar maiúsculas e espaçamento do menu geral. Curtir, comentar e compartilhar também receberam ícones, mantendo os nomes acessíveis.

“Quero estes dias” usa um formato explícito e consistente de botão, com ícone de calendário, contraste, largura disponível inteira e alvo mínimo de 54 px. O vínculo preserva chalé, oferta e datas. A área reservada à barra inferior foi atualizada para comportar ícones e rótulos.

No computador, os controles têm rótulos “Reel anterior” e “Próximo reel”, ícones maiores e alvo mínimo de 156 × 56 px. No celular, permanecem alternativas tocáveis de 48 × 48 px. Os nomes acessíveis correspondem aos rótulos visíveis.

A dica móvel “Arraste para cima” aparece uma vez por sessão, por aproximadamente quatro segundos. Um ícone de mão e um movimento discreto de 18 px ensinam o gesto no reel atual; a dica NÃO navega para outro item. Interação, legenda/painel, fechamento e aba oculta removem a dica. Preferência por movimento reduzido recebe orientação estática.

Validação: 300 testes passaram (quatro novos), checagens JavaScript/TypeScript e build local DEV aprovados. Os testes novos verificam a cascata de estilos com o CSS real do site, os vínculos de reserva, nomes acessíveis, expiração da dica sem avanço, interrupção ao ler e movimento reduzido. Após alinhar os nomes acessíveis dos controles, os quatro testes específicos foram executados novamente.

A tentativa de abrir o navegador nesta continuação foi recusada pela mesma proteção de credenciais: “native credential state cannot be safely resumed”. Não foi possível obter novas capturas ou conferir visualmente estes ajustes. A prévia DEV será disponibilizada com essa limitação explícita; não se declara teste de tela concluído.


## Ajustes de layout e tempo — 6 de outubro de 2026

O CTA usa margens simétricas; a margem da coluna social afeta somente os textos. Curtir, comentar e compartilhar têm apenas ícones visíveis, mantendo nomes acessíveis e a quantidade de curtidas no nome do controle. A reserva usa cabeçalho no fluxo normal e etapas em três colunas, evitando a sobreposição com a marca.

O contorno oval da pausa mostra o tempo restante do ciclo completo das fotos (6,5 s por foto) ou a duração real do vídeo. Pausas, leitura e aba oculta congelam o relógio; retomar preserva o tempo restante. O ciclo nunca muda o reel automaticamente. Quatro novos testes verificam o layout, os controles sociais, o relógio das fotos e o relógio do vídeo.

A abertura da prévia no navegador continua bloqueada: “Browser observation is unavailable because native credential state cannot be safely resumed. Start a new browser runtime to continue.” Portanto estes ajustes ainda não têm validação visual nem novas capturas de tela.


## Contador durante a consulta de ofertas — 6 de outubro de 2026

O feed inicial contém seis publicações; três ofertas elegíveis podem chegar depois da consulta de preços. Antes, o total era atualizado internamente sem atualizar o contador do reel já aberto. O primeiro permanecia “1 de 6” e só ao avançar aparecia “2 de 9”.

Agora o total fica oculto enquanto a consulta está pendente (“Reel 1”). Ao receber as ofertas, contador e setas são atualizados no próprio reel, preservando mídia, relógio, pausa, rolagem e painéis abertos. O conteúdo atual e o histórico não mudam de ordem. Dois testes reproduzem a chegada tardia das ofertas com leitura aberta e a atualização dos limites das setas.

O navegador continua recusando observação devido ao estado protegido de credenciais. Estes ajustes não têm novas capturas ou validação visual; os testes usam DOM e serviço simulado.


## Publicação manual após upload — 7 de outubro UTC / 6 de outubro em São Paulo

O vídeo manual “Vinho no SPA aquecido?” foi enviado integralmente (39.856.960 bytes, 9,706521 s) e recebeu uma capa privada. A auditoria registrou três salvamentos publicados e dois salvamentos posteriores como rascunho. O último retirou a publicação do feed. Os vínculos permaneciam ativos.

O editor mostra o estado atual e um link direto ao reel. Quando o registro já está publicado, oferece “Salvar alterações” e preserva esse estado inclusive ao enviar o formulário com Enter; salvar rascunho fica disponível para registros não publicados. Arquivar continua sendo uma ação explícita. A mensagem de sucesso usa o estado devolvido pelo servidor. Dois novos testes usam o clique dos botões reais e envio nativo do formulário no DOM, incluindo upload de vídeo, edição e arquivamento.

A publicação existente foi recolocada em published somente no DEV por pedido de recuperação do usuário, mantendo mídia, texto, vínculos, datas e identidade. A alteração foi auditada e protegida pela versão updated_at, validade dos vínculos, permissão do autor e existência dos dois arquivos no Storage. Não houve mudança de esquema ou de contratos. A reprodução visual do vídeo continua pendente enquanto o navegador estiver bloqueado.


A inspeção posterior mostrou que a capa enviada estava completamente preta (2.248 bytes). O original foi baixado por URL assinada do feed DEV e decodificado localmente: HEVC 10 bits, HLG/BT.2020, áudio AAC e rotação vertical. Foi extraído um quadro do primeiro segundo, ajustado de HDR para SDR e inspecionado visualmente. A nova capa WebP tem 720×1280, 56.672 bytes e SHA-256 6170b7ac883fcff4e0bdb42a5d0d687311ab6ef42eea582b245903ddee7d1f1f.

A capa foi gravada em um novo caminho no bucket privado, mantendo o original, e vinculada ao mesmo reel com proteção updated_at e auditoria. O reparo único foi executado pela implantação administrativa DEV da função; esse código provisório foi retirado em seguida. A função villegram-content está na versão 5, com o código normal anterior e as verificações de administrador preservadas. Não foi criado endpoint de reparo ou liberado o bucket.

A geração de capas do editor passa a aguardar o seek de um quadro após o início do vídeo, verificar dimensões e rejeitar canvas completamente preto com mensagem explícita. 309 testes passaram e o build DEV passou. A compatibilidade de reprodução do HEVC em todos os navegadores e a jornada visual de publicação continuam sem validação no navegador bloqueado; não foi implementada conversão automática de vídeos para H.264.

## Editor visual em etapas — 7 de outubro UTC / 6 de outubro em São Paulo

A interface de publicação foi reorganizada sobre o editor existente, sem alteração de schema, permissões, API ou registros. O fluxo inicia em **Mídia e capa**, segue para **Legenda** e termina em **Publicar**. As etapas têm botões, foco acessível e alternativa de voltar; falta de mídia ou de título/legenda impede avançar. A validação mostra a etapa do campo que falta, em vez de tentar focar campos escondidos.

Uma composição vertical permanece visível no computador e precede os controles no celular. Título, legenda e CTA se atualizam sem reconstruir a mídia ou reiniciar o vídeo. O vídeo usa controles nativos e começa sem som. Essa composição é uma aproximação visual: a prévia existente “Ver como visitante” continua consultando o servidor para conferir oferta, inclusões e preço atual.

Miniaturas selecionam a mídia em edição; os ajustes exibem apenas essa mídia. A seleção de capa, ordem das fotos, cena inteira, preenchimento vertical, posição e instante da capa continuam usando os arquivos e metadados existentes. Foi corrigido o tratamento de posição 0 no feed, para preservar o alinhamento escolhido no editor. Um upload ou salvamento pendente bloqueia operações concorrentes no compositor; a conclusão ou falha libera os controles e mantém a possibilidade de retomar o upload existente.

A etapa final mostra os vínculos pertinentes ao tipo/ação (sem apagar vínculos adicionais já salvos), descreve o destino do botão e recolhe ordem, destaque e validade em “Mais opções”. “Minhas publicações” abre a biblioteca para edição, mantendo filtro e arquivamento. A edição de uma publicação já publicada preserva esse estado; rascunho e publicação usam a mesma identidade de registro.

Cobertura nova: voltar entre etapas conserva legenda, capa, mídia e enquadramento; validação e foco; prévia não reinicia vídeo ao escrever ou navegar; biblioteca e edição de publicação existente; upload lento e erro de reprodução; alinhamento do feed corresponde ao editor. São 313 testes automatizados, usando DOM/serviço simulado para o compositor. Não são testes de navegador.

Limitações concretas: não foram implementados corte da duração, trilha musical, filtros, transições editáveis nem conversão automática de HEVC/HDR. A tentativa de retomar a observação do navegador retornou “native credential state cannot be safely resumed”. A interface ainda não tem homologação visual em celular/computador nem novas capturas reais; não se declara a jornada de tela validada.

## Enquadramento imediato, ordem por arraste e datas definidas — 7 de outubro de 2026

O diálogo de fotos apresenta imediatamente o recorte por CSS; alterar formato ou posição não depende de uma nova codificação da imagem. A confirmação aplica o recorte à imagem original. No compositor, aproximação e posições horizontal/vertical atualizam a mesma mídia, sem reiniciar o vídeo. Eixos sem área disponível para deslocamento ficam desativados até aproximar ou preencher a cena. Esses metadados também são usados no feed.

As miniaturas permitem segurar por 320 ms e arrastar para outra posição. Há indicação da posição de destino, rolagem nas bordas e alternativa por Alt+setas. A mídia selecionada e a capa são preservadas pela identidade do objeto. A capa não altera mais a sequência de reprodução das fotos.

Para “Quero estes dias”, a equipe pode escolher chalé, entrada, saída, hóspedes e um pacote de estadia existente opcional. O cálculo consulta o motor atual, mostrando as duas tarifas completas e a composição de hospedagem, limpeza e pacote, inclusive descontos já cadastrados. É obrigatória a escolha explícita da tarifa apresentada. Não há seletor novo de experiências individuais: o campo de experiência continua um vínculo editorial; a composição comercial usa os pacotes existentes.

Somente datas, hóspedes e código da tarifa são persistidos em `stay_selection`; preços nunca são gravados na publicação nem no vídeo. A consulta pública `villegram_quote` é somente leitura, restrita ao projeto DEV, e não cria cotações, reservas ou pagamentos. Publicação e prévia consultam novamente a disponibilidade; o feed omite uma publicação com datas indisponíveis em vez de substituir suas datas. O botão preserva a escolha até a revisão existente, em que o hóspede confirma a tarifa. O modo anterior de ofertas sugeridas pelo calendário permanece disponível.

A migração `20261007033341_villegram_stay_selection.sql` foi aplicada somente no DEV. As funções DEV booking-engine v55 e villegram-content v6 receberam a integração, preservando as dependências financeiras e as verificações de autorização existentes. Nenhuma implantação ou alteração de schema foi realizada no PROD.

Validação anterior à publicação: 326 testes passaram, além das checagens JavaScript/TypeScript, build DEV e verificação de diff. A cobertura nova verifica transformação imediata, arraste/capa, geometria publicada, seleção explícita das duas tarifas, inclusão/remoção de pacote, descarte de respostas antigas e links de reserva com datas fixas. São testes automatizados de DOM e serviços; não equivalem a testes de tela.

Consultas HTTP reais no DEV validaram Ville Signature de 03/11 a 05/11/2026, dois hóspedes: sem pacote, totais 151760/141530 centavos; com o pacote Escapada a dois, 144267/134548 centavos. A diferença inclui os descontos e preços atualmente cadastrados no DEV, sem alterar o catálogo. Duas publicações temporárias permitiram conferir no feed os totais e vínculos calculados pelo servidor; ambas foram removidas. As contagens de reservas, pagamentos e cotações permaneceram iguais; não se afirma imutabilidade de todos os registros financeiros, pois um hash de pagamentos mudou durante a execução.

Na retomada, o reset do runtime seguido da abertura da prévia voltou a retornar: “Browser observation is unavailable because native credential state cannot be safely resumed. Start a new browser runtime to continue.” Portanto permanecem pendentes testes visuais de enquadramento/arraste, upload/publicação, feed e retorno da reserva em celular e computador. Não há novas capturas desta versão nem homologação visual. Não foi implementado corte da duração de vídeos ou conversão automática de HEVC/HDR.

## Manipulação direta da foto — 7 de outubro de 2026

A prévia de fotos recebe pinça de dois dedos para aproximar/afastar (1× a 3×) e arraste para reposicionar a parte ampliada. O cálculo mantém o ponto da pinça sob os dedos e limita a posição ao conteúdo disponível. A passagem de dois dedos para um preserva a continuidade; troca de mídia/etapa cancela o gesto. Não se substitui a imagem nem se altera o arquivo original durante o ajuste.

Botões sobre a prévia permitem escolher capa, preencher/mostrar a cena inteira, aproximar, afastar e restaurar. Os sliders permanecem em “Ajuste preciso de enquadramento”, recolhido inicialmente. Há alternativa por teclado: mais/menos, setas e zero. A superfície de gesto existe apenas para fotos e na etapa de mídia, preservando os controles nativos do vídeo. A prévia móvel foi ampliada dentro da altura disponível.

A ordenação por pressão longa agora mostra uma barra branca entre as miniaturas, com posições antes/depois de cada foto e no final da sequência. Soltar aplica exatamente essa posição; cancelar preserva a ordem. A seleção e a capa continuam vinculadas à mesma mídia. Movimento antes de completar a pressão longa cancela a ordenação, permitindo rolagem normal.

Três testes adicionais simulam eventos de ponteiro com geometria de imagem: pinça/arraste e persistência; limites, troca de mídia e controles sem toque; barra de inserção, cancelamento e preservação da capa. São 329 testes automatizados. Gestos reais no dispositivo e capturas atualizadas continuam dependentes da recuperação do navegador virtual; testes DOM não equivalem à homologação visual. Esta alteração é somente de interface, sem nova migração ou implantação de função Supabase.
