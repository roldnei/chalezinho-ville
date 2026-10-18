-- A Booking reservation may need separate screenshots for commission and dates.
alter table public.cost_source_links drop constraint cost_source_links_expense_id_key;
alter table public.cost_source_links add constraint cost_source_links_expense_document_key unique (expense_id, document_id);
create index cost_source_links_expense_idx on public.cost_source_links(expense_id);
