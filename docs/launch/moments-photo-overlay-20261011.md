# Ville Moments: foto livre, sem painel — 11/10/2026

Pedido: retirar o painel preto translúcido das escapadas, preservando leitura e evitando texto sobreposto.

- Removido background e arredondamento persistente de `.vg-escape .vg-purchase`. Texto continua em fluxo normal sobre a foto; degradê inferior contínuo mais suave e sombra textual mantêm contraste.
- Subtítulos claros; datas, hóspedes, preço, inclusões, ação e alternativas têm espaços separados. Altura de leitura limitada para respeitar cabeçalho e navegação; inclusões abertas podem rolar.
- Escopo: CSS e versão de cache do mesmo stylesheet nas páginas consumidoras. Sem alteração de mídias, publicações, editor, Feelings, disponibilidade, catálogo, reservas, pagamentos, funções Supabase ou configuração de produção. Painéis de leitura abertos voluntariamente continuam disponíveis.

## Homologação desta alteração

Commit de código: `5e129261166133065c37335ece98487b30c5cb40`.
Prévia: https://chalezinho-ville-a7rawixbe-roldneicosta-4140.vercel.app/index.html?view=site#estadias-completas
Acesso: Assistir no Ville Moments em um card da vitrine.

- Chrome remoto real, dados do DEV. Desktop Signature 26–28/10: R$ 1.453,50, background none / transparente, radius 0; leitura entre cabeçalho e footer sem sobreposição, fotografia visível.
- Iframe QA, larguras 390 e 320, altura 844: Signature 26–28/10 e Essenza 31/10–3/11, R$ 2.268,70, três noites. Textos e ações em fluxo; cabeçalho e footer livres. Em 320, inclusões abertas: conteúdo maior que área de leitura, rolagem interna disponível e nenhuma sobreposição com navegação. Reprodução pausada para inspecionar o enquadramento; botões de pausa e fechar funcionando.
- Evidência móvel: `evidence/ville-moments-foto-livre-20261011.jpg`. Captura do iframe com conteúdo real; **não é aparelho físico nem Safari móvel**.
- 33 testes de escape-feed, navigation e villegram passaram, conforme `moments-photo-overlay-tests-20261011.tap`. Build do perfil whatsapp passou e confirmou alvo development; git diff --check passou. Após os testes foi preservada a formatação original CRLF/LF da folha, sem mudança de estilo.

Somente preview na branch feature/staged-whatsapp-launch. Nenhuma publicação/promoção em produção. Não foram repetidos testes financeiros, SQL antes/depois ou cadastros PMS, pois essa alteração é exclusivamente visual. Reversão visual: restaurar villegram.css e suas referências do commit anterior `cd28d454d19a4c2537a2e27fb1d2430d845eb059`; sem migração ou restauração de dados.
