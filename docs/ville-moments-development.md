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
