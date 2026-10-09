# Ville Moments — desenvolvimento

Implementação no projeto existente, branch `feature/romantic-stay-offers`. Banco isolado `pxfqmnhqodqyaaqeyjgr`; nenhum deploy ou alteração de banco em produção. O preview verificado é https://chalezinho-ville-1id7oma5q-roldneicosta-4140.vercel.app/ (commit 187c2c8; alterações posteriores documentadas neste mesmo histórico).

## Implementado

- Home: cada escapada tem ações distintas de assistir e reservar. Ville Moments abre o card escolhido; setas, teclado e gesto vertical mudam a oferta por ação do visitante. Fechar devolve foco sem deslocar a home.
- Páginas dos três chalés e imóveis genéricos: mesma apresentação filtrada pelo cadastro do imóvel. Datas alternativas mantêm a oferta; hospedagem simples permanece acessível.
- Componente em diálogo nativo, CSS próprio, compra ao lado das fotos no desktop e apresentação vertical no celular. Fotos inteiras, zoom/pan/afastamento suaves, pausa, preferência de movimento reduzido, leitura e visibilidade. Carregamento da cena atual/próxima e capa da próxima oferta.
- Catálogo único: fotos por imóvel, ordem, giro/enquadramento com prévia, mensagem, movimento e áudio no cadastro de estadias completas. Prévia de edição sem preço inventado ou reserva de uma oferta ainda não publicada.
- Imagens: decodificação EXIF antes da renderização em Canvas; conversão para WebP sem orientação residual. Giro e recorte são gravados como nova imagem. Ao salvar a oferta, referências públicas à imagem anterior são sincronizadas em capas, galerias, mídia de experiências e ofertas. Arquivos originais e contratos não são sobrescritos. Existem upload de mídia e controle de versão concorrente no cadastro atual.
- Áudio desligado inicialmente. Acordes originais da referência adaptados com volume suave, envelopes, transição ao trocar de oferta, suspensão na leitura/segundo plano e encerramento ao fechar. Arquivo opcional exige origem e declaração de licença comercial; nenhum áudio externo foi adquirido ou usado.
- Interações persistentes: chave de curtida por oferta/usuário, estado desejado idempotente; comentários autenticados, limite, identificação pelo primeiro nome, texto escapado no navegador, repetição protegida por ID da submissão e remoção administrativa com histórico/auditoria. Tabelas com RLS e sem permissões diretas para clientes; o motor existente autentica cada escrita. Assistir e consultar não exigem login.
- Compartilhamento nativo quando disponível, cópia e WhatsApp por ação do visitante. Link preserva identidade, imóvel e datas; metadados de título, descrição e imagem. Datas fora do feed são reconsultadas, sem persistir cotação; indisponibilidade/expiração oferece outras datas. Não houve envio de mensagens.
- Sugestões no servidor, reutilizando calendário, PriceLabs, antecedência, estoque e capacidade do motor existente. Diversidade de imóvel/duração, prioridade a intervalos exatos entre reservas confirmadas e dias úteis. Categoria de comemoração separada. Cache curto; reserva sempre recalcula.
- Feriados nacionais de 2026 reconhecidos; datas locais/outros anos configuráveis no PMS. Fonte: Portaria MGI 11.460/2025, calendário 2026, publicada no DOU em 30/12/2025, reprodução oficial https://www2.unifap.br/prosear/files/2026/01/Portaria_Gov_MGI_11460_de29_de_dezembro_de_2025_Feriados-Nacionais-de-2026.pdf . Pontos facultativos não são automaticamente classificados como feriados.
- Desconto de comemoração somente com autorização explícita no PMS. A oferta DEV foi inicializada com comemorações habilitadas e desconto nessas datas desabilitado, preservando 5% nos dias úteis. Na reserva, o preço anterior da oferta agora usa o bruto da própria tarifa, alinhado ao trip, em vez de uma tarifa de referência diferente. Sem dados comerciais suficientes de procura, a apresentação informa que usa regras de calendário; preço barato ou data livre não é prova de baixa demanda.

## Efetivamente verificado

| Verificação | Evidência / alcance |
|---|---|
| Testes automatizados | 259 testes aprovados; tipos TypeScript, sintaxe e build com bloqueio de produção. Incluem simulações JSDOM/serviços; não representam homologação de pagamento. |
| Feed real do DEV | 18 cards, três imóveis, duas/três noites; 10 oportunidades de comemoração com desconto zero. |
| Valor real | Essenza, 7–9/10/2026, duas noites: bruto 126120, desconto 6306, total 119814 centavos; igual no feed, na reconsulta do link compartilhado e na tarifa não reembolsável da reserva aberta pelo Ville Moments no navegador. |
| Navegador desktop | Home e página Essenza abrem oferta, composição, preço, pausa/continuação, próximas ofertas, comentários públicos, compartilhamento e áudio por toque. |
| Celular | Página real em viewport de 390 × 844 por iframe de teste; largura interna/rolagem 390; rodapé corrigido para 60 px; preço e CTA visíveis. Não é homologação em aparelhos físicos. |
| EXIF/giro | Fixture JPEG 120 × 80 com EXIF 6 decodificada em 80 × 120; giro manual à direita produziu WebP 120 × 80, confirmado no navegador. Fixture de teste identificada. |
| Persistência | Transação no banco real verificou chave única de curtidas, comentário removido e sincronização de capa/galeria; rollback ao final para não deixar dados de QA. |
| Acesso | API pública de interações retornou 200; curtir, comentar e remover sem sessão retornaram 401. RLS habilitado e zero permissões para anon/authenticated nas tabelas. |
| Indisponibilidade | Reconsulta de 2–4/11 no Essenza e datas passadas retornou 409, sem preço substituto. |
| Preservação | 17 reservas e 18 pagamentos permanecem; nenhum novo pagamento/reserva nesta integração. Hash dos snapshots pela mesma consulta permaneceu 76529154109ce028345ca33478cb3e2a entre conferências finais. |

## Limitações identificadas

- O PMS foi aberto no navegador, mas o login retornou “Não foi possível conectar ao serviço de login ... Sua senha ainda não foi validada”. Não se repetiu a tentativa nem se contornou a autenticação. Salvamento autenticado de fotos/áudio, publicação e moderação pela interface ainda precisam de validação com sessão administrativa. A persistência SQL transacional e as restrições da API foram verificadas; isso não substitui esse teste de interface.
- Os componentes e preços dos pacotes DEV continuam demonstrativos. Não foram inventadas inclusões de bebida, queijos ou frutas. Fotos obedecem aos vínculos atuais do PMS, sem importar as associações ilustrativas do HTML separado; confirmação editorial da entrega e da licença das mídias cabe ao conteúdo comercial.
- Não há histórico comercial suficiente no banco isolado para previsão de demanda, ritmo de reservas ou procura. O algoritmo usa regras de calendário e intervalos confirmados, sinalizados como tais.
- Feriados locais e calendário dos próximos anos precisam ser cadastrados/revisados. Arquivos externos de áudio precisam de comprovação de licença pelo responsável antes de ativação.
- Qualidade sonora em iPhone/Android físicos, compartilhamento nativo nesses aparelhos, preferência real de movimento reduzido e transições em segundo plano precisam de homologação nesses dispositivos. O código cobre esses ciclos; não foram apresentados como testes físicos concluídos.
- Prévia de desenvolvimento permanece protegida pelas regras existentes da Vercel; a leitura de cartões Open Graph por plataformas externas depende dessa proteção. Não foi criado bypass nem ampliado acesso público.
- A integração não alterou o motor financeiro nem repetiu estornos sandbox pendentes de etapas anteriores.
