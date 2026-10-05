# Vitrine de estadias em dias de semana — desenvolvimento

## Ambiente confirmado antes das alterações

- Repositório: roldnei/chalezinho-ville.
- Branch: feature/romantic-stay-offers; base c3e455b097049422d2243ee876f9287b8872ec05, árvore limpa.
- Preview inicial: https://chalezinho-ville-mxj6h6e65-roldneicosta-4140.vercel.app/, Vercel READY, target preview (null), commit da branch.
- Supabase: pxfqmnhqodqyaaqeyjgr, chalezinho-ville-finance-dev. Produção não foi modificada.

## Referências e diagnóstico

CVC apresenta datas de ida/volta e preços em suas vitrines; Decolar associa duração, datas, composição e economia nos cards. Airbnb documenta o uso das avaliações nas acomodações. Fontes primárias consultadas em 05/10/2026:

- https://www.cvc.com.br/
- https://www.decolar.com/pacotes/
- https://www.airbnb.com.br/help/article/1257

A página de ofertas do Mercado Livre não pôde ser obtida pela pesquisa; não foi usada como evidência visual.

Na home anterior, o carregamento dinâmico inseria um card genérico extenso antes da faixa de avaliações. Os dois CTAs tinham URLs distintas, mas a apresentação não explicava bem a diferença. Não havia vitrine de combinações de datas com preço consultado. As notas 4,95/41 já eram conteúdo estático: foram reposicionadas, sem inventar novos depoimentos ou agregá-las às propriedades individuais.

## Implementação

- Hero: “Fujam da rotina. Encontrem tempo para vocês.” CTAs distintos para ver escapadas/preços e escolher datas.
- Faixa de avaliações permanece imediatamente depois do hero, antes da vitrine, com acesso à coleção.
- Vitrine horizontal acessível por toque, teclado e setas. Cards com imóvel, datas, duração, hóspedes, composição, tarifa, preço total, economia e acesso direto à reserva.
- Filtros de duração e formulário para datas próprias com experiência ou somente hospedagem.
- Ofertas em noites de segunda a quinta, checkout na sexta permitido. Seleção considera os menores preços consultados, e respeita duração/período da oferta, disponibilidade do imóvel e regras vigentes. Não afirma previsão de demanda nem “menor preço do mercado”.
- Server-side: lê o calendário PriceLabs e os bloqueios uma vez por consulta; verifica candidatos com o mesmo cálculo e validações do motor de reservas. Não cria motor paralelo de preços.
- Consulta de vitrine não grava quotes, opções, reservas, pagamentos ou tarefas. Cache em memória por até 60 segundos; edição do catálogo invalida a chave. No clique, disponibilidade, preço, oferta e tarifa são reconfirmados no motor.
- Link leva imóvel, oferta explícita, datas, hóspedes e tarifa. Login/retomada e hospedagem sem experiências continuam disponíveis.
- PMS: ativação da vitrine, durações e horizonte de 14–90 dias; mantém desconto editável e demais regras.
- Fotos dos cards preservam a composição inteira. A oferta demonstrativa principal foi renomeada para “Escapada a dois”, vitrine ativada para 2/3 noites e 60 dias, com auditoria. Sua antiga foto de flores foi retirada da capa da oferta; cards usam a capa cadastrada do imóvel. Reservas anteriores conservam o nome e composição contratados.

## Verificação

- 253 testes automatizados aprovados. Testes de servidor puro e DOM simulam cenários de capacidade, pausa, incompatibilidade, períodos, durações, preço final, cache e passagem para reserva. Essa simulação não equivale a teste visual em navegador.
- TypeScript, sintaxe JavaScript, diff check e build de preview aprovados.
- API real de desenvolvimento: 18 cards disponíveis. Exemplo observado: Ville Essenza, 07–09/10/2026, 2 noites, tarifa Não reembolsável, R$ 1.198,14, desconto R$ 63,06. Esse preço é um exemplo temporal de desenvolvimento, não uma promessa fixa.
- Antes/depois da consulta real: 17 reservas, 18 pagamentos, 20 tarefas, 76 quotes e 148 opções. Hash dos contratos de todas as reservas: c110298ea7609246e5649ff4b88c2483, inalterado.
- Migração aditiva stay_offer_weekday_showcase aplicada somente em DEV; booking-engine atualizado para versão 47.

## Limitações

O preview pede autenticação na Vercel. A inspeção pelo navegador chegou à tela real de login; a revisão visual final de desktop/celular e capturas da nova versão depende dessa autenticação. A proteção não foi removida e nenhum link público de bypass foi criado.

Os pacotes do catálogo DEV continuam com preços de teste e itens genéricos já cadastrados (ambientação, detalhes decorativos e preparo). Não foram prometidos vinho, queijos, frutas ou refeições sem cadastro. A operação precisa cadastrar a composição e preço comerciais antes de futura publicação autorizada em produção. Os estornos sandbox pendentes da etapa anterior não foram reapresentados como concluídos nem repetidos nesta etapa.
