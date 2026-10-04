# Cadastro de hóspedes — desenvolvimento

Implementado em 03/10/2026, branch `feature/guest-directory`.

## Uso

Painel → Hóspedes → Novo hóspede. Nome obrigatório, telefone opcional com DDD; números internacionais devem incluir + e código do país. Buscar por nome ou telefone, editar contato e vincular várias estadias. O contato também abre pelo período Airbnb/Booking no calendário ou pelo botão de contato no detalhe de uma reserva do site/manual.

Cada estadia tem um contato principal; um contato pode participar de muitas estadias. Para trocar uma pessoa vinculada, desvincular primeiro. Telefones compartilhados por familiares não são tratados como identidade única. Nenhuma fusão automática por nome ou telefone.

## Dados e segurança

`guest_contacts` guarda nome, telefone, observações e responsáveis. `guest_stay_links` liga um contato a uma reserva real ou a um período externo. Sem alterações em documentos de autenticação, dados financeiros ou cobranças. Alterar o contato atualiza a apresentação administrativa; os snapshots contratuais da reserva são preservados.

Ambas as tabelas usam RLS sem concessão a anon/authenticated. Somente a Edge Function com autenticação e papel administrativo validado no servidor acessa os registros. O comando exige ambiente de desenvolvimento. Nomes e telefones fornecidos pelo proprietário não fazem parte do repositório.

O servidor valida a existência da reserva ou do período externo; imóvel e datas vêm da fonte autoritativa. Períodos ambíguos, ausentes ou com erro de integração são rejeitados. Um vínculo existente não pode ser sobrescrito por outro hóspede. Listagem paginada internamente em blocos de 500, com falha explícita acima de 10 mil registros por tabela.

## Limites

A integração iCal atual identifica períodos por origem, imóvel e datas, não pelo UID do evento. Alterações das datas externas exigem conferir e refazer o vínculo; não há atribuição automática ao novo período. A ficha avisa quando o período não consta do calendário consultado. Reservas internas mostram datas atuais; o vínculo mantém o snapshot da associação. O painel consulta a janela operacional existente (dois meses passados até doze futuros).

Este recurso não envia WhatsApp, não importa hóspedes automaticamente do Airbnb e não cria reservas financeiras a partir de iCal. Telefones continuam sendo informados manualmente.

## Verificação

- Seis testes novos locais: normalização/validação de telefone; um contato em duas estadias; edição sem alterar reserva financeira; rejeição de períodos inválidos e troca indevida; paginação e falhas; interface criar/editar/vincular/desvincular, calendário e escape HTML.
- `node tests/guest-directory.test.mjs`: 6 PASS.
- TypeScript, sintaxe administrativa e build do preview: PASS.
- Migração aplicada somente em `pxfqmnhqodqyaaqeyjgr`; booking-engine versão 30, preservando os arquivos da versão 29 implantada.
- Consulta independente confirma RLS e ausência de SELECT para anon/authenticated. Aviso informativo do advisor sobre RLS sem política é esperado: a API é exclusiva do servidor.
- HTTP sem autenticação no novo endpoint: 403 `admin_required`.
- Três contatos autorizados importados e vinculados a períodos futuros, conferidos no feed Airbnb em 03/10/2026. Identidades e telefones ficam somente no banco administrativo.
- Homologação no navegador autenticado do novo preview ainda pendente: a sessão anterior expirou. Os testes de UI usam dados simulados e não substituem essa etapa.

Nenhuma suíte financeira completa repetida, infraestrutura paga criada ou alteração de produção.
