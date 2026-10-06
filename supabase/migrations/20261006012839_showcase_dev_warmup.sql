-- DEV ONLY: warm public offers independently of visitor traffic. No booking/payment writes.
-- Intentionally targets the isolated development project; no credentials are embedded.
do $migration$
begin
 if not exists (select 1 from cron.job where jobname = 'villegram-dev-showcase-warm') then
  perform cron.schedule('villegram-dev-showcase-warm', '*/2 * * * *', $job$
   select net.http_get(
    url := 'https://pxfqmnhqodqyaaqeyjgr.supabase.co/functions/v1/booking-engine?action=stay_showcase',
    headers := '{"Origin":"https://chalezinho-ville-cgjoae6p2-roldneicosta-4140.vercel.app","X-Chalezinho-Env":"development"}'::jsonb,
    timeout_milliseconds := 55000
   );
  $job$);
 end if;
end
$migration$;
