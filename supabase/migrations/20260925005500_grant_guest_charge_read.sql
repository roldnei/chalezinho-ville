-- RLS continues to restrict each guest to their own charges. This grant only
-- exposes SELECT through that policy; all direct mutations remain blocked.
grant select on table public.post_booking_charges to authenticated;
revoke insert,update,delete,truncate,references,trigger on table public.post_booking_charges from authenticated,anon;
