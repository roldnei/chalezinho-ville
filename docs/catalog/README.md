# Casas e apartamentos — 23/11/2026

Coleção própria em `/casas-e-apartamentos.html`, com páginas `/imoveis/:slug`, fotos reais, filtros e consulta por datas/hóspedes. Toda conversão termina no WhatsApp; consultas não criam reservas, bloqueios ou cobranças. A coleção romântica e sua busca continuam limitadas a chalés.

## Cadastro e integrações

No PMS, cadastre o imóvel, configure descrição, fotos, capacidade e condições comerciais. Em **Anúncio no site**, configure as características da coleção e publique o anúncio. O vínculo do PriceLabs é salvo separadamente; preços são associados pelo ID exato e plataforma, sem associação por posição da resposta. Uma tabela incompleta não gera preço anunciado.

Em **Disponibilidade**, adicione quantos calendários iCal forem necessários, identificando cada plataforma. Copie o calendário de saída do PMS para a função de importar calendário de cada plataforma. URLs privadas ficam nas tabelas protegidas, fora do código e do catálogo público.

Ao fechar uma reserva pelo WhatsApp, registre a reserva direta no PMS ou aplique um bloqueio. A busca canônica verifica reservas, bloqueios, alterações temporárias e calendários externos. A saída iCal exporta reservas diretas e bloqueios, sem contatos, preços ou calendários externos importados. A propagação depende da frequência de atualização da plataforma; não é instantânea.

## Imóveis iniciais

| Imóvel | Capacidade | PriceLabs/Airbnb | Booking |
| --- | --- | --- | --- |
| Centro | 4 hóspedes, 2 quartos, 1 banheiro | 1732828144272686001 | Entrada iCal configurada |
| Praia do Morro | 6 hóspedes, 3 quartos, 2 banheiros | 1818457476674069133 | Ainda sem anúncio |

Centro: ar-condicionado nos quartos, enxoval incluído, sem garagem ou elevador. Praia do Morro: garagem, ventiladores, sem ar-condicionado e sem enxoval; unidade nos fundos, sem promessa de vista para o mar ou uso da área de lazer do condomínio.

As condições anunciadas de crédito e parcelamento foram copiadas das condições persistidas do CH1 e continuam editáveis por imóvel no PMS. As taxas de limpeza são R$ 250 e R$ 320. Em DEV, a tabela própria obrigatória foi inicializada com as bases verificadas no painel PriceLabs (R$ 270 e R$ 480, modo automático). Em produção, as consultas usam os preços diários reais do PriceLabs.

## Verificação

- 45 testes de domínio, calendários multicanal, regras e interface.
- 29 testes de domínio, estoque PMS e condições comerciais (há testes em comum entre os grupos).
- Build WhatsApp concluído; TypeScript do novo serviço verificado.
- Catálogo e páginas individuais conferidos em navegador, inclusive em 320 px, sem rolagem horizontal.
- Consulta DEV e PROD, mensagem WhatsApp e galeria conferidas.
- Bloqueio temporário apenas em DEV retirou o Centro da disponibilidade, preservou o Morro e apareceu no iCal sem dados privados; bloqueio cancelado ao final.
- Ações administrativas sem sessão retornam HTTP 403.
- API de produção devolveu os mesmos preços dos três chalés antes/depois da mudança nas datas 04–06/12/2026 e preços reais para os dois apartamentos.

O serviço `rental-catalog` reutiliza o inventário e as regras do mecanismo de consulta existente. Não substitui funções financeiras de DEV e não habilita checkout público.
