# Homologação DEV — 7 de outubro de 2026

## Continuação após novo login no PagBank

- Resumo com hóspedes/motivo retestado após login e troca Descanso → Praia, prévia 09c8033a. Captura qa-resumo-hospede-motivo-corrigido.png.
- Nova reserva legítima de teste pela home: 7DACD19663 / 0b2b90ff-9581-43b5-9c66-abe945c9924c, CH1 09–11/10, reembolsável R$ 2.130,80, cartão sandbox 1x aprovado. Não alteradas datas de reservas existentes.
- Caução 11aa2ab3-5646-439f-8af5-c7d6e841980c: autorização R$ 500, cobertura do checkout confirmada. Ocorrência sintética com foto/recibo enviada, aprovada e capturada pela interface em R$ 180. Pedido ORDE_BB75D5AC-1E00-478D-AAFB-668FE1712A34, cobrança CHAR_B7C6B76C-7547-435F-87C1-9665CA4AA1A2. Portal mudou de Autorizado para Pago; ainda mostra total original R$ 500. Consulta autenticada ao provedor em 08/10 02:48:56 UTC confirmou paid_cents=18000, refunded_cents=0. Evidência qa-caucao-parcial-180-provedor.json. Saldo não capturado R$ 320, liberação ainda NÃO confirmada.
- Estorno parcial de R$ 30 da captura solicitado uma vez pela interface: pendente, código 40008, confirmado zero. Não reenviado.
- Encontrado ao iniciar outro cenário: fechar recibo pago não descartava a retomada, reabrindo a cobrança anterior na próxima busca. Corrigido encerramento apenas para estados definitivos; resultado incerto preserva recuperação. Teste novo passou junto aos cinco de retomada. Reteste visual pendente da prévia.

- Suíte consolidada da versão a6d5f85e: 395 testes aprovados, zero falhas. Reteste em 360 px confirmou recibo independente após reload e clique para a reserva correta A6D3B69F79, saldo zero.
- Portal DEV autenticado: pedidos ORDE_88DF8F5E-2130-4180-8FA1-7BF471FED5E6 (6x, R$ 1.267,11), ORDE_9C8A6C18-4E0A-43BA-B500-8584C09F6505 (1x, R$ 2.008,40) e ORDE_421AC1B3-8076-416D-A872-AF82CB84C2B0 (12x, R$ 362,29) continuam como Pago. Não há confirmação de devolução desses cartões. Nenhuma operação incerta foi reenviada.
- PIX ORDE_8004D581-8E5C-44EC-9780-1411D02A31B2 aparece Cancelado, coerente com estorno confirmado de R$ 1,00 no DEV. O status isolado Cancelado não foi usado como única prova de estorno.
- Pedido mais recente ORDE_59EEE66B-7A5C-48D3-B8B0-F79874BAF315 confirmado no portal como Pago, 1x, R$ 1.362,87.
- Capturas reais: qa-portal-cartao-6x-ainda-pago.png, qa-portal-reembolsavel-ainda-pago.png, qa-portal-12x-pago.png, qa-portal-pix-cancelado.png e qa-portal-1x-pago.png, em outputs do workspace. Portal no viewport nativo da aba.
- Home → datas 17–19/11 → um hóspede → motivo Descanso → Amore → tarifa reembolsável explícita → finalização: motivo preservado, dois imóveis ocupados bloqueados. Identificada ausência de quantidade de hóspedes e motivo no resumo final. Acrescentados esses dados sem alterar cotação/preço/política. Sintaxe e nove testes focados passaram; reteste visual na nova prévia pendente.
- Histórico do portal nas páginas 1 e 2 mostrou pedidos/consultas, sem log de cancelamento correspondente às tentativas de 07/10. Isso não prova ausência de requisição, nem fornece corpo bruto de erro. Mantidos os códigos registrados no backend.

Em execução. Não constitui aprovação para produção.

Base remota conferida: `feature/romantic-stay-offers`, `0d97d9ac3caa41c4bb992dd7ecd59a7671309ee0`.
Prévia inicial: https://chalezinho-ville-3u4bprt40-roldneicosta-4140.vercel.app/
Somente Supabase DEV `pxfqmnhqodqyaaqeyjgr`. Nenhuma alteração em PROD.

## Método e matriz

Executar entradas reais, conferir estados no navegador, cruzar operações financeiras com banco/provedor, corrigir e repetir os caminhos afetados. Resultados automatizados não substituem observação visual.

| Jornada | Estado | Evidência parcial |
| --- | --- | --- |
| 1. Ville Moments visitante | Em execução | 360×800: 13 trips, mudo, legenda pausa vídeo, avanço/pausa, like exige login, retorno ao primeiro trip, consulta de datas |
| 2. Site convencional | Em execução | Home aberta; demais caminhos pendentes |
| 3. Composição A–F | Em execução | Hospedagem simples: datas/motivo preservados; duas tarifas sem seleção; escolha reembolsável |
| 4. Login/finalização | Em execução | Erro de senha e tentativa correta; composição preservada; aceite único; marketing opcional desmarcado |
| 5. Pagamento/pós-reserva | Em execução | PIX sandbox gerado; aguardando provedor; não aprovado como pago |
| 6. Hóspede/comunidade | Não testada ainda | — |
| 7. Administração/aprovação | Não testada ainda | — |
| 8. Operação/conteúdo | Não testada ainda | — |

