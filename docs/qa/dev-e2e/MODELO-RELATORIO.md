# Modelo de entrega — rodada DEV ponta a ponta

Copie para `relatorios/<rodada>/RELATORIO.md` e preencha. Use `ACHADOS.md` para o detalhe sanitizado e `COBERTURA.md` para a matriz. Estes arquivos vão para um repositório público; revise o diff inteiro antes de enviar.

## RELATORIO.md

- ID e data/hora da rodada:
- Branch, SHA e caminho deste roteiro:
- Commit servido pela prévia DEV:
- Versões relevantes de API e banco:
- PagBank sandbox confirmado:
- Navegadores e dimensões (real, emulado ou simulado):
- Papéis e dados sintéticos usados (apelidos, sem identificadores sensíveis):
- Comandos executados e resultado:
- Veredito: **PRONTO PARA RETESTE / NÃO PRONTO / BLOQUEADO**. Liste o motivo, total por estado e todos os P0 fora de PASS.
- Resumo: principais achados, diferenças esperadas/observadas, decisões do provedor, itens fora de escopo e sequência sugerida.
- Limpeza: o que foi removido/revogado, o que permanece por necessidade de auditoria e o que ficou bloqueado.
- Confirmação de escopo: apenas DEV e sandbox; nenhum contato real ou operação de produção.

## COBERTURA.md

| Caso/variação | Papel e tela | Camada comprovada | Esperado | Observado | Estado | Evidência sanitizada / achado |
|---|---|---|---|---|---|---|
| PAY-01a | Hóspede A, mobile | UI DEV + API + sandbox | Pagamento confirmado uma vez | Preencher | NOT_RUN | Preencher |

Camadas: `LOCAL`, `UI SIMULADA`, `UI DEV`, `API DEV`, `BANCO DEV`, `SANDBOX CONFIRMADO`. Indique separadamente tudo que verificou; não use a camada mais forte para encobrir etapas que não rodaram. Estados: PASS / FAIL / BLOCKED / NOT_RUN / N/A. Registre cada cenário da matriz, inclusive os bloqueados, e desdobre variações relevantes.

## ACHADOS.md

Use IDs `DEVQA-<rodada>-001`, `002` etc. Cada achado precisa incluir:

1. **Título / caso / prioridade / severidade.** Crítico: risco demonstrado de acesso indevido, dados ou dinheiro. Alto: fluxo essencial interrompido ou sem proteção demonstrada. Médio: prejuízo operacional recuperável. Baixo: acabamento. Registre impacto concreto.
2. **Pré-condições:** versão, papel, tela, ambiente, dados sintéticos, navegador e tempo relevantes.
3. **Reprodução:** passos mínimos, resultado esperado e observado. Se for vulnerabilidade aberta, dê somente resumo seguro no Git; mantenha passos exploráveis e evidências em local privado autorizado.
4. **Evidência:** horário, status e referência sanitizada ou rótulo de evidência restrita. Não publique HAR bruto, credenciais, PII, IDs de cobrança nem links com acesso.
5. **Diagnóstico:** camada suspeita, confiança, comparação com regressão conhecida e condição que descarta falso positivo. Não confunda falha com bloqueio de ambiente.
6. **Aceite da correção:** o que precisa passar, qual regressão precisa existir e como testar sem misturar DEV e produção.
7. **Handoff:** estado `NOVO`, `EM CORREÇÃO`, `PRONTO PARA RETESTE`, `FECHADO` ou `BLOQUEADO`; PR/commit da correção, prévia, resultado e data de reteste. Preencha os campos posteriores em nova rodada, preservando o observado originalmente.
