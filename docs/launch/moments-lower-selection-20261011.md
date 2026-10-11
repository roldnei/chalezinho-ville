# Ville Moments: datas, preço e ação mais abaixo — 11/10/2026

## Resultado

Separada a introdução do chalé do bloco comercial, com mais espaço antes das datas. A ação principal é a última linha, abaixo das alternativas Somente hospedagem e Outras datas. Mantida a foto sem painel preto. Os links continuam preservando o contexto consultado. A prévia do editor continua ocultando a ação comercial.

Prévia testada: https://chalezinho-ville-pt19528zi-roldneicosta-4140.vercel.app/index.html?view=site#estadias-completas

Commit de código testado no Vercel: c2e3df1cdfdfd00bec7d6e48ede80e975b92e5a7. Deployment dpl_BA4mH8GAX2W41EcGMjoigvYWZBVc, READY, target null (preview), branch feature/staged-whatsapp-launch. A normalização final de quebra de linha do trecho CSS não altera os estilos.

## Evidência real de layout

Chrome remoto, conteúdo real do DEV em iframe, não aparelho físico. Oferta Amore de 12 a 15/10/2026, três noites, dois hóspedes, R$ 2.111,40. Conferidos o desktop de 1366×936 e larguras 320/390 com alturas 844, 740 e 640.

Comparação no mesmo conteúdo 320×844, posições Y lidas no DOM:

| Elemento | Antes | Depois | Deslocamento para baixo |
|---|---:|---:|---:|
| Datas | 294,55 | 344,55 | 50 px |
| Preço | 373,23 | 411,23 | 38 px |
| Botão | 527,61 | 619,61 | 92 px |

Em 390×740, botão entre Y=515,61 e 572; setas começam em 604. Em 320×640, botão termina em 483,84, área comercial termina em 484 e setas começam em 504. O contêiner permite rolagem em telas baixas e ao abrir as condições; os filhos não encolhem nem se sobrepõem. Inclusões e condições foram abertas e fechadas na interface real. Captura completa em evidence/moments-lower-selection-complete-20261011.jpg.

No desktop, botão entre 711,61 e 768, com setas a partir de 788. Conferido link de consulta com CH3, entrada 2026-10-12, saída 2026-10-15, guests=2, rate=non_refundable, expected_total=211140 e identificação da oferta preservados.

## Checks

node --check villegram.js, git diff --check e build whatsapp/development aprovados. Suítes existentes villegram-escape-feed, villegram-navigation e villegram: 33 testes, 33 aprovados. TAP em moments-lower-selection-tests-20261011.tap.

## Escopo e limitações

Esta rodada altera apresentação e agrupamento do DOM. Nenhuma mudança em preços, banco, reservas, holds, pagamentos, calendários ou configurações de produção. Nenhuma mensagem real enviada. Não foi repetida a homologação completa do PMS ou o comparativo de contagens financeiras; suas evidências anteriores permanecem nos relatórios de lançamento. Nenhuma publicação ou promoção para produção realizada.

Retorno: reverter os commits desta rodada na branch de desenvolvimento e gerar nova prévia; não exige migração nem rollback de dados. Antes de produção permanece necessária autorização posterior e revisão do candidato.