## Evidências iniciais

- `node --test tests/*.test.mjs`: 380 aprovados, 0 falhas. Log externo `outputs/homologation-20261007-tests.txt`.
- O navegador integrado abriu a prévia normalmente; não reproduziu o bloqueio de credenciais relatado na Work anterior.
- Capturas reais em `outputs/qa-360-villegram-legenda.png`, `outputs/qa-360-reserva-tarifa.png`, `outputs/qa-360-pix-gerado.png` (workspace externo ao repositório).
- Em 360×800, o formulário do Ville Moments levou diretamente aos resultados, com estado de carregamento sem repetir o formulário.
- Hospedagem CH1, 08–10/12/2026, 2 hóspedes, motivo romântico: reembolsável R$ 1.853,60; não reembolsável R$ 1.723,30. Ambas inicialmente desmarcadas.
- Conta sintética de hóspede `ffcf6506-52ab-4b43-8aae-286eb682c673`, criada via Auth signup; confirmação preparada administrativamente apenas para a fixture. Isso **não** comprova entrega/ativação por e-mail. Credencial fora do repositório.
- A identificação por passaporte foi recusada com mensagem explícita de CPF necessário ao PagBank. A fixture foi ajustada para CPF sintético exclusivamente em DEV; nenhuma identidade real alterada.
- Reserva PIX `CCE36EF281` / `ce04f831-24e9-4ce8-99ff-575b36708085`: `pending_payment`, R$ 1.853,60, `refundable`, `romantic`. Pagamento `a83e62a7-777c-43fb-b054-5bb00c96b93c`, provedor `pagbank_sandbox`, cobrança `CHAR_C590E108-F562-46E1-8F3A-FCBABB79DE08`, `awaiting_payment`, 185360 centavos. Estado consultado aproximadamente 20:40 UTC; pagamento ainda não confirmado.

## Limites da evidência

## Segunda rodada — evidências observadas

- Prévia `4mngwuwba`, commit `a7e77f9c593d12babe984831e6b8ceb1d4c5ff3b`: correção de composição após reload confirmada em 412×915. Oferta CH3, 03–05/11, reembolsável e café adicional preservados, total R$ 1.363,87. Captura `qa-412-reserva-restaurada.png`.
- Cartão sandbox em 6x, reserva `A3A4AE758C` (`42f6a741-cd30-4929-8069-26ed18c6cb0b`), R$ 1.267,11 aprovado e confirmado no navegador e banco. Duplo clique gerou somente um pagamento (`8fb1e48c-bb7e-41e1-8696-518ccbadf410`). Cobrança `CHAR_06C5840D-D2B1-4061-B5E6-81B93EBF009E`.
- Compra posterior de café: carrinho separado, cobrança PIX de R$ 1,00, pagamento `239e50de-bbd5-42b8-aa61-097c22f5b5fe`, cobrança `CHAR_ACE8CFFB-9E92-49B2-B95C-FF90C9EE8A8B`. Tela e banco confirmaram pagamento e inclusão; total recebido/contratado R$ 1.268,11, saldo zero.
- PIX original de hospedagem expirou naturalmente. Banco `expired`; Minha conta exibiu Não confirmada / Pix expirado. Não houve alteração de relógio.
- Portal DEV PagBank pediu novo login. Conferência direta no portal ainda pendente; não confundir confirmação de tela/banco com essa conferência.
- Cartão testado retornou somente 1–6 parcelas após consulta do BIN; 12x ainda não concluído. A interface removeu a seleção inválida e exigiu nova escolha.
- Perfil sintético público `qa_20261007` salvo; upload real de duas fotos sintéticas (horizontal/vertical), indicador de envio desapareceu, alternância preencher/inteira e texto sobre imagem funcionaram. Rascunho salvo e reaberto após reload, enviado para aprovação. Conta administrativa separada recebeu uma pendência e abriu a fila correta. Aprovação/retorno ao hóspede em conferência.
- Ville Moments em 412 px: identificados aviso de mídia cobrindo CTA e evento tardio de vídeo causando TypeError. Correções de código com regressão automatizada; publicação/reteste visual da segunda correção pendentes.
- Duas referências inexistentes do café (`assets/02-cozinha.webp`, `assets/ch2-01-cafe.webp`) removidas somente do catálogo DEV e da publicação automática `d9246b7a-b8e6-4b0d-abb9-c1bb6035f069`, preservando as três imagens válidas e capa. Backup externo `outputs/qa-dev-media-backup.json`. Bootstrap corrigido para não recriar referências. Nenhuma migration/função/PROD alterada.
- Suíte completa após correções de vídeo: 382 testes aprovados, zero falhas; log `outputs/homologation-20261007-tests-final.txt`. As jornadas completas continuam em execução, sem homologação global.

