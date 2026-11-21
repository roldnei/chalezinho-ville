# Condições comerciais por imóvel — 21/11/2026

No PMS: **Imóveis → imóvel → Taxas e pagamento → Preço anunciado no site**. Os campos de taxa no crédito e número de parcelas são persistidos por imóvel. À vista usa o total da cotação original (hospedagem e limpeza), identificado como “no Pix”. Os controles anteriores de limpeza, garantia e parcelas do gateway continuam na mesma seção.

A configuração inicial dos três chalés foi cadastrada como dado: 700 pontos-base (7%) e 10 parcelas. Não há taxa ou quantidade comercial padrão no JavaScript ou no schema. Alterações futuras são feitas pelo PMS. O preço anterior foi removido das apresentações públicas. Site, resumo para atendimento e vídeos usam o mesmo formatador e as mesmas condições por imóvel.

O valor de cada parcela é arredondado em centavos; o total no cartão é a soma das parcelas iguais. O valor Pix permanece exatamente o total original, sem desconto percentual invertido sobre o cartão. O formatador não modifica a cotação. Se faltar configuração ou a consulta falhar, o site apresenta apenas o preço à vista e a exportação solicita configuração no PMS; não inventa juros ou parcelas.

A vitrine mantém cache de condições por até 60 segundos. Busca por datas, continuação para atendimento e reconfirmação antes da exportação renovam as condições. Uma mudança comercial exige nova revisão do resumo antes de gerar o link do WhatsApp. Os parâmetros de cada vídeo ficam congelados durante sua renderização.

## Persistência e acesso

Tabela `public.property_commercial_payment_terms`: leitura pública somente das condições comerciais, escrita apenas para administrador com acesso PMS ativo. Constraints e trigger validam os valores e o limite de parcelas do imóvel. Toda alteração grava auditoria. Atualização otimista por `updated_at` impede sobrescrita entre duas telas.

Migração aplicada em DEV: `20261121124806`. A mesma DDL foi aplicada pelo conector em produção com versão gerada `20261121132153`. O arquivo local usa a versão DEV. A carga inicial foi feita separadamente por código CH1/CH2/CH3, sem sobrescrever valores preexistentes. Nenhum endpoint financeiro, conexão de calendário, reserva ou dado de pagamento foi alterado.

## Verificações executadas

- 108 testes passaram: preços configuráveis por imóvel, recarga após edição, indisponibilidade de configuração, montagem/salvamento/reabertura do formulário com banco PostgreSQL PGlite e RLS reais, concorrência, auditoria, acesso anônimo/equipe/admin suspenso, prévias e exportações, resumo e mensagens de atendimento, consulta pública, seleção de parcelas do checkout DEV e navegação móvel.
- `npm run check`: passou. Sintaxe dos módulos novos: passou.
- Build `VILLE_RELEASE_PROFILE=whatsapp node scripts/build-finance-preview.mjs`: passou.
- REST público DEV: leitura 200 com os três registros; tentativa anônima de edição não alterou registros.
- Advisor de segurança DEV/PROD: sem achado relativo à nova tabela.

Os testes do editor usam navegador JSDOM ligado a PostgreSQL PGlite. A sessão administrativa do navegador remoto exige login; portanto não se afirma teste de salvamento pela conta administrativa em produção.
