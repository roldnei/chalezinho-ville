# Indexação pública — 26/11/2026

Base de produção: 3784a9e2f72ac8c95ecab1fb71bba68513a2c853, árvore 606d9e65e1270ba15a8ec0975a604c6862b6b1a3.

## Diagnóstico

- O único bloqueio robots.txt mostrado nas capturas é r.mail.notificacoes.chalezinhoville.com.br. Não é um destino público de acomodação. Nenhuma alteração de DNS, e-mail ou robots desse provedor foi feita.
- robots.txt do site principal permite rastreamento e divulga sitemap.xml e sitemap-moments.xml; ambos respondem 200.
- Guia, catálogo de apartamentos, detalhes Centro/Praia do Morro e galerias CH1/CH2/CH3 respondem 200, com URL canônica própria e sem bloqueio de indexação.
- O Moments 0f124ca5-21c3-4bea-87c6-572ec6faacda respondia 200, mas título, descrição e H1 usavam somente emoji, com pouco contexto textual.
- As URLs finais dos 20 anúncios do CSV aplicado apontam para páginas reais: home, catálogo, dois apartamentos, Essenza e Signature. Os caminhos /guarapari/... mostrados na publicidade são caminhos de exibição, não as URLs finais do CSV. Não foi necessário criar redirecionamentos artificiais.
- As capturas de redirecionamentos www/http, index.html alternativo e reservar.html com noindex não demonstram bloqueio indevido das acomodações. Foram preservados.

## Alterações

- Metadados, H1, cartões e dados estruturados dos Moments ganham texto descritivo consistente; a legenda e autoria públicas originais são preservadas. Contexto da acomodação é exibido no corpo, sem atribuí-lo ao hóspede.
- O guia inclui links HTML para o catálogo e para os dois apartamentos. Data de revisão e lastmod do guia atualizados somente após essa mudança real.
- /api/stay-showcase passa a enviar X-Robots-Tag: noindex, mantendo resposta JSON, cache no-store e regras de disponibilidade existentes. Nenhum Disallow impede leitura da diretiva.
- Sem alterações em preços, reservas, disponibilidade, pagamentos, consentimento ou elegibilidade de publicações.

## Validação

- node --test tests/moments-gallery.test.mjs tests/stay-showcase-proxy.test.mjs tests/rental-search-page.test.mjs: 15 testes aprovados, incluindo privacidade, exclusão de Trips privados, escape HTML, legendas originais, HTML dos apartamentos e noindex apenas na API.
- node --check nos dois módulos alterados e git diff --check: aprovados.
- VILLE_RELEASE_PROFILE=whatsapp node scripts/build-finance-preview.mjs: aprovado em desenvolvimento, sem ativar checkout financeiro; publicação usa as variáveis de produção existentes.
- Links dos dois apartamentos e dateModified do guia conferidos no HTML.

## Limite da verificação

HTTP 200 e permissão de rastreamento não confirmam inclusão no índice do Google. Não foi enviada validação de um bloqueio que é intencional nem solicitado acesso ao Google Ads por outro ambiente. A próxima coleta do Search Console precisa confirmar indexação das páginas públicas importantes.