Viewport emulado não equivale a Android físico. Nenhuma jornada completa está aprovada ainda. Cadastro/recuperação por e-mail precisam de observação própria; a fixture não substitui esses testes.

## Rodadas 3–5 — atualização de 7/10, 21h10 de São Paulo

Os estados acima são históricos. A homologação global continua em execução.

- Commits de correção publicados em DEV: `a7b33ba6` (vídeo/mídia), `d84da153` (primeira cotação com experiência, conciliação exibida e mensagem de pagamento), `e2636277` (recusa definitiva permite nova consulta sem aviso de cobrança incerta).
- Última prévia verificada nesta rodada: https://chalezinho-ville-rfkefcj38-roldneicosta-4140.vercel.app/ (`e2636277ca15363e5f746dc225ef5a7ad6cd7076`).
- Suíte completa: **388 testes aprovados, zero falhas**, `outputs/homologation-20261007-tests-round4.txt`. Ajuste adicional remove o texto transitório após resultado definitivo e aplica o estilo do site à nova consulta; quatro testes focados passaram.
- Reserva `A3A4AE758C`: pagamento base de R$ 1.267,11 em 6x também observado no Portal DEV PagBank como Pago, pedido `ORDE_88DF8F5E-2130-4180-8FA1-7BF471FED5E6`. A sessão expirou novamente ao abrir outro pedido.
- Alteração dessa reserva para 05–07/12: diferença principal R$ 321,86, juros R$ 40,43, total R$ 362,29 em 12x. Cartão aprovado; datas só mudaram após pagamento. Total contratado/recebido R$ 1.630,40, saldo zero. PIX anterior da diferença foi recusado, sem alterar a estadia.
- Cancelamento da tarifa não reembolsável dentro da janela comercial gratuita prevista no documento 1.2: PIX do adicional devolveu R$ 1,00, confirmado. Cartões R$ 1.267,11 e R$ 362,29 retornaram HTTP 400 / código 40008; nova tentativa preservando a chave retornou HTTP 409 / código 40005. Permanecem incertos, sem declarar estorno concluído. Não repetir com nova chave.
- Entrada pela experiência café reproduziu primeira cotação sem adicional. Corrigida e retestada no navegador: CH1 14–16/12 com café R$ 1,00, total reembolsável R$ 2.009,40. Cartão recusado gerou pagamento `fac30909-75db-4154-ab4b-c2945dfbbaee`, reserva `F827519812`, não confirmada. Correção da recusa retestada em 412×915; nova consulta funcionou.
- Nova hospedagem simples, mesmas datas, tarifa reembolsável explicitamente escolhida: reserva `3FE63C8A42` / `ce6e4063-294a-4ea2-b7d9-e1104a7a53f8`, R$ 2.008,40 em 1x. Pagamento `9e4e90ef-d768-4fe7-8a13-193fb65b05f8`, cobrança `CHAR_D81465EA-940A-4AA5-AFFD-3FBD3615793D`: paid/confirmed no banco e aprovado na tela. Link de sucesso abriu Minhas reservas.
- Cancelamento dessa tarifa reembolsável solicitado pelo hóspede e aprovado pelo administrador pela interface. Em **08/10/2026 00:06:07 UTC** (07/10 21:06:07 São Paulo), tentativa retornou exatamente `pagbank_charge_operation_http_400_code_40008`. Estorno `5434e8f6-1901-4793-95ae-6554c456b92a`, solicitado 200840 centavos, confirmado zero, estado `uncertain`. A reserva permanece ativa. Não há corpo bruto do provedor nesta evidência; o código vem do registro de tentativa do backend.
- Avatar: upload da imagem sintética vertical, recorte, zoom e salvamento único com perfil observados. Perfil público mostrou avatar, nome, @ e bio, sem contatos/documentos/reservas.
- Momento `97488a91-b378-4d8d-8cb1-76c676b5e6f6`: aprovado anteriormente; edição da legenda e reenvio colocaram novamente em aprovação. Aviso administrativo atualizou para 1 sem apagar a composição da equipe. Abrir fila não aprovou. Devolução com motivo arquivou o momento, removeu a pendência e notificou o hóspede. Minhas postagens mostrou motivo e link Editar.
- Motor automático: Gerar agora não criou duplicatas e preservou nove publicações existentes. Prévia de Signature abriu. Publicação manual sintética da equipe salva como publicada (`57f9d9ff-9082-45bd-ae17-5247fce5f9a4`); conferência no feed/arquivamento ainda pendente.

### Matriz atual — sem aprovação indevida de jornadas completas

