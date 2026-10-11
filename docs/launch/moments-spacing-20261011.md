# Ville Moments: mais espaço entre texto e ações — 11/10/2026

Pedido: texto e botão muito próximos na escapada Amore 12–15/10.

## Mudança

Somente CSS e versão de cache das páginas consumidoras. Oferta permanece sem painel preto. Nome e título separados; datas e hóspedes formam um bloco, preço e composição outro. Aumentados respiros verticais, preço de 36 px e título de 28–34 px. Botão com altura mínima 56 px e margens laterais de 28 px (22 em telas estreitas). Links alternativos centralizados em duas áreas, com separador discreto e distância de 20 px do botão.

Conteúdo usa flex sem comprimir os filhos. Cabeçalho e navegação preservados; em áreas menores ou com condições abertas, leitura rola. Adaptação CSS para alturas abaixo de 740 px reduz os espaços sem retornar à sobreposição.

## Verificação

Código testado: `8742aa115bfc6a1643a15c0c26ea63157a6bf74e`.
Prévia: https://chalezinho-ville-hgqdpq7qf-roldneicosta-4140.vercel.app/index.html?view=site#estadias-completas
Abrir Assistir no Ville Moments de Amore 12–15/10.

- Chrome remoto, conteúdo e preços reais do DEV. Desktop e iframe QA em 390 e 320, altura 844. Não houve uso de aparelho físico ou Safari.
- Amore 12–15/10, três noites, dois hóspedes, R$ 2.111,40 preservados. Área da oferta transparente. Cabeçalho e footer sem sobreposição.
- Em 390: 26 px entre hóspedes/preço; 22 px entre condições/botão; 20 px entre botão/links. Tudo cabe na área sem rolagem quando condições fechadas.
- Em 320: todos os blocos em fluxo, sem overflow horizontal; conteúdo fechado cabe. Inclusões abertas geram rolagem interna, mantendo cabeçalho e footer livres. Pausar, fechar e abrir via vitrine funcionando.
- Evidência: `evidence/ville-moments-mais-espaco-20261011.jpg`, captura do navegador com iframe de conteúdo real. Captura focada por clip não foi disponibilizada devido a timeouts da API; screenshot do viewport foi salvo com sucesso.
- 33 testes existentes de escape-feed/navigation/villegram passaram: `moments-spacing-tests-20261011.tap`. Build whatsapp confirmou alvo development; git diff --check passou. Nenhum teste financeiro ou PMS foi repetido nesta mudança exclusivamente visual.

Sem alterações de disponibilidade, motores de preço, banco, reservas, pagamentos, mídias, publicações, Feelings, editor ou permissões. Somente previews da branch feature/staged-whatsapp-launch; nenhum deployment foi promovido ou publicado em produção. Reversão visual: restaurar CSS e referências anteriores desta branch, commit `5e958eb0ae2377d2e82690198c6a66d422b0fa02`, sem mudança de dados.
