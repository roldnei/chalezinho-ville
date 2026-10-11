# Ícones laterais do Ville Moments — 11/10/2026

## Correção

A imagem enviada pelo usuário mostrava a escapada no player da conta com curtir, comentar e compartilhar em uma linha sobre os links comerciais. A coluna lateral dependia de `.vg-caption-short`, que não existe nas escapadas sem publicação editorial. O mesmo layout lateral agora vale para todas as apresentações, inclusive o player incorporado da conta.

Os três ícones ficam na coluna direita, fora da camada que desliza entre Trips. O texto da escapada reserva espaço para essa coluna; o botão comercial mantém sua largura. Quando as interações estão desativadas, esse espaço adicional não é reservado. Mensagens de status ficam acima do conteúdo comercial. As páginas que usam o player receberam novas versões dos assets para evitar o CSS antigo em cache.

A configuração WhatsApp apontava as interações das escapadas ao endpoint public-consultation, que corretamente rejeita `action=villegram`. Em DEV, somente essas chamadas sociais agora usam o serviço existente booking-engine, sem alterar o endpoint de preços. Publicações editoriais continuam usando villegram-content. O serviço legado exige DEV no servidor e autenticação para curtir/comentar; sua leitura não escreve em reservas ou financeiro. A proteção de operações financeiras no endpoint de consulta permanece intacta. Nenhum backend ou configuração de produção foi alterado.

## Validação

- 36 testes passaram: villegram-navigation, public-consultation e villegram. Regressões verificam a coluna lateral nas escapadas e nas publicações editoriais, mensagens fora da área comercial, manutenção da URL de consulta de preços, rota social DEV, login para curtir/comentar e rejeição de pagamentos/holds. DOM/CSS verificados em JSDOM; não é um navegador com geometria de layout real.
- Sintaxe de villegram.js, build WhatsApp DEV e git diff --check passaram.
- Chamada HTTP real e anônima ao booking-engine DEV, `action=villegram`/operação list, para a escapada ativa `67cd3f37-0ac1-4b04-9a7f-d5e113395e38`: HTTP 200, ok=true, zero curtidas e zero comentários. Nenhum comentário ou curtida de teste foi enviado.
- A tentativa de abrir o player no navegador de validação foi bloqueada pela proteção de credenciais deixada após a autenticação anterior. Não foi possível validar visualmente esta correção no navegador ou capturar screenshot. Conferência visual de sobreposição em celular/computador, inclusive com condições expandidas e contadores longos, permanece pendente. A imagem do usuário é evidência do problema anterior, não do resultado corrigido.

## Escopo e retorno

Somente prévia DEV na branch feature/staged-whatsapp-launch. Produção não foi publicada/promovida e seu banco/configuração não foram modificados. Recursos sociais continuam em homologação DEV; esse ajuste não autoriza sua liberação em produção. Retornar à prévia anterior requer reverter este commit de CSS/rota/cache/testes, sem apagar conteúdos ou dados.