| Jornada | Resultado atual | Pendências concretas |
| --- | --- | --- |
| 1. Ville Moments visitante | Bloqueada para conclusão da homologação | Parte observada; faltam feed vazio, falhas de serviço, compartilhar e todos os retornos/origens |
| 2. Site convencional | Bloqueada para conclusão da homologação | Home/consulta/experiência testadas; completar limites, indisponibilidade e navegação de volta |
| 3. Composição A–F | Bloqueada para conclusão da homologação | A, pacote, adicional, reload e oferta observados; falta matriz completa de trocas e duas origens |
| 4. Login/finalização | Bloqueada para conclusão da homologação | Login e preservação testados; e-mail real, recuperação e sessão expirada não comprovados nesta rodada |
| 5. Pagamento/pós-reserva | Reprovada | Estorno de cartão não confirmado (40008/40005); concorrência/garantia e análise ainda incompletas |
| 6. Comunidade | Bloqueada para conclusão da homologação | Foto/perfil/rascunho/moderação observados; vídeos, falha de upload, seguir/marcar e gestos completos pendentes |
| 7. Aprovação | Bloqueada para conclusão da homologação | Aprovar/devolver/notificar e composição preservada observados; disputa de versão, paginação e falha de serviço pendentes |
| 8. Operação/conteúdo | Bloqueada para conclusão da homologação | Motor e publicação manual observados; edição de catálogo, atribuição e eventual proprietário pendentes |

“Bloqueada para conclusão” nesta matriz indica cobertura incompleta, não necessariamente impedimento técnico. Não se trata de aprovação de produção. Nenhuma função ou migration foi publicada nesta rodada.

Capturas adicionais reais em outputs do workspace: `qa-412-recusa-corrigida.png`, `qa-412-cartao-1x-refundavel.png`, `qa-412-avatar-recorte.png`, `qa-412-perfil-publico.png`, `qa-412-momento-devolvido.png`, `qa-estorno-refundavel-40008.png`, `qa-motor-previa-real.png`. As capturas com prefixo 412 foram feitas na prévia e2636277 com viewport 412×915; painel/motor/estorno usam a prévia a7e77f9c e viewport nativo da aba. Não são Android físico.

## Rodada 6

- Prévia `c9b48cae`: https://chalezinho-ville-4itvdiikn-roldneicosta-4140.vercel.app/. Navegador 1440×900 confirmou conciliação corrigida: R$ 1,00 devolvido e R$ 1.629,40 pendente, código 40005 sem botão para criar nova devolução. Captura `qa-1440-conciliacao-corrigida.png`.
- Publicação manual fictícia apareceu no feed; hóspede comentou e a apresentação permaneceu pausada. Administrador arquivou a publicação. Reload do endereço público exibiu aviso de indisponibilidade e feed alternativo, sem o conteúdo arquivado. Captura anterior ao arquivamento `qa-412-publicacao-equipe.png`.
- Estadia `[QA 20261007] Estadia sintética pausada` criada e editada pela interface, somente CH2, café incluído, mínimo de duas noites, desconto/vitrine desativados. Reload preservou essas opções. Permanece pausada.
- Experiência `[QA 20261007] Pacote fictício pausado` criada pela interface, R$ 2,00, um item fictício, somente CH2, foto sintética. Permanece pausada.
- **Erro reproduzido:** upload de arquivo acima de 10 MB exibia “Fotos adicionadas”, apesar de não adicionar foto. Corrigido preservando erro e quantidade realmente enviada. Durante upload, salvar/trocar cadastro/ativar/excluir ficam indisponíveis; falha de rede restaura controles. Adicionado nome acessível ao seletor de experiência.
- Suíte completa após correção: **390 testes aprovados, zero falhas** em 44 s (`outputs/homologation-20261007-tests-round6.txt`). Dois testes novos cobrem rejeição por tamanho e falha de rede com restauração de controles. Reteste visual da correção de upload pendente da próxima prévia.
- Hóspede tentou abrir admin.html: interface informou acesso restrito, sem carregar reservas administrativas. Isso não substitui auditoria de autorização da API.

## Rodada 7 — retomada e vídeos

- Prévia `d6c0911f`: https://chalezinho-ville-2bk3lweui-roldneicosta-4140.vercel.app/. Reteste visual em 1440×900: arquivo acima de 10 MB mostra rejeição, foto válida seguinte enviada, controles desabilitados durante envio e liberados depois, salvamento confirmado. Captura `qa-1440-upload-limite-corrigido.png`.
- Logout administrativo levou ao login e removeu dados. Login como hóspede no mesmo domínio não mostrou links de administração; nova entrada em admin.html foi bloqueada, sem reapresentar dados administrativos anteriores. Rota de moderação com hóspede retornou `admin_required` e não expôs fila/contagem.
- Editor 360×800: MP4 inválido e MP4 MPEG-4 Part 2 rejeitados como formato não reconhecido. Não basta extensão MP4. Vídeo sintético H.264/yuv420p 360×640, 3 segundos, foi aceito, enviado e decodificado com readyState 4 e sem erro. Prévia visual mostrou padrão de cores, controles e duração. Rascunho de vídeo iniciado.
- **Erro reproduzido:** após rejeição do vídeo, aviso central interceptava o clique no botão de novo envio; Enter no botão funcionava. CSS corrigido para o aviso não interceptar cliques, mantendo botão de retry interativo. Reteste após publicação ainda necessário.
- Capturas reais `qa-360-video-invalido.png` e `qa-360-video-h264.png`. Vídeos gerados localmente para teste, sem pessoas/dados reais. Nenhum teste em Android físico.

## Rodada 8 — texto, retomada e anfitrião

