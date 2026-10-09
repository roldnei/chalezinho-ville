# Ville Moments — desenvolvimento

Base: `feature/romantic-stay-offers` em `85d6cbcd96dc935b9bb34d09553b773ee4fac4d4`.
Branch de entrega: `feature/ville-moments`. Nenhuma publicação em produção.

## Alterações

- Marca Chalezinho Ville e localização no feed, inclusive em entradas compartilhadas.
- Entrada simplificada a pedido do usuário: sem apresentação promocional e sem as abas Descobrir/Seguindo sobre as fotos. A coleção continua na navegação inferior e Seguindo continua acessível pelo perfil.
- Conteúdo de imóvel usa nome e resumo/tagline do cadastro; ofertas mostram datas com ano, noites, hóspedes, preço, inclusões e condições.
- Publicação de hóspede preserva autoria e legenda; seu vínculo com imóvel é discreto e não vira uma chamada comercial principal.
- Os links de ofertas conservam chalé, hóspedes, oferta e datas; levam um total de referência para avisar mudanças na nova consulta. A tarifa continua exigindo escolha expressa.
- Nome público Ville Moments e formato Trips. Rotas, nomes de arquivos, eventos, tabelas, permissões e APIs legadas foram mantidos por compatibilidade. Nenhuma migração de dados é necessária.
- Assets alterados receberam uma nova versão de cache.

## Evidência de validação

- `npm run check`: passou.
- `npm run typecheck`: passou.
- `npm test`: 403 testes passaram, nenhum falhou.
- Testes DOM cobrem navegação, entrada compartilhada, links antigos de oferta, datas/experiências, estado de reserva/login, editor, comunidade/moderação, notificações e interações. Novos testes verificam marca/localização, total de referência e ação discreta de hóspede.
- Build verificou o projeto Supabase de desenvolvimento e a proibição de produção.
- Prévia Vercel criada como Preview, sem target de produção.

## Limitações reais

A inspeção visual no navegador e jornadas autenticadas contra o backend não foram concluídas. O navegador local foi bloqueado pela restrição de sockets do ambiente. A prévia na nuvem exige autenticação da Vercel; a revisão automática rejeitou a criação de um link temporário sem autenticação. Testes DOM e de contratos não substituem testes visuais mobile/desktop nem uma reserva real no sandbox.

Pendente validar visualmente legibilidade, áreas seguras e sobreposições e concluir na prévia as jornadas autenticadas de reserva/pagamento, criação/edição/aprovação, notificações e interações.

### Compartilhamento para Stories
O painel de compartilhamento prepara a mídia original (foto atual ou vídeo cadastrado), permite enviar arquivos pelo compartilhamento nativo quando suportado e oferece download como alternativa. Não exporta animações, trilha separada ou camadas do editor como vídeo. Links da publicação e do chalé e @chalezinhoville podem ser copiados; adesivos Link e Menção são inseridos pelo usuário no Instagram. Não há publicação automática, API de conta Instagram nem garantia de destino Stories no menu do sistema.

Validação: 49 testes de publicações, navegação e compartilhamento passaram, incluindo arquivo MP4, foto, preservação dos links, download sem suporte nativo e falha de rede. Integração real Android/iOS → Instagram ainda depende de teste no aparelho; prévia protegida e navegador local indisponível impedem essa validação neste ambiente.

### Painel de compartilhamento por ícones
A entrada de Compartilhar foi reduzida a WhatsApp, Instagram, Stories e Copiar link, sem URLs visíveis. Instagram/Stories abrem uma etapa compacta com preparação automática, envio/salvar e cópia de Link/Menção. O usuário volta às opções sem perder o arquivo preparado. 50 testes de compartilhamento, navegação e publicações passaram; sintaxe e build DEV aprovados. Validação real no Instagram permanece pendente.

### Editor de estilo e exportação editada
Implementados filtros Original/Aconchego/Suave/Dourado/P&B, vídeo Normal/0,75×/0,5× e modelos Fim de semana/Café a dois/Comemorar. Os modelos acrescentam texto editável e não apagam textos existentes; limite de cinco camadas preservado. Campos opcionais filter/speed são validados no backend e persistidos na mídia JSONB, sem migração. Publicações antigas continuam com Original/Normal. Edge villegram-content versão 16 implantada apenas no Supabase DEV.

A exportação anterior de arquivo original foi substituída por composição vertical 720×1280: enquadramento, filtro, texto do hóspede e assinatura @chalezinhoville em canto livre. Textos de publicações comerciais, preços e controles da interface não entram no arquivo. Exportação de vídeo grava áudio e velocidade em MP4 quando o navegador oferece o codec; informa erro e mantém links quando não oferece. Não há transcrição. A gravação ocorre em tempo real e pode levar a duração final do vídeo; a aba deve permanecer aberta. Não há serviço externo de edição nem envio da mídia a terceiros para processamento.

412 testes passaram, além de syntax/typecheck/build DEV. Os testes de exportação usam canvas/MediaRecorder simulados para conferir texto, formato, velocidade, áudio e limpeza; não comprovam codec real ou resultado visual no Android/iOS. Validação real do editor mobile/desktop e exportação Instagram permanece pendente por proteção Vercel e limitações do navegador local.

