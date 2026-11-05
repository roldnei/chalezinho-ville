# Relatórios de homologação DEV

Cada rodada entrega, em branch `qa/dev-e2e-report-<rodada>`:

- `<rodada>/RELATORIO.md`: veredito, totais, ambiente e limpeza.
- `<rodada>/COBERTURA.md`: linha por cenário e por variação importante.
- `<rodada>/ACHADOS.md`: fila acionável de correções e reteste.

Use o [modelo](../MODELO-RELATORIO.md). Aponte na resposta final a branch, o SHA e o link para a pasta da rodada. Se houver evidência sensível, indique apenas que ela está em local restrito autorizado, sem links que concedam acesso. Não coloque dados privados nem instruções de exploração no Git.