- Prévia `01615f49`: https://chalezinho-ville-k82eo9whk-roldneicosta-4140.vercel.app/. Erro de vídeo novamente provocado; novo clique no centro do botão abriu seletor e foto válida concluiu upload. Correção de interceptação retestada.
- Duas fotos: Alt+seta reordenou preservando capa; remover exigiu ação explícita em Opções da mídia. Zoom/restauração e texto na cena testados. Duas caixas mantiveram estilos independentes: primeira dourada/negrito/fundo escuro, segunda branca/normal/transparente. Seleção de “Se” na segunda caixa aplicou negrito somente a esse trecho. Setas e + alteraram posição/tamanho. Rascunho salvo. Captura `qa-360-retomada-textos.png`. Não comprova pinça/arraste em Android físico.
- Vídeo H.264 salvo como rascunho, recarregado, localizado na biblioteca e reaberto com mídia/legenda preservadas.
- Fixture de anfitrião `c2e7acf3-dee9-45fc-a27c-dd06eee6065a`, exclusivamente DEV, escopo CH1 e sem finanças/gestão de equipe/edição de anúncios. E-mail confirmado administrativamente para fixture, sem alegar teste de entrega real.
- Navegador mostrou apenas CH1 nas reservas e a própria pessoa em Equipe. API hub retornou property_ids/reservation_property_ids/task_property_ids `[1]`; pagamentos/cobranças/garantias vazios; listing list HTTP 403 `listing_access_denied`. Evidência externa `outputs/qa-host-api-scope.json`.
- Corrigidos links administrativos visíveis ao anfitrião sem acesso e rótulo “Próxima” em reserva passada ainda sem entrada registrada. São ajustes de apresentação, sem mudar autorização ou status de reserva. Oito testes de escopo/PMS passaram; reteste da apresentação depende da próxima prévia.

## Rodada 9 — concorrência real entre duas contas

- Duas sessões em prévias DEV, uma com hóspede e outra com anfitrião fictícios, partiram das entradas reais e cotaram CH3, 20–22/12/2026, duas pessoas, tarifa reembolsável R$ 2.234,00. Nenhuma tarifa veio previamente selecionada.
- Primeira sessão gerou PIX sandbox: reserva `293DA17BE1` / `3b429156-8fc5-4953-bfa2-eaa645151cbd`, pagamento `5a0914d6-e743-48f8-a626-bd538de94743`, aguardando pagamento. Segunda sessão foi inicialmente barrada por passaporte sem CPF; a identificação exclusivamente fictícia foi ajustada para CPF de teste, preservando as contas reais.
- Segunda tentativa às 00:37:51 UTC de 08/10 recebeu `occupied`, confirmado pelo evento `payment_failed`. Consulta ao banco mostrou somente a primeira reserva/pagamento nesse chalé/período. Nenhuma duplicação ou segunda cobrança.
- **Erro de apresentação:** `occupied` caía em mensagem genérica. Incluído no tratamento de indisponibilidade, orientando voltar e escolher outro chalé/período. Sintaxe validada; reteste visual da mensagem depende da prévia seguinte.
- A disputa testada é entre duas cotações abertas antes do primeiro bloqueio; não equivale a disparo simultâneo no mesmo milissegundo. PIX permanece de teste, sem simular pagamento no banco.
- Reteste em `bbea9008`, prévia https://chalezinho-ville-5qs6ycce7-roldneicosta-4140.vercel.app/: duas cotações CH3 23–26/12 abertas antes do bloqueio; anfitrião criou reserva `AB663DD524` / `9bc04fe7-02f3-4f01-94bc-bc9dcb066df2`, PIX sandbox `ca2c43cc-5b50-462e-b8a2-17d7299fde21`. Hóspede recebeu a mensagem corrigida de datas indisponíveis e conseguiu voltar/trocar para CH2. Captura `qa-concorrencia-corrigida.png`.
- Login com senha intencionalmente incorreta: erro apresentado, senha limpa; tentativa correta preservou CH3/datas/tarifa/total. Consulta de uma noite em 26–27/12 mostrou zero opções e mínimo de três noites nos três chalés, sem permitir avançar.
- Prévia `90ad53d7` mostrou menus do anfitrião sem atalhos administrativos/edição de imóveis indevidos; reservas passadas usam “Entrada não registrada”. Captura `qa-host-pms-corrigido.png`.
- CH2, 23–26/12: hospedagem simples reembolsável R$ 4.515,20; pacote romântico R$ 4.516,20; pacote + café R$ 4.517,20. Experiência romântica incluída não foi oferecida como adicional duplicado. Valores são configurações de teste preexistentes, não alteradas.
- Ao trocar de chalé, tarifas anteriores ainda apareciam durante o carregamento. Removido o grupo anterior ao abrir a nova cotação. Sete testes focados de cotação/parcelas/resultados passaram; reteste visual pendente da próxima prévia.

## Rodada 10 — oferta paga, comunidade e retomada

