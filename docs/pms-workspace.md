# PMS por tarefas — desenvolvimento

Navegação móvel: Hoje, Calendário, Imóveis, Avisos, Menu. Hoje possui abas Hoje/Próximas. O calendário inicia pela seleção do imóvel; a agenda conjunta continua acessível. Disponibilidade abre com calendário, regras de estadia e conexões em abas. Campos simples de regras mostram o valor atual e expandem para edição.

Imóveis: cartões por assunto, com fotos, espaço, comodidades, condições e dados. Comodidades são persistidas em `properties.features.amenities`; opções comuns mais itens personalizados, preservando os existentes. O editor rejeita conflitos por `updated_at` e preserva as demais features.

## Acesso por imóvel

O administrador geral convida uma pessoa pelo módulo Equipe e acessos, perfil `host`, seleciona seus imóveis e marca `manage_listings` (Editar anúncios e comodidades). Este perfil abre `meus-imoveis.html`; o editor permite título, descrição e comodidades apenas dos imóveis explicitamente atribuídos. Limpeza e prestadores não editam anúncios. Suspensão é verificada pelo autenticador operacional a cada requisição. `listingsAction` restringe leitura no banco e rejeita IDs fora do escopo antes de ler/atualizar.

O papel `admin` é global e não deve ser dado a proprietários externos. A permissão nova não é atribuída automaticamente às contas existentes. Financeiro, operação e hóspedes continuam sujeitos às permissões operacionais existentes. Nenhum novo usuário foi convidado neste trabalho.

## Limites explícitos

Esta entrega não transforma o sistema em SaaS com organizações independentes. Cadastro autônomo de novos imóveis por anfitriões, equipe própria por organização, editor de fotos/condições/calendários externos para anfitriões e repasse financeiro por proprietário ainda precisam de implementação e homologação. O acesso limitado novo cobre edição de texto e comodidades; os demais controles administrativos permanecem exclusivos do administrador geral.

Guia privado de chegada (Wi-Fi, senhas e instruções de acesso) não deve ir em `properties.features`, pois dados de propriedades são usados publicamente. Não foi criado um formulário que publicasse essas informações. A estrutura visual utiliza somente os módulos funcionais existentes.

Validação: seis testes de fluxo/escopo específicos, incluindo ID forjado, negação sem permissão, filtro de listagem, preservação de campos financeiros, comodidades personalizadas e navegação. Tipagem de pms-operations aprovada. Verificação visual em navegador não concluída neste ambiente; navegador local não inicia por restrição de socket. Nenhuma alteração em produção.
