# Conferências da equipe — validação DEV em 15/10/2026

Implementação funcional em `feature/team-inspections-20261015`.
Commit funcional validado: `935d099222655d9eb7cec7f419e3fbc6c201e8b6`.
O commit posterior desta documentação contém apenas evidências e este relatório.

- [Área da equipe / prévia DEV](https://chalezinho-ville-pc4m12k7i-roldneicosta-4140.vercel.app/conferencias.html)
- [Prévia em 390 × 844](https://chalezinho-ville-pc4m12k7i-roldneicosta-4140.vercel.app/inspection-mobile-qa.html)
- PMS da mesma prévia: `pms-operacao.html` → Tarefas → abrir tarefa → **Responsável, link de acesso e conferência da equipe**.

## Uso

1. No PMS, abra a tarefa pós-hospedagem ou preparação/pós-limpeza.
2. Abra o gerenciamento da conferência. Pesquise a pessoa pelo nome ou cadastre nome e WhatsApp. É possível selecionar uma conta existente antes de informar o número.
3. Salve o responsável. Não é necessário conceder acesso ao PMS, imóveis ou financeiro.
4. Gere o link e toque em **Enviar pelo WhatsApp**. Abre uma mensagem pronta no WhatsApp; esta entrega não inclui disparo automático por provedor/API.
5. A pessoa abre o link, confirma nome e e-mail opcional no primeiro acesso, responde aos itens e anexa fotos. Pode salvar e continuar depois.
6. Ao concluir, a tarefa passa para **Aguardando revisão** no PMS. O link deixa de funcionar imediatamente. A aprovação administrativa continua separada.
7. Para reabrir, informe justificativa no gerenciamento. O link antigo continua inválido; gere um novo.

O acesso normal fica em **Minhas conferências**, também disponível na conta. A lista contém somente tarefas abertas atribuídas à pessoa. O link individual contém exclusivamente sua tarefa. Não há menus administrativos, dados de hóspedes ou valores financeiros nessa área.

## Implementação e segurança

Reutiliza `ops_tasks`, `ops_task_results`, `ops_evidence`, `ops_templates` e `ops_history`. Não cria um segundo fluxo de hospedagens nem altera a geração multicanal. A branch preserva os avanços da plataforma de faxinas e as correções de Moments publicadas, e contém todos os commits da branch `desenvolvimento` inspecionada.

Cada tarefa preserva itens e regras de resposta/foto/N/A do modelo. O administrador pode criar nova versão, ordenar as linhas e definir obrigatoriedade; tarefas anteriores não mudam. Preparação/pós-limpeza e saída têm tarefas, respostas e arquivos independentes. Problemas são destacados no PMS e nunca geram cobrança automaticamente.

`inspection_dispatch` é executável somente por `service_role`, sem `SECURITY DEFINER`. A Edge Function valida Auth com `getUser` ou o token individual e o banco verifica novamente tarefa, responsável, validade e situação. Tabelas operacionais e as duas tabelas novas têm RLS e nenhum acesso direto de `anon`/`authenticated`. Não existe política pública de Storage para estas evidências. Fotos são lidas após autorização e devolvidas sem URLs assinadas reutilizáveis.

Links possuem 256 bits aleatórios, hash SHA-256 no banco e validade de sete dias. Reemitir, trocar responsável ou concluir revoga o anterior. O link identifica o cadastro ao qual foi emitido, sem exigir senha ou confirmação por SMS; é uma credencial individual e não deve ser encaminhado. Reatribuição mantém respostas e fotos prontas. Envios ainda incompletos do responsável anterior são arquivados, sem apagar arquivo/histórico e sem bloquear o novo responsável.

Respostas ficam no aparelho até salvar/enviar; fotos são guardadas em IndexedDB antes do envio. Upload usa UUID, hash e confirmação de presença no Storage. A conclusão valida respostas, descrições de problemas, fotos obrigatórias e ausência de uploads pendentes dentro de transação com bloqueio da tarefa. A interface bloqueia cliques repetidos. Eventos, respostas e arquivos são auditados.

Tarefas já vinculadas a contratos da plataforma de faxinas continuam delegadas à plataforma existente. Não foram duplicadas ou reclassificadas como conferências nativas. Na inspeção DEV havia zero tarefas abertas desse tipo; os testes desta entrega cobrem as conferências nativas multicanal.

## Testes realizados

`npm test`: **735 testes passaram, zero falhas**. Inclui nove testes novos de banco/PMS. `npm run check`, `npm run typecheck` e a compilação TypeScript da nova Edge Function passaram. O build da prévia passou.

| Cenário obrigatório | Resultado e camada |
| --- | --- |
| Administrador atribui ao A | API real DEV; interface administrativa integrada ao dispatcher SQL em JSDOM |
| A encontra somente suas tarefas | Login Auth real e API DEV; navegador abriu link e uma única tarefa |
| B não acessa por ID/API | API real retornou 403; SQL negou acesso direto e execução do RPC a `authenticated` |
| Checklist, fotos, problema e conclusão | Chrome na prévia + Edge/Storage DEV reais; upload JPEG pela galeria, compressão no navegador, descrição e conclusão |
| Administrador consulta resultado | API real devolveu três fotos de preparação e problema; interface PMS testada com SQL real local |
| Separação das etapas | DEV manteve três fotos na preparação e uma na saída; teste SQL usa uma mesma hospedagem para as duas etapas |
| Troca de responsável | API DEV: A e link anterior retornaram 403; B retornou 200 |
| Interromper e retomar | Salvar pela interface, recarregar e reencontrar respostas, descrição e fotos |
| Falha de upload | Teste SQL mantém envio pendente e impede conclusão; repetição confirma mesmo upload sem duplicá-lo. Fila do navegador validada no envio real bem-sucedido. Não foi feita interrupção artificial da rede do navegador |
| Cliques repetidos e sincronização | Clique duplo na prévia móvel produziu uma conclusão; teste SQL de UUID repetido e testes multicanal de sincronização passaram |
| Tela pequena e celulares | Iframe real de 390 × 844 em Chrome desktop; navegação e conclusão verificadas. Nenhum Android/iPhone físico ou simulador iOS foi usado. Câmera nativa e galeria nativa desses aparelhos não foram validadas |

As fotos enviadas eram imagens sintéticas de teste. A conferência completa foi testada sem alterar hospedagens reais. A marca `is_test` arquivou automaticamente os primeiros fixtures vinculados a hospedagem, como previsto pelas regras existentes; os testes de API/navegador prosseguiram em tarefas avulsas DEV. A associação das duas etapas à mesma hospedagem foi validada no banco isolado. A geração operacional vigente, a regra de checkout concluído e a distinção entre bloqueios e hospedagens foram preservadas.

Evidências: [layout móvel](mobile.jpg), [conclusão móvel](completed.jpg), [saída completa dos testes](tests.txt).

## Migrações aplicadas somente no DEV

| Arquivo versionado | Versão registrada no DEV | Nome |
| --- | --- | --- |
| `20261015133302_team_inspections.sql` | `20261015133627` | `team_inspections` |
| `20261015134505_inspection_contact_lookup.sql` | `20261015134608` | `inspection_contact_lookup` |
| `20261015134649_inspection_summary_and_optional_items.sql` | `20261015134741` | `inspection_summary_and_optional_items` |
| `20261015140247_inspection_reassignment_pending_uploads.sql` | `20261015140341` | `inspection_reassignment_pending_uploads` |

A API de aplicação remota registrou o horário de execução, por isso difere do horário do arquivo gerado pela CLI. A segunda migração corrigiu a busca de contato sem dar acesso à tabela `auth.users` ao dispatcher. A terceira adicionou resumo de responsáveis/problemas e tratamento de itens opcionais. A quarta arquiva uploads interrompidos na troca do responsável.

Edge Function `team-inspections`: versão 2, ACTIVE, DEV `pxfqmnhqodqyaaqeyjgr`. `verify_jwt=false` é intencional para os links sem login; a função implementa autenticação própria e autorização no banco em todas as ações.

Advisors de segurança: nenhum novo alerta WARN/ERROR da implementação. As tabelas com RLS sem policies são intencionais, pois não possuem grants de acesso direto. Permanece um aviso preexistente de proteção contra senhas vazadas desativada no Auth: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Ambientes e encerramento dos testes

DEV: prévia READY, banco migrado, Edge ativa. Usuários de teste foram suspensos e bloqueados no Auth, sessões revogadas e tarefas avulsas de teste canceladas após a validação. Evidências e histórico foram preservados. Não restam tarefas QA pendentes desta entrega.

PROD `irxsaladqhbzhkoaclxy`: somente leitura na inspeção inicial. Nenhuma migração, função, hospedagem ou implantação de produção foi alterada. A publicação depende de aprovação explícita do proprietário. Os testes de câmera/galeria em aparelhos reais continuam como limitação declarada, não como testes aprovados.

## Atualização de 15/10 — mesma execução do PMS e comodidades aquáticas

A área por link passou a montar diretamente o executor `VilleOperations` usado no PMS, em modo restrito à tarefa. Não há uma segunda tela de checklist. Pós-limpeza apresenta um item por vez, câmera/galeria, avanço e revisão. Pós-hospedagem mantém a pergunta sobre avarias, foto e indicação do local. Login, link individual, cadastro inicial, salvamento, fila de fotos e revogação após concluir permanecem.

A migração `20261015150002_inspection_property_water_amenities.sql` resolve exclusivamente piscina, spa e hidro pelo cadastro `properties.features.amenities`. No DEV inspecionado: CH1 → Spa + Piscina; CH2/CH3 → Hidromassagem. Deduplica sinônimos como piscina privativa/aquecida e spa/aquecido. A opção “Não se aplica” não é exibida para esses equipamentos; os ausentes ficam fora da execução. Itens não aquáticos continuam configuráveis.

Os equipamentos são preservados no snapshot da tarefa. A atualização das tarefas ainda abertas mantém os índices das respostas e das fotos: um espaço antigo sem equipamento aplicável fica oculto e não obrigatório, sem apagar evidência; equipamentos adicionais são acrescentados ao final. Conferências fechadas não são alteradas. Os links vigentes não são reemitidos nem revogados por essa atualização. A tarefa de teste do proprietário foi mantida, incluindo três fotos já anexadas.

Validação automatizada desta atualização: **740 testes, zero falhas**. Inclui tela compartilhada por link/login sem menus administrativos; preparação por etapas; saída por avarias; itens ocultos sem foto indevida; seleção spa/piscina/hidro/nenhum; ausência de N/A aquático; e snapshots preservados quando o cadastro de comodidades muda.