- Prévia `9b0a6ce6` (3lvv6du1e): troca Signature → Essenza não mostrou mais tarifas antigas durante carregamento; captura `qa-troca-chale-tarifas-corrigidas.png`.
- Hóspede e anfitrião fictícios: ativação de perfil público, seguir, notificação de novo seguidor e aceite de convite funcionaram. Reuso do convite foi recusado. Aceitar acompanhante não expôs as reservas privadas do titular. Feed de pessoas seguidas sem conteúdo elegível mostrou estado vazio. Captura `qa-notificacao-seguidor.png`.
- Renovação agendada da garantia `b1b764c8-7060-4a21-b541-265d7111e472`: nova autorização registrada em 02/10 às 14:15:15 UTC, anterior liberada às 14:15:24 UTC. Consulta ao provedor em 08/10 confirmou nova cobrança AUTHORIZED, R$ 500, sem captura. Prazo de captura já expirado e cobertura indisponível. Evidência `qa-renovacao-consulta-provedor.json`. Nenhuma nova autorização ou alteração de relógio/agendamento.
- Jornada F + D: home móvel → Ville Moments → oferta “Teste” → Quero estes dias → tarifa explicitamente não reembolsável → adicionar café → login → cartão sandbox 1x. Reserva `00BA201ADB` / `4e4eeb11-c984-4947-8591-7a52df5e4691`, pagamento `78e3ae1e-ff4e-46c4-b996-3e98fc2adf40`, R$ 793,68, confirmado na tela e banco. Uma atribuição à publicação `edeaf9ff-b924-413e-b3cd-c0295eb94fc0`. Capturas 360×800 `qa-360-oferta-villegram-inclusoes.png` e `qa-360-oferta-villegram-paga.png`.
- **Falha reproduzida:** reload após aprovação reabria formulário de pagamento. Nenhum segundo pagamento foi enviado. Corrigida persistência da referência e recibo público da cobrança; restauração consulta o status autenticado sem recotar ou voltar à finalização. Sessão expirada exige login; outra conta descarta a referência anterior. Dados do cartão não são persistidos. Quatro testes novos cobrem restauração paga, falha de consulta, sessão expirada e troca de conta; reteste visual da correção depende da prévia seguinte.
- Estornos de cartão continuam sem confirmação: reembolsável `5434e8f6-1901-4793-95ae-6554c456b92a` com `pagbank_charge_operation_http_400_code_40008`; não reembolsável com tentativa anterior 40008 e repetição idempotente 40005. Não foram disparadas novas tentativas incertas.
- Compartilhar abriu painel e pausou vídeo. Cópia para clipboard não comprovada; não marcar como aprovada. Portal PagBank exigiu novo login; aguardando disponibilidade do usuário, sem bloquear demais jornadas.
- Suíte completa após retomada: **394 aprovados, zero falhas**, log `outputs/homologation-20261007-tests-round10.txt`.
- Reteste da correção na prévia `a2ee13ce`, https://chalezinho-ville-c8jfm9nt8-roldneicosta-4140.vercel.app/: home → oferta CH3 03–05/11 → tarifa reembolsável → login → cartão 1x R$ 1.362,87. Reserva `A6D3B69F79` / `f84fdb14-df7b-4820-bcd8-cb2db3febefb`, pagamento `faf5d398-6a66-4bd6-8605-3abf6806a6f8`, cobrança `CHAR_22144CE4-D680-40DC-8DBC-66F92F8E8068`, paid/confirmed. Reload manteve confirmação sem novo formulário; banco manteve exatamente um pagamento. Captura `qa-360-pagamento-reload-corrigido.png`.
- Link de sucesso com quebra de linha não navegou por clique central em 360 px; Enter navegou e Minha conta confirmou a reserva, pacote, pagamento e saldo zero. Aplicado estilo de botão já existente para fornecer área de toque contínua. Reteste do clique pendente da próxima prévia.

## Rodada 11 — moderação, marcações e paginação

- Prévia `ee37cf88`: https://chalezinho-ville-nu3huuqj1-roldneicosta-4140.vercel.app/. Link de sucesso com nova área de toque navegou por clique para Minhas reservas.
- Momento sintético `174489de-fd28-4c8e-90ee-58cdc0372fc5` enviado com marcação `@qa_host_20261007`. Sino na conta administrativa mostrou uma pendência e abriu a fila. Prévia foi conferida e publicação aprovada; segunda sessão administrativa que mantinha a revisão anterior recebeu “Outra pessoa alterou esta publicação. Reabra a versão atual antes de salvar.” Duas sessões da mesma conta administrativa, não dois administradores distintos. Captura `qa-moderacao-versao-desatualizada.png`.
- Marcação ficou oculta ao visitante até aceite do acompanhante sintético; após aceite, a legenda exibiu link ao perfil marcado. Remoção disponível e executada. Captura `qa-marcacao-publica-aceita.png`.
- Perfil do autor desativado pela interface: link público do momento passou a indisponível e feed alternativo não exibiu a mídia. Perfil restaurado e momento arquivado pelo hóspede ao encerrar o cenário. Captura `qa-perfil-privado-momento-oculto.png`.
- Paginação: 51 fixtures exclusivamente DEV, identificadas por `source_key` `qa-pagination-20261007-*`, preparadas no banco a partir de mídia sintética existente. Navegador mostrou 50 na página 1, uma na página 2, sem duplicação e botão seguinte desabilitado. Todas as 51 arquivadas ao concluir, nunca publicadas; fila voltou a vazia. Esse preparo não é evidência de envio normal de 51 momentos pelo hóspede. Captura `qa-fila-pagina-2.png`.
- Relatório visual mostrou a publicação “Teste” com uma reserva iniciada e uma paga, coerente com a única atribuição já conferida no banco.
- Consulta 10–12/11 retornou os três imóveis ocupados e avanço desabilitado; troca de datas para 23–26/12 retornou disponibilidade.
- **Falha adicional:** “Consultar minha última cobrança de teste” recuperava valor/status corretos de A6D3B69F79, mas mantinha título/datas de outra simulação aberta. Corrigida apresentação como recibo independente, sem contrato/chalé/datas da cotação atual, preservada também no reload. Nove testes focados passaram. Reteste visual depende da próxima prévia.

