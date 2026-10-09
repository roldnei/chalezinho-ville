# Matriz consolidada de homologação DEV — 08/10/2026

Estado: em execução; NÃO homologado globalmente. Esta matriz substitui os estados históricos do relatório cronológico.

| Jornada | Resultado global | Observado | Falta ou limite concreto |
|---|---|---|---|
| 1. Ville Moments visitante | Bloqueada | Feed 13 trips, pausa/legenda/comentários, som inicial desligado, login exigido, ofertas e datas, indisponível | Cópia informou sucesso mas clipboard/colagem retornou link anterior no navegador integrado; gestos em Android físico não comprovados; feed global vazio não provocado |
| 2. Site convencional | Aprovada nos cenários executados | Home, vitrine, chalés, datas/motivo/hóspedes, sem disponibilidade, mínimo de noites, troca e retorno; telas 360/412/1440 | Não cobre toda combinação possível nem teclado virtual físico |
| 3. Composição A–F | Aprovada nos cenários executados | A–F com compra confirmada; B CF46B14D24 e C 3E3960C445 concluídos em 08/10, banco e portal Pago; troca de pacote recalculou desconto e adicional | Não cobre todas as permutações possíveis; ver limitações das outras jornadas |
| 4. Login/finalização | Bloqueada | Senha errada/correta, retorno, resumo corrigido, aceite único, promoções opcionais, documentos/versionamento | Cadastro real + confirmação + recuperação aguardam senha/envio do usuário; download sem evento confirmado |
| 5. Pagamento/pós-reserva | Reprovada / parcial | PIX pago/expirado, cartão 1x/6x/12x com juros, recusa, duplo clique, reload, disputa, adicionais, alteração paga, caução 180/500 e troca de cartão | Estornos cartão 40008; liberação saldo da captura parcial não confirmada; cartão em análise não obtido; teste final de estorno hospedagem reincluído e ainda não realizado nesta continuidade |
| 6. Hóspede/comunidade | Bloqueada para aprovação integral | Avatar, perfil privado/público, seguir/notificar, marcações, convite, fotos horizontal/vertical, vídeo compatível/incompatível, texto/estilos, reordenação, rascunho/reload | Pinça/arraste/teclado Android físico; falha real de rede no upload sem mecanismo suportado de injeção |
| 7. Aprovação | Bloqueada para aprovação integral | Fila, sino, aprovar/devolver, hóspede notificado, bloqueio de visitante/hóspede, versão desatualizada, logout, paginação 51 | Disputa usou duas sessões da mesma conta administrativa; queda real do serviço de contagem não provocada |
| 8. Operação/conteúdo | Aprovada nos cenários executados | Cadastro/edição de catálogo sintético pausado, motor sem duplicações, prévia, publicação manual/arquivamento, relatório atribuição, anfitrião isolado CH1 | Não equivale a homologação de todas as rotinas operacionais fora do escopo descrito |

396 testes automatizados passaram na última suíte completa (a7e120). As duas mudanças posteriores são mensagens de apresentação; sintaxe validada. Typecheck de booking-engine, guarantee-preview, pagbank-webhook e Ville Moments-content passou em 08/10. Não houve alteração de banco/funções nesta continuidade.

Evidências e IDs: docs/homologation-20261007.md e outputs/qa-*.png/json no workspace. Estornos não são repetidos com novas chaves. Produção não publicada nem alterada.
