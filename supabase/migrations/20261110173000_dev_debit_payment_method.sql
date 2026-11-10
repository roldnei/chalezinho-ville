alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('pix', 'card', 'mock') or
    (method = 'debit' and provider is not distinct from 'pagbank_sandbox' and installments is not distinct from 1));
