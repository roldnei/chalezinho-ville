-- Keep the actual recognition pipeline with each optional reviewed example.
-- No changes to access policies, saved receipts or existing examples.
alter table public.cost_receipt_reviews drop constraint cost_receipt_reviews_engine_check;
alter table public.cost_receipt_reviews add constraint cost_receipt_reviews_engine_check
 check(engine in ('tesseract-por-1+receipt-v2','paddle-v6-small+tesseract-por'));
