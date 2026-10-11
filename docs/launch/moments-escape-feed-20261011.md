# Ville Moments: escapadas automáticas e apresentação compacta

Base mais recente conferida: `feature/staged-whatsapp-launch`, `9997ef373b3933cff93bd8f5b304196666399b7b`, sem mudanças locais prévias. Vercel `chalezinho-ville`, projeto `prj_qXld7h9Z3I7mV9mZKuXJ4yQ1j3dc`, equipe `team_YfhCyXyWKAtieREJ6eXj3szW`. Supabase DEV `pxfqmnhqodqyaaqeyjgr` e PROD `irxsaladqhbzhkoaclxy` reconferidos pela conexão. Esta correção altera somente assets/frontend; não aplica migrations, funções, cadastros ou configurações de produção.

## Correção

O feed antes mapeava apenas `publications`; a vitrine enviava as cotações para resolver publicações de oferta existentes, mas as sugestões sem publicação própria só entravam pelo clique. Agora o mesmo retorno real de `stay_showcase` alimenta automaticamente o feed de descoberta, junto com as publicações existentes. Todas as sugestões vigentes são incluídas, sem criar publicações ou reservas no banco. O feed de pessoas seguidas mantém seu escopo.

Identidade da sugestão inclui oferta, chalé, entrada, saída, hóspedes e tarifa. Duas e três noites com a mesma entrada não se confundem. Atualizações atrasadas preservam a mídia, leitura e posição atuais. Sugestões duplicadas ou com entrada passada não entram na montagem do feed. A posição salva agora também identifica a escapada completa; recarregar/retornar no feed recupera a seleção.

A apresentação de escapadas mantém fotos reais e os quatro atalhos inferiores. Nome sem repetição, datas compactas com ano uma vez, noites/hóspedes, total consultado e condição da experiência compõem a tela principal. Inclusões, preço da experiência, desconto e tarifa ficam na abertura de condições. “Somente hospedagem” e “Outras datas” seguem acessíveis. Links para o resumo conservam datas, hóspedes, oferta, tarifa e total esperado; a revisão e a reconfirmação existentes continuam responsáveis pela cotação e pelo WhatsApp.

## Evidência local

- `npm test`: 454 testes passaram, zero falhas. Inclui cinco regressões novas com fixtures/JSDOM: 24 seleções mais quatro publicações, em ambas as ordens de carregamento; duplicação/entrada passada; saídas diferentes, total exato, atualização durante reprodução e retorno; escopo de pessoas seguidas; preservação do título salvo na prévia privada do editor.
- `npm run check`, `npm run typecheck` e build `VILLE_RELEASE_PROFILE=whatsapp VERCEL_ENV=preview` passaram.
- Os novos testes são simulados; a inspeção real abaixo foi executada separadamente.

## Evidência real em DEV

Prévia READY: https://chalezinho-ville-nrah38l4p-roldneicosta-4140.vercel.app/index.html?view=moments . Deployment `dpl_FpzwptYJNjCkorT1rmz3AbgngeER`, target null (preview), SHA `2e2c8dc62ee07fd1ff2b80be1ba54fbcde3c630d`. O primeiro build de `9a759cc` falhou com `git_info_fail`; uma nova prévia do mesmo commit ficou READY. Nenhuma promoção/publicação PROD ocorreu.