### Gestos e modos visuais
Deslize horizontal curto aplica filtros em ciclo (incluindo Original) sem alterar offsets. O nome aparece por 1,1 segundo. Segure 500 ms sem deslocar para entrar em arraste; dois dedos continuam com pinça imediata. Cancelamento não aplica filtro. Remoção de mídia permanece no botão de opções e teclado, sem disputar o gesto de arraste.

Frases-modelo removidas: modos visuais acessíveis por ícone são Original, Respirar (8 s, dissolve e zoom oscilante), Pulso (3,2 s, cortes e zoom alternado) e Cinema (6 s, moldura e movimento lateral). Aplicados ao conjunto de fotos, sem apagar textos ou enquadramento. Prévia no editor e reprodução no feed; movimento reduzido respeitado. Modos não são oferecidos para vídeo, cuja velocidade continua separada. Exportação de foto ainda produz uma imagem estática, não uma montagem animada do conjunto; exportação de montagem completa não foi implementada nesta etapa.

61 testes afetados passaram; typecheck/build DEV aprovados. Interface real e gestos em aparelho permanecem pendentes de acesso à prévia. Persistência compatível via campo opcional mode no JSONB, sem migração.

### Roleta radial e rolagem do editor
Controles de estilo abaixo da foto removidos. Segurar 500 ms sem mover abre roleta na foto: categorias externas Filtros/Efeitos (ou Velocidade para vídeo), categoria inativa opaca, opções por ícones no arco interno. Aplicação imediata, seleção acessível por aria-label/aria-pressed e fechamento por ícone/Escape. Arraste após segurar fecha a roleta e mantém enquadramento; deslize horizontal rápido continua filtros. Vertical livre usa touch-action pan-y e não é cancelado pelo editor antes do hold; pointercancel limpa o temporizador. Nova publicação e entrada inicial centralizam o canvas de upload.

39 testes afetados passaram. Sintaxe e build DEV aprovados. Validação visual e toque real ainda pendentes por bloqueio de acesso à prévia.

### Menu de edição e acesso às seis fotos

A faixa de mídia mantém deslize horizontal imediato, rolagem visível e a foto selecionada acessível após reconstruir/reordenar. As setas adicionais abaixo das miniaturas foram removidas. Segurar continua arraste com rolagem nas bordas; Alt + setas permanece disponível no teclado.

O semicírculo foi substituído por uma roleta horizontal sem painel de fundo. Ela abre diretamente em Filtro, mostra três prévias e destaca a escolha central com 90×120 px; as opções laterais têm escala de 84%, pequena inclinação e opacidade de 36%. Deslizar horizontalmente ou tocar nas laterais escolhe a opção seguinte/anterior, com retorno circular ao início. Setas do teclado também percorrem a seleção. Filtro/Modo (Filtro/Velocidade em vídeo) ficam acima da roleta, com a categoria inativa mais transparente. O nome atual aparece apenas uma vez, abaixo da prévia central. O botão de confirmação fecha a edição e devolve o foco ao ícone de efeitos.

Filtros continuam mostrando a própria foto. Os modos mantêm as prévias animadas: Original estático, Respirar com zoom alternado, Pulso com zoom rápido e Cinema com deslocamento lateral. Os ícones animados de categoria foram preservados e ampliados. As opções acompanham o arraste e usam transição suave ao trocar de posição; preferências de movimento reduzido desativam animações e transições. A rolagem vertical permanece nativa sobre a roleta. Efeitos são aplicados imediatamente e não alteram textos ou enquadramento. Categorias e confirmação têm alvos de 44 px; as laterais deixam uma região livre para toque, mesmo com a sobreposição intencional entre prévias. A foto e as seis miniaturas continuam presentes durante a edição.

Referências de pesquisa: [interface móvel do Lightroom](https://blog.adobe.com/en/publish/2023/07/26/adobe-photoshop-lightroom-has-new-mobile-interface-make-editing-even-easier-on-go), [ferramentas e prévias do VSCO](https://support.vsco.co/en/articles/12698570-vsco-tools-quick-start). Foram usados princípios de agrupamento, hierarquia e prévias visuais. A referência enviada pelo usuário orientou o destaque central e as laterais discretas; a implementação é própria do editor existente.

Validação desta revisão: 42 testes DOM/contratos afetados, checagem de sintaxe e build DEV. Cinco cenários Playwright passaram no Chromium: jornadas de edição em 390×844, 1366×768 e 1920×1080; teste adicional em 320×740 com eventos reais de toque do Chromium e cenário com movimento reduzido. Conferidos tamanho e transparência das prévias, limites da foto, região de toque desimpedida, ausência do semicírculo, deslize horizontal, acesso/reordenação das seis fotos, filtros e modos aplicados e preservados no envio do rascunho, capa preservada e animações desativadas com movimento reduzido. Os testes DOM também verificam navegação circular, teclado, cancelamento de gestos, ausência de clique acidental após arraste e rolagem vertical sem interceptação. Capturas do editor real foram inspecionadas. Backend e sessão desses cenários são fixtures locais, sem acesso à produção.

A integração autenticada na prévia Vercel e o comportamento em Android/iOS físicos continuam pendentes. A validação local no navegador desta revisão substitui a limitação anterior de renderização local apenas para o editor afetado; não comprova reserva/pagamento nem exportação nativa Instagram.
