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
5 testes focados em `tests/access-metrics.test.mjs`: identificação e validação; ranking/sessões/zeros; paginação e falhas; privacidade e expiração no navegador simulado; painel admin, filtro e erro sem zeros falsos. Typecheck do projeto, sintaxe de admin.js/access-metrics.js e build de preview aprovados. Não repetida a suíte financeira. Homologação real da Edge Function e verificação visual desktop concluídas em 01/10/2026.

## Homologação em desenvolvimento — 01/10/2026

- Supabase isolado `pxfqmnhqodqyaaqeyjgr`: booking-engine v27 ativo, preservando os arquivos da versão v26 e acrescentando somente métricas.
- Preview homologado: https://chalezinho-ville-3x7078dcp-roldneicosta-4140.vercel.app/admin.html?view=access
- Coleta real via API e navegador: Signature 4 visualizações/2 sessões; Essenza 2/1; Amore 1/1. Total 7 visualizações e 2 sessões, participações 57,1%, 28,6%, 14,3%. Dados exclusivamente de QA, não tráfego real de hóspedes.
- Painel autenticado conferido com os registros no banco. Filtros 7, 30 e 90 dias carregaram os mesmos totais esperados para os eventos criados hoje; distribuição histórica já coberta por limites da consulta, sem dados antigos artificiais.
- Consulta administrativa sem autenticação: HTTP 403 admin_required. Evento de página administrativa inválida: HTTP 400 invalid_access_event. Eventos válidos: HTTP 200.
- Inspeção visual desktop concluída. Não realizada uma homologação específica mobile nesta rodada. Produção não foi modificada.

## Conversão por chalé

Reservas confirmadas e com pagamento de hospedagem pago/estornado parcialmente, originadas no site e vinculadas a uma sessão que visitou a página do mesmo chalé antes do início do pagamento, divididas pelas sessões desse chalé no período. A confirmação é lida no servidor, não de evento de sucesso enviado pelo cliente. Canceladas, manuais, mocks, pagamentos pendentes e cobranças apenas de extras não contam. Repetições da atribuição não duplicam reservas. Sem sessões, exibe travessão; com sessões e sem reservas, 0%. Uma sessão pode gerar mais de uma reserva, portanto o indicador é reservas/sessões, não percentual de pessoas únicas.

O vínculo é gravado no servidor ao criar o hold autenticado. A associação utiliza identificador pseudônimo da sessão e ID da reserva (nenhum nome/documento é enviado na métrica). Falhas da coleta não impedem o pagamento. Reservas sem vínculo anterior não são atribuídas retroativamente. Visita e início da reserva precisam estar dentro da janela; confirmações posteriores atualizam o resultado enquanto a visita estiver nessa janela. DNT/GPC continuam respeitados.

Validação adicional: teste de conversão com duplicidade, visita posterior, outro chalé, cancelamento, pagamento pendente, reserva manual, mock, extras e ausência de sessões. Não foi realizada nova compra sandbox nesta alteração.

## Compra completa no sandbox — 02/10/2026, 23:28 BRT

Homologação da conversão concluída no preview `chalezinho-ville-4k3b0zn07-roldneicosta-4140.vercel.app`, usando o banco isolado `pxfqmnhqodqyaaqeyjgr`. Nenhuma alteração de produção.

- Jornada pelo navegador: página do Signature → consulta 16–18/11/2026 → tarifa não reembolsável → conta QA → resumo → cartão fictício → confirmação PagBank sandbox.
- Reserva `B65E3F915C` / `305b72dc-0878-4493-ac3e-c90c197873bd`, R$ 1.650,70; UI confirmou aprovação. Consulta independente ao banco: reserva `confirmed`, origem `direct`, pagamento `paid`, provedor `pagbank_sandbox`. Status não foi simulado por SQL.
- Um evento `site_booking_attribution`, criado em 03/10/2026 às 02:28:19 UTC, com visita anterior ao mesmo imóvel e mesma sessão comprovada por consulta.
- Painel autenticado de 30 dias: Signature 7 visualizações, 5 sessões, 1 reserva confirmada, conversão 20%; Essenza 2 visualizações/1 sessão/0 reservas; Amore 1 visualização/1 sessão/0 reservas. Total do site 15 visualizações/5 sessões. São dados de ensaio.
- Preparação autorizada pelo proprietário: documento da conta QA substituído de passaporte por CPF de exemplo exclusivamente no ambiente isolado. O primeiro CPF de exemplo já estava em uso; a restrição de unicidade impediu a alteração e outro exemplo foi usado com sucesso.
- Problema encontrado: checkout com passaporte retorna `pagbank_cpf_required`, mas a interface mostra somente mensagem genérica. A adequação do documento de QA permitiu concluir o teste; a mensagem e o fluxo para hóspedes com passaporte continuam pendentes, não foram corrigidos nesta rodada.
- Sem repetição da suíte financeira. Verificação visual pelo texto acessível do painel; captura de imagem indisponível por proteção de credenciais do navegador.
