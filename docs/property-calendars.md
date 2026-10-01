# Calendários por imóvel

Na Central, abrir Imóveis → Calendários do imóvel. Cada imóvel recebe automaticamente um token aleatório de 256 bits, inclusive quando criado fora da interface. O link do site pode ser copiado para a importação de calendário da Booking e do Airbnb. Renovar invalida o link antigo.

Cada imóvel pode cadastrar um calendário Booking e um Airbnb. Salvar valida o domínio HTTPS e consulta o conteúdo antes de substituir a configuração; falha preserva a anterior. Testar agora registra horário, resultado e quantidade de eventos. Links e tokens são acessíveis somente pelo backend e pela API administrativa; usuários comuns não possuem SELECT nas tabelas.

Exportação: GET público por token, text/calendar, CRLF, UID estável, datas de dia inteiro e checkout exclusivo. Inclui reservas diretas/manuais confirmadas, holds válidos, bloqueios operacionais ativos e retenções válidas de alteração. Cancelamentos e expiração deixam de aparecer. Sem nomes, contatos, valores ou descrição de ocorrências. Eventos externos não são reexportados, evitando ciclos; eventos com UID próprio que retornem em um feed são ignorados.

Importação consulta os feeds na pesquisa, cotação e central administrativa. Sem cache antigo usado para liberar novas vendas. Rede indisponível, resposta inválida, recorrência não suportada ou evento sem datas válidas bloqueiam disponibilidade do imóvel afetado. Somente os domínios oficiais permitidos, sem credenciais na URL nem redirecionamentos; leitura limitada a 2 MB e timeout de 8 segundos.

## Migração e ambiente

Booking dos três imóveis existentes migrado dos secrets para os novos cadastros. Nenhum link privado está neste documento ou no código. Para Airbnb, os valores antigos da Vercel são write-only e não podem ser recuperados pelo painel. Enquanto o proprietário não preencher os links nos novos campos, a integração anterior continua funcionando como compatibilidade temporária. Um novo link cadastrado passa a ser a fonte imediatamente, sem deploy e sem código por anúncio. Novos imóveis não dependem de códigos CH1/CH2/CH3.

O deployment atual usa o banco de homologação. Seus exports contêm fixtures e não devem ser adicionados aos anúncios reais até aprovação de produção. A importação dos links reais é somente leitura. iCal não é sincronização transacional instantânea: cada plataforma decide quando consultar o site. Tarifas, pagamentos e dados de hóspedes não são sincronizados por este conector.

## Validação

157 testes automatizados aprovados. Feed público HTTP 200 com tipo iCal para os três imóveis; tokens distintos; token inexistente 404; API administrativa anônima 403; URL privada inválida 400 preservando valor anterior. Novo imóvel cria token por trigger, comprovado em transação revertida. RLS e privilégios confirmam ausência de leitura por anon/authenticated. Buscas mantiveram bloqueio Booking e datas livres após a migração. Sintaxe frontend e TypeScript aprovados.
