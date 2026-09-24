# Refinamento UX Fase 1 — 2026-09-24

Implementado na branch desenvolvimento:

- ordem do funil: tarifa → experiências → login → dados → resumo/pagamento;
- valor mostrado como pacote total + média por noite;
- taxa de limpeza permanece no cálculo interno, mas não é destacada ao hóspede;
- experiência com galeria/carrossel, chamada de venda e upsell por diferença entre variantes;
- tela interna `experiencias-admin.html` para cadastrar/editar experiência, variantes, elegibilidade e fotos;
- Storage `experience-media` com upload restrito a admin;
- uma única solicitação de alteração ativa por reserva;
- hóspede pode cancelar a solicitação anterior antes de abrir outra;
- valor adicional fica explicitamente “em análise” até decisão e depois aparece como valor a pagar ou sem cobrança adicional;
- modal de alteração reorganizado para mobile;
- garantia explicada antes do pagamento e na área do hóspede;
- a garantia é descrita corretamente como pré-autorização: não é compra/cobrança, mas o emissor pode reduzir temporariamente o limite disponível;
- callback próprio de confirmação/recuperação de conta, sem `localhost` ou `null` no código.

Pendência externa: URL Configuration do Supabase Auth precisa permitir o callback do Preview.
