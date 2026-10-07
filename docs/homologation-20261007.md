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

Viewport emulado não equivale a Android físico. Nenhuma jornada completa está aprovada ainda. Cadastro/recuperação por e-mail precisam de observação própria; a fixture não substitui esses testes.