## Rodada 12 — caução integral e expiração natural (08/10 UTC)

- Prévia a7e120: https://chalezinho-ville-pf6eururo-roldneicosta-4140.vercel.app/. Home → CH2 09–11/10 → tarifa não reembolsável explícita → cartão sandbox 1x R$ 1.723,30 → reserva 0D88FF9D57 confirmada. Fechar recibo e recarregar retornou à disponibilidade sem reabrir pagamento antigo; correção retestada.
- Reserva c06d110f-2717-476b-a0b1-8e6628e86f8c; garantia 19f09a19-c5d5-4aeb-b0b3-f2714a564623. Pré-autorização de R$ 500 com validade até 12/10 23:54 de São Paulo. Ocorrência fictícia com foto/recibo enviados, aprovada e capturada integralmente pela interface. API do provedor em 08/10 02:56:43 UTC: PAID, total=50000, paid=50000, refunded=0. Pedido ORDE_276FD15D-D5BF-422E-B220-9C2293154CAD, cobrança CHAR_74EC1251-4A36-4F45-B9B8-FA222DF09AEC. Evidências qa-caucao-integral-500-site.png e qa-caucao-integral-500-provedor.json.
- Área do hóspede confirmou R$ 500 utilizados separadamente da hospedagem. Encontrada mensagem de liberação pendente apesar de captura integral. Corrigida apresentação para “Sem saldo a liberar · captura integral”, preservando liberação não confirmada nas capturas parciais. Sintaxe validada; reteste visual da nova mensagem após publicação.
- Estorno integral de R$ 500 solicitado uma vez pelo painel: 9f5980ba-04e3-44fa-9970-078918d629ce, 08/10 03:01:09 UTC, state=uncertain, provider_error_code=40008, confirmed_cents=0. Estorno parcial de R$ 30 anterior c0f1f373-78c9-4128-b3b5-11df35f210c2 permanece uncertain/40008/zero. Nenhum reenvio. Captura qa-caucao-estorno-integral-40008.png.
- Portal expirou durante navegação ativa e não permitiu conferir o pedido da captura integral. Solicitado login ao usuário; confirmação da captura integral é da API do provedor e telas, não do portal.
- Cotação CH3 17–19/11 expirou naturalmente: aviso explícito observado. Voltar aos chalés e escolher a estadia renovou prazo de 15 minutos, preservou datas/motivo e exigiu nova escolha explícita de tarifa. Não alterado relógio. Evidências qa-cotacao-expirada-naturalmente.png e qa-cotacao-renovada-naturalmente.png.
- Suíte completa da versão a7e120: 396 testes aprovados, zero falhas/ignorados, log outputs/homologation-20261007-tests-round12.txt. A mudança posterior desta rodada é somente a mensagem de saldo da caução.
- Capturas desta rodada: viewport nativo 1280×720; não equivalem a Android físico. Banco/funções não alterados nesta rodada. Homologação global ainda não concluída, especialmente estornos de cartão.

## Continuidade 08/10 — conferências adicionais

