# Pausa das escapadas da vitrine — 11/10/2026

Solicitação: pausar todas as escapadas da vitrine para liberação manual posterior.

Ambiente: somente DEV, Supabase `pxfqmnhqodqyaaqeyjgr`. Produção `irxsaladqhbzhkoaclxy` não foi alterada. Prévia inspecionada: https://chalezinho-ville-35yaq7uot-roldneicosta-4140.vercel.app/index.html?view=site

## Alteração

Às 14:44:19.827527 UTC, as duas ofertas ativas da vitrine foram pausadas: Escapada Ultra Premium · à vista (`1826ddf2-87f4-4c04-8f3f-e3f1e830fdca`) e Escapada Ultra Premium · cartão (`87c99ed5-16e2-4e26-bf10-c2b0d34a519a`). Foram atualizados somente status e updated_at, com dois registros em audit_events. As outras três ofertas já estavam pausadas. Todos os cinco cadastros foram preservados; zero ofertas da vitrine permanecem ativas.

As sugestões de datas são geradas a partir de modelos de oferta; as versões à vista e cartão produziam sugestões nas mesmas datas. A reativação de um modelo pode voltar a gerar várias sugestões. Não são cadastros individuais para cada data exibida.

## Verificação

Consulta ao banco após a alteração confirmou as cinco ofertas pausadas e zero ofertas ativas com showcase.enabled. Contagens antes/depois permaneceram iguais: reservations 30, payments 34, quotes 346, pms_calendar_blocks 2, notification_outbox 136. A operação não alterou reservas, pagamentos ou bloqueios.

No navegador real em nuvem, a prévia carregou zero elementos .showcase-card e exibiu: “As escapadas estão pausadas no momento. Você pode consultar somente hospedagem abaixo.” Evidência: evidence/escapadas-pausadas-20261011.jpg. Não houve teste em aparelho físico nesta alteração de catálogo. Não houve deployment ou promoção.
