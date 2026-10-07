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
