-- Protege no banco a semântica exibida ao hóspede.
-- Cancelamento/no-show só podem ocorrer depois de uma confirmação real;
-- tentativas não confirmadas precisam registrar o motivo de encerramento.

alter table public.reservations
  drop constraint if exists reservations_lifecycle_consistency_check;

alter table public.reservations
  add constraint reservations_lifecycle_consistency_check
  check (
    (status not in ('cancelled','no_show') or confirmed_at is not null)
    and
    (status <> 'not_confirmed' or (confirmed_at is null and not_confirmed_reason is not null))
  );
