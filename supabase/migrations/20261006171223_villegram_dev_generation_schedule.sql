-- DEV only, bounded generation checks its own configured frequency and unique source keys.
select cron.schedule('villegram-dev-content-generation','17 * * * *', $job$
 select net.http_get(url:='https://pxfqmnhqodqyaaqeyjgr.supabase.co/functions/v1/villegram-content?operation=generate_due',timeout_milliseconds:=30000);
$job$);
