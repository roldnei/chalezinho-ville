# Ville Moments: escapadas automáticas e apresentação compacta

Base mais recente conferida: `feature/staged-whatsapp-launch`, `9997ef373b3933cff93bd8f5b304196666399b7b`, sem mudanças locais prévias. Vercel `chalezinho-ville`, projeto `prj_qXld7h9Z3I7mV9mZKuXJ4yQ1j3dc`, equipe `team_YfhCyXyWKAtieREJ6eXj3szW`. Supabase DEV `pxfqmnhqodqyaaqeyjgr` e PROD `irxsaladqhbzhkoaclxy` reconferidos pela conexão. Esta correção altera somente assets/frontend; não aplica migrations, funções, cadastros ou configurações de produção.

## Correção

O feed antes mapeava apenas `publications`; a vitrine enviava as cotações para resolver publicações de oferta existentes, mas as sugestões sem publicação própria só entravam pelo clique. Agora o mesmo retorno real de `stay_showcase` alimenta automaticamente o feed de descoberta, junto com as publicações existentes. Todas as sugestões vigentes são incluídas, sem criar publicações ou reservas no banco. O feed de pessoas seguidas mantém seu escopo.

Identidade da sugestão inclui oferta, chalé, entrada, saída, hóspedes e tarifa. Duas e três noites com a mesma entrada não se confundem. Atualizações atrasadas preservam a mídia, leitura e posição atuais. Sugestões duplicadas ou com entrada passada não entram na montagem do feed. A posição salva agora também identifica a escapada completa; recarregar/retornar no feed recupera a seleção.

A apresentação de escapadas mantém fotos reais e os quatro atalhos inferiores. Nome sem repetição, datas compactas com ano uma vez, noites/hóspedes, total consultado e condição da experiência compõem a tela principal. Inclusões, preço da experiência, desconto e tarifa ficam na abertura de condições. “Somente hospedagem” e “Outras datas” seguem acessíveis. Links para o resumo conservam datas, hóspedes, oferta, tarifa e total esperado; a revisão e a reconfirmação existentes continuam responsáveis pela cotação e pelo WhatsApp.

## Evidência local

- `npm test`: 453 testes passaram, zero falhas. Inclui quatro regressões novas com fixtures/JSDOM: 24 seleções mais quatro publicações, em ambas as ordens de carregamento; duplicação/entrada passada; saídas diferentes, total exato, atualização durante reprodução e retorno; escopo de pessoas seguidas.
- `npm run check`, `npm run typecheck` e build `VILLE_RELEASE_PROFILE=whatsapp VERCEL_ENV=preview` passaram.
- Os novos testes são simulados; não substituem a inspeção da interface real. Evidência de navegador e URL da prévia serão anexadas após a implantação DEV.

## Preservação e publicação

Não foram alterados motores de preço/disponibilidade, APIs de consulta, guardas de pagamentos/holds, rotinas financeiras, calendário, PMS, contratos, mídias, publicações, checkout completo ou Feelings. Evidência de ausência de efeitos financeiros do fluxo permanece no relatório `ultra-escapadas-20261011.md`; não representa um novo ensaio integral de checkout nesta correção de feed/layout.

A publicação em produção permanece pendente da autorização e dos pré-requisitos dos relatórios de lançamento anteriores. Esta mudança, quando autorizada, usa os mesmos assets na única base de código e a configuração explícita de ambiente/recurso. Retorno desta correção de frontend: reverter seu commit ou reconstruir o código `9997ef3` no ambiente correto. Não restaurar nem excluir dados de hóspedes, contratos ou pagamentos. Nunca promover uma prévia DEV para PROD.
