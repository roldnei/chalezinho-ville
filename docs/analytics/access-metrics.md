# Acessos ao site e ranking de chalés

Implementado na branch `feature/access-metrics`, baseada em `fix/reservation-finance-lifecycle` (`f79e367`). Não modifica políticas, cobranças ou garantias.

## Definições
- Visualizações: cada carregamento da home, reserva ou página pública de um chalé, inclusive recargas.
- Ranking: apenas páginas individuais dos imóveis, não impressões dos cards na home ou seleção no checkout. CH1 = Signature, CH2 = Essenza, CH3 = Amore. A página dinâmica resolve o código no servidor.
- Sessões: identificador aleatório em sessionStorage, por navegador/aba, renovado após 30 minutos entre carregamentos. Não equivale a pessoas únicas. Uma sessão pode visitar vários chalés.
- Período: janela móvel de 7, 30 ou 90 dias. Empates e imóveis sem visitas são exibidos.
- Coleta nova (`site_page_view`): não mistura eventos antigos do checkout; não recupera tráfego anterior à ativação.

## Privacidade e limitações
Sem nome, e-mail, IP, URL completa, parâmetros ou referrer nos eventos. Respeita DNT e Global Privacy Control; testes com webdriver são ignorados. Falhas de storage/rede nunca bloqueiam a navegação. Bloqueadores e outros robôs podem alterar a contagem: métricas estimadas, não auditoria de pessoas. Visitas administrativas não são coletadas; páginas públicas abertas manualmente por administradores contam como visitas.

## Backend e segurança
Reutiliza analytics_events existente, sem nova infraestrutura ou alteração de schema/RLS. `track_access` aceita apenas páginas e sessão válidas, resolve o imóvel no servidor e usa a barreira de ambiente de desenvolvimento já existente. `admin_access_metrics` exige perfil admin antes da leitura. Resposta agregada, sem IDs de sessão para o frontend. Consulta paginada em blocos de 1.000, teto de 100.000 eventos; ao exceder, retorna erro em vez de total incompleto. Em maior escala, substituir a agregação por SQL com acesso restrito e avaliar índice por evento/data.

## Ativação
Entregar frontend e booking-engine + `_shared/access-metrics.ts` juntos no ambiente isolado de desenvolvimento. Publicar somente o frontend deixa a tela indisponível até a atualização da função. Não aplicar o snapshot SQL, não alterar produção, não misturar tráfego de preview com produção. A ativação futura em produção exige configuração separada, revisão da política de privacidade e homologação; esta branch mantém a proteção de desenvolvimento existente.

## Verificação executada
5 testes focados em `tests/access-metrics.test.mjs`: identificação e validação; ranking/sessões/zeros; paginação e falhas; privacidade e expiração no navegador simulado; painel admin, filtro e erro sem zeros falsos. Typecheck do projeto, sintaxe de admin.js/access-metrics.js e build de preview aprovados. Não repetida a suíte financeira. Homologação real da Edge Function e verificação visual no navegador ainda pendentes.