- Entrada direta no Ville Moments, sem clique na vitrine: contador real 28, com quatro publicações e 24 sugestões. Leitura do DOM da vitrine confirmou 24 cards.
- Quadro móvel real em navegador Chrome remoto, iframe 390 × 844 e 320 × 844. `documentWidth` = viewport em ambos. Cabeçalho, card, CTA e navegação inferior não se sobrepõem. Em 390, card y221–624, CTA y509–563, navegação y772–844. Em 320, card y214–624, CTA y513–567.
- Percorridas por cliques reais todas as 28 entradas no quadro 320: 24 escapadas distintas, zero divergências entre os links (oferta, chalé, entrada/saída, hóspedes, tarifa, total esperado) e preços exibidos no feed versus vitrine. A seta seguinte ficou desabilitada no último item. Evidência comercial sem hóspedes identificados em `moments-feed-real-20261011.json`.
- Inclusões e condições abertas e fechadas pela interface real: quatro componentes, experiência à vista R$539, gross R$1.813,30, desconto R$90,67 e total R$1.722,63 para Amore 19–21/out/2026.
- Apresentação desktop real 1363 × 936: card 600px, cabeçalho, CTA, setas e quatro atalhos sem sobreposição. Capturas em `evidence/moments-escapada-mobile-20261011.jpg` e `evidence/moments-escapada-desktop-20261011.jpg`.
- Clique real em “Quero estes dias” no último item: Amore 17–20/out, três noites, Ultra Premium cartão. Revisão sem login, tarifas inicialmente sem seleção; escolhida Não reembolsável e bebida Espumante. Valores antigos desapareceram durante recálculo. “Continuar pelo WhatsApp” atualizou a cotação e preparou o link ao número oficial; mensagem contém exatamente o resumo exibido e solicita finalização, sem afirmar confirmação. Hospedagem R$1.888,70 + limpeza R$292 + Ultra R$569, desconto zero, total R$2.749,70.
- Não aberto nem enviado WhatsApp. A tentativa de validar a leitura da área de transferência encontrou restrição de observação do navegador após a ação; cópia real final não homologada. Essa restrição também ocorreu num avanço desktop; a navegação móvel no iframe funcionou e foi percorrida integralmente. Cópia/fallback continuam cobertos por testes locais, distinguindo-os da prova real.
- Consulta SQL read-only DEV após a jornada, com corte em 2026-10-11T13:27:31Z (primeiro commit da correção): 30 reservas, 34 pagamentos, 346 quotes, dois bloqueios, 136 itens outbox, 30 tarefas PMS e 78 lançamentos financeiros. Zero novas linhas nessas sete entidades desde o corte; totais iguais à evidência anterior. Nenhum hold ou reserva nova, cobrança, bloqueio, confirmação ou tarefa de preparação foi criado pelo percurso/revisão.

Não houve teste em aparelho físico; os quadros usam documentos reais carregados na largura indicada em navegador remoto. Checkout completo e demais funções do PMS não foram retestados manualmente nesta correção; regressões locais passaram e as pendências anteriores permanecem.

## Preservação e publicação

Não foram alterados motores de preço/disponibilidade, APIs de consulta, guardas de pagamentos/holds, rotinas financeiras, calendário, PMS, contratos, mídias, publicações, checkout completo ou Feelings. Evidência de ausência de efeitos financeiros do fluxo permanece no relatório `ultra-escapadas-20261011.md`; não representa um novo ensaio integral de checkout nesta correção de feed/layout.

A publicação em produção permanece pendente da autorização e dos pré-requisitos dos relatórios de lançamento anteriores. Esta mudança, quando autorizada, usa os mesmos assets na única base de código e a configuração explícita de ambiente/recurso. Retorno desta correção de frontend: reverter seu commit ou reconstruir o código `9997ef3` no ambiente correto. Não restaurar nem excluir dados de hóspedes, contratos ou pagamentos. Nunca promover uma prévia DEV para PROD.

## Prévia final confirmada

https://chalezinho-ville-35yaq7uot-roldneicosta-4140.vercel.app/index.html?view=moments

Deployment `dpl_7nQRsc97CujcXZWsM9iHZjuYKpSu`, READY, target null, commit `d65b80f1cd361e0a234449b547636c9ae114d736`. Reaberto o feed diretamente na versão final: 28 entradas e 24 cards reais da vitrine, sem clique numa sugestão. Nova captura do quadro 390px na versão final em `evidence/moments-mobile-final-20261011.jpg`. Prévia privada do editor mantém título salvo; quinta regressão passou no total de 454 testes. Último PROD READY reconferido continua `dpl_GfCE3VYLNmxwSorGBUPYQjU6ys41`, commit `9bc9e0e7d3b9d18bb643e724f999ff37f64bc2fc`, igual à evidência anterior.
