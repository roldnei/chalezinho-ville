# Entrada padrão e preços em dez parcelas

Alteração preparada sobre a versão pública `0424b1b81bf1e4b0be17ed59ea865a21c8ca5c6d`, preservando a seleção de fotografias do PMS. A branch main contém trabalho posterior de checkout; esse trabalho não entra nesta publicação.

- A página inicial convencional abre para todos os visitantes. O A/B de entrada foi desabilitado no cliente; não há nova inscrição experimental. Publicações e links explícitos do Ville Moments mantêm seu destino.
- O ícone de Escolher datas na capa pulsa suavemente a cada 3,2 segundos. A animação respeita a preferência por movimento reduzido e para em foco/hover.
- Vitrine, cards de busca, Ville Moments, condições alternativas, resumo e mensagem preparada do WhatsApp usam a apresentação em dez parcelas, com 7% sobre o valor original consultado. O exportador de escapadas usa a mesma função.
- O total parcelado corresponde exatamente às dez parcelas exibidas. O arredondamento da parcela pode ajustar o total calculado em poucos centavos. O preço original não é regravado nem remarcado a cada renderização.
- O resumo mantém o preço à vista original e informa as dez parcelas e o total no cartão. Não há promessa de parcelamento sem juros. A cotação é reconfirmada antes de preparar o link do WhatsApp.
- Valores de pagamentos reais, reservas existentes, cauções e cálculo de parcelas do checkout DEV não foram alterados. A nova apresentação pública só se aplica ao perfil de consulta WhatsApp; a extração de vídeos já usava o adicional de 7%.

## Acréscimo atual da fonte

Consulta pública realizada em 21/11/2026 para 04–06/12/2026, dois hóspedes: o motor respondeu `consultation_pricing.profile=lodging-airbnb-base-v1` e `markup_bps=0`. A configuração pública parte da base PriceLabs, com promoção de canal configurada separadamente e limpeza incluída. Portanto, zero é o acréscimo configurado na base pública, e não uma comparação verificada com o preço final de uma página Airbnb. Descontos, taxas e regras próprias do Airbnb podem produzir diferença final.

Na consulta de referência: Signature R$ 1.946,00 e Essenza R$ 2.072,00 à vista; Amore sem disponibilidade. A apresentação parcelada correspondente é 10x R$ 208,22 (total R$ 2.082,20) e 10x R$ 221,70 (total R$ 2.217,00), respectivamente. São evidências de consulta, não garantia de disponibilidade futura.

## Validação

100 testes aprovados: preço compartilhado e arredondamento; homepage para antigos participantes A/B; links diretos e navegação; vitrine; cards e resumo do WhatsApp; seleção por datas; cinco fotos originais aprovadas do Signature; exportações e ZIP; regressão do parcelamento do checkout DEV e regras de lançamento público. Build do perfil WhatsApp e sintaxe aprovados. O teste da vitrine com datas históricas passou a fixar o relógio para evitar expiração acidental da fixture.

Nenhuma migração ou alteração de banco de dados foi necessária.
