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