- HEAD remoto permanece 214deca1344a0de05d861c0695232ad7613cdd40. Prévia https://chalezinho-ville-4e7wcxxdo-roldneicosta-4140.vercel.app/ conferida.
- Portal DEV autenticado: ORDE_276FD15D-D5BF-422E-B220-9C2293154CAD / CHAR_74EC1251-4A36-4F45-B9B8-FA222DF09AEC mostra caução R$ 500,00, Pago, consistente com a consulta da API. Captura qa-portal-caucao-integral-confirmada.png. Não é pagamento de diária.
- Reteste da mensagem na conta do hóspede: captura integral mostra Sem saldo a liberar. Captura qa-caucao-integral-hospede-corrigida.png. Consulta de pedidos apresentou falha transitória explícita e recuperou após reload, sem falsa lista vazia durante falha.
- Troca de cartão sintético da garantia f1f6a0b7-843b-4f2a-844b-5f6ad5198296 / reserva A6D3B69F79 concluída pela interface com consentimentos. Tela informou sucesso, banco manteve pending, sem autorização/captura antecipada. Captura qa-cartao-caucao-atualizado.png. Não comprova aprovação futura desse novo cartão.
- Nova revisão visual em 360×800 (painel compartilhar), 412×915 (legenda) e 1440×900 (home), sem sobreposição nos estados capturados. Arquivos qa-final-360-compartilhar.png, qa-final-412-legenda.png, qa-final-1440-home.png. São viewports emulados, não Android físico.
- Compartilhamento: URL exibida correta, painel pausa no mesmo trip. Copiar link informou sucesso, mas clipboard/colagem pelo navegador integrado devolveram URL anterior. Resultado da cópia NÃO aprovado; possível limitação de clipboard do navegador, causa não isolada. Nenhum comentário enviado durante o teste de colagem.
- Documentos da reserva 0D88FF9D57: política não reembolsável 1.2, termos 1.2, regras 1.1, privacidade 1.0; conteúdo/aceite de 07/10 23:54 visíveis. Botão de download acionado, mas evento download não chegou ao navegador controlado em 10s: arquivo não comprovado.
- account.js passou sintaxe; TypeScript das quatro funções passou novamente. Nenhuma mudança adicional de código/banco.
- Cadastro real por e-mail autorizado para roldneicosta+homologacao@gmail.com, formulário preenchido com identidade fictícia, senha e envio aguardando usuário. Não substituir confirmação de e-mail por confirmação administrativa.
- Usuário reincluiu um teste de estorno de hospedagem ao final; não executado nesta continuidade. Não reenviar operações incertas com nova chave.

## Rodada 13 — pacote e experiência avulsa completos

- Correção 7406694ac613f5af0a1504478384e6ffea0ab4ab, prévia https://chalezinho-ville-iewp84i1f-roldneicosta-4140.vercel.app/: tentativa de autorizar caução da reserva futura A6D3B69F79 permaneceu pending/sem autorização. Mensagem genérica substituída por explicação da janela programada. Reteste visual passou, qa-caucao-janela-corrigida.png. Não houve chamada financeira aprovada nem antecipação de datas.
- Cenário B: home → 24–26/11, motivo romântico → CH2 → pacote Escapada a dois → tarifa reembolsável explícita → cartão sandbox 1x. Reserva CF46B14D24 / e132cabb-3b59-40f0-8f34-0ae69176e36d, R$ 1.402,77, pagamento 117dfe3e-6e2a-4ccf-b5cc-2cd6303a4176, charge CHAR_0DEC6A82-8D9D-47D0-A977-43C8FF0EB790, pedido ORDE_2C126318-80B8-4AE9-9AEE-F50F72BCA10C. Confirmada/paid e portal Pago. Pacote inclui experiência romântica uma vez, sem adicional duplicado. Capturas qa-cenario-b-pacote-pago.png e qa-cenario-b-portal-pago.png.
- Cenário C: fechar recibo → mesmo período → CH3 → retirar pacote → adicionar café avulso de R$ 1 → não reembolsável explícita → cartão 1x. Reserva 3E3960C445 / a5411038-2e56-4d41-b6c5-0dd0f2f207be, R$ 1.409,70, pagamento 14deeb7b-8c0e-4840-8389-144663a6387e, charge CHAR_A9504394-0F82-43C7-AAF9-CCE651DD222C, pedido ORDE_0889DCF7-A983-49A1-85D9-1EFB5E788311. Confirmada/paid e portal Pago. Desconto de pacote removido, hospedagem/limpeza R$ 1.408,70 e café R$ 1 separados. Capturas qa-cenario-c-avulso-pago.png e qa-cenario-c-portal-pago.png.
- Cenários B/C executados na prévia 214deca (4e7wcxxdo), cuja diferença para 7406694 é apenas mensagem administrativa de janela da caução. A–F têm compras concluídas nas rodadas executadas; isso não elimina demais limites de homologação.
- Para o teste final solicitado de estorno da hospedagem, selecionada a cobrança 1b48d65f-1580-4c1b-98f0-1a0d8e497d7e de R$ 1.723,30 da reserva 0D88FF9D57, distinta da caução. Conferência de pedidos pendentes antes do envio; nenhuma tentativa nova executada nesta rodada. Cadastro/e-mail ainda aguardando usuário.

## Cadastro real por e-mail — 08/10, 17h25 São Paulo

- Usuário submeteu cadastro roldneicosta+homologacao@gmail.com na interface. Auth /signup retornou 200 às 20:25:07 UTC; auth.users cde8e1af-d37e-43ff-afd9-01c1a882ed7c criado, confirmation_sent_at 20:25:06 UTC, email_confirmed_at ainda nulo na consulta.
- Segundo envio às 20:25:27 UTC recebeu 429 over_email_send_rate_limit, com espera remanescente de 39 segundos. Não é prova de falha do primeiro cadastro; confirmação por link ainda pendente do usuário.
- Usuário não percebeu mensagem no topo após submissão. Ajustada função de mensagens para trazer resposta à área visível; não alterados limite, SMTP nem autenticação. Senha não acessada nem reencaminhada pelo agente.
