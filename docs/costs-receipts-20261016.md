# Custos e comprovantes

Entrada: `custos.html`, com links na Central, Financeiro e PMS. Base preservada: produção `721b053` (multicalendário em colunas e mês iniciado hoje). Nenhuma mudança no motor de reservas, pagamentos ou regras comerciais.

Cadastro administrativo de despesas com categoria, imóvel (ou geral), valor em centavos, competência, data do documento, pagamento, fornecedor, documento e observações. Fotos JPEG/PNG/WebP e PDF até 10 MB, originais privados, download autenticado individual ou ZIP do filtro com CSV e comprovantes. O CSV inclui totais e neutraliza fórmulas em conteúdo textual. ZIP sem compressão preserva bytes; limite de exportação conjunta de 100 MB para memória do dispositivo. Até 30 anexos no formulário.

Competência, mês de pagamento e mês fiscal são filtros independentes. Custos não viram deduções por padrão. As categorias previstas para exclusão começam pendentes de revisão; confirmação exige imóvel, comprovante previamente armazenado, pagamento, encargo do locador, justificativa, mês fiscal e valor parcial ou integral até o custo. Categorias operacionais são bloqueadas no banco para exclusão. Não há apuração automática do imposto nem transmissão/importação para Receita. Receitas, fonte pagadora, titularidade de rendimentos, deduções pessoais e saldo anual de IPTU exigem conferência separada. Para bens de terceiros, o custo deve ser atribuído ao contribuinte correto antes de qualquer declaração.

Fonte: Receita Federal, Perguntas e Respostas IRPF 2026, perguntas 209 e 445–449: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf . Comissões das plataformas podem ser excluídas quando suportadas pelo locador. Limpeza cobrada do hóspede integra rendimentos. Piscineiro, energia, limpeza e manutenção próprios não integram a lista legal de exclusões do aluguel de pessoa física; as regras de livro-caixa de trabalho autônomo não foram aplicadas ao aluguel.

## Dados e acesso

Migração `20261016125659_costs_receipts.sql`: tabelas `cost_entries`, `cost_receipts`, `cost_history`, bucket privado `cost-receipts`. RLS e privilégios restritos a administrador com acesso ativo. Sem permissão de apagar ou substituir comprovantes. Arquivamento retira dos totais e preserva documentos. Histórico de criação/alterações gerado em trigger privado, inacessível para escrita direta pelo navegador. Nenhuma leitura de metadados editáveis do usuário para autorização. Edição usa timestamp para detectar alterações concorrentes; cadastro e anexos usam IDs estáveis para permitir repetir falhas sem duplicação.

## Validação

- 7 testes próprios: moeda, três critérios de mês, filtros por imóvel/geral, exclusão de arquivados, CSV, ZIP, RLS, comprovação, categorias fiscais, valor, histórico, interface de cadastro/revisão, falha e reenvio de anexos sem duplicação.
- 16 testes existentes do financeiro/configuração e operação multicanal.
- Sintaxe dos scripts e build de prévia.
- ZIP aberto com `zipfile` Python e payload binário comparado byte a byte.
- DEV: migração aplicada; criação operacional e revisão fiscal com metadados de comprovante exercitadas como `authenticated` em transações com rollback. Não persistiram despesas de teste.
- Advisors DEV: nenhuma ocorrência nova para custos. Há avisos anteriores do projeto fora deste módulo.

Os testes de interface usam JSDOM com cliente de armazenamento simulado. O banco remoto foi testado com rollback, incluindo políticas reais e registro de metadados no Storage; isso não substitui uma captura de câmera nem upload físico pelo navegador. A instalação do Chromium neste executor falhou por download incompleto; não foi declarada homologação visual completa ou upload/download de um arquivo real em dispositivo físico.

Para disponibilização PROD: aplicar a mesma migração aditiva no projeto `irxsaladqhbzhkoaclxy` e publicar este commit no projeto Vercel `chalezinho-ville`, mantendo o perfil WhatsApp e a configuração PROD existentes. Retorno de frontend: deployment anterior; preservar tabelas e comprovantes, sem rollback destrutivo dos dados.
