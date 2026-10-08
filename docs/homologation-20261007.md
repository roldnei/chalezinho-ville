# Homologação DEV — 7 de outubro de 2026

Em execução. Não constitui aprovação para produção.

Base remota conferida: `feature/romantic-stay-offers`, `0d97d9ac3caa41c4bb992dd7ecd59a7671309ee0`.
Prévia inicial: https://chalezinho-ville-3u4bprt40-roldneicosta-4140.vercel.app/
Somente Supabase DEV `pxfqmnhqodqyaaqeyjgr`. Nenhuma alteração em PROD.

## Método e matriz

Executar entradas reais, conferir estados no navegador, cruzar operações financeiras com banco/provedor, corrigir e repetir os caminhos afetados. Resultados automatizados não substituem observação visual.

| Jornada | Estado | Evidência parcial |
| --- | --- | --- |
| 1. Villegram visitante | Em execução | 360×800: 13 reels, mudo, legenda pausa vídeo, avanço/pausa, like exige login, retorno ao primeiro reel, consulta de datas |
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
- Em 360×800, o formulário do Villegram levou diretamente aos resultados, com estado de carregamento sem repetir o formulário.
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
- Villegram em 412 px: identificados aviso de mídia cobrindo CTA e evento tardio de vídeo causando TypeError. Correções de código com regressão automatizada; publicação/reteste visual da segunda correção pendentes.
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
| 1. Villegram visitante | Bloqueada para conclusão da homologação | Parte observada; faltam feed vazio, falhas de serviço, compartilhar e todos os retornos/origens |
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
