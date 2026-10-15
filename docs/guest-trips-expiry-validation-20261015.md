# Validade de Trips de hóspedes

Trips de hóspedes ficam públicos por 168 horas (7 dias) desde a aprovação. Enquanto aguardam aprovação, não consomem a validade. Os já aprovados recebem o mesmo prazo a partir de `published_at`, sem reiniciar a contagem. Trips da equipe e ofertas mantêm suas regras anteriores.

O banco define `expires_at` em trigger SECURITY INVOKER, sem novos acessos a clientes. Editar outro campo não estende a validade; alterações do hóspede voltam ao circuito de aprovação. O feed, perfil público, marcações públicas, interações e sinais respeitam o vencimento. Autores e administradores preservam o histórico e mídias, com indicação Expirado. Não há exclusão automática de arquivos ou publicações.

Validação:

- `npm test`: 787 testes passaram, zero falhas.
- 92 testes direcionados iniciais de editor/publicações/comunidade/serviço e 33 testes posteriores de comunidade/serviço passaram.
- Limite exato de 168 horas, timestamps inválidos, datas futuras, aprovação após longa espera, tentativa de prolongar validade e conteúdo editorial sem validade adicional.
- DEV real: dois Trips QA isolados, um aprovado pela RPC administrativa e outro expirado. Chamadas HTTP ao feed e perfil retornaram apenas o aprovado; API social do expirado retornou 404. Exclusão dos dois registros QA e dependências após o teste; zero fixtures remanescentes.
- Migração `20261015200104_guest_trips_week_expiry.sql` aplicada DEV e PROD. Dois Trips reais publicados existentes em PROD receberam validade, sem criar dados de teste em produção.
- `villegram-content`: DEV v28; PROD v9. Mantidos os arquivos de política de cada ambiente e a aprovação administrativa.
- Interface validada pelos testes JSDOM existentes; sem aparelho físico nesta alteração.
