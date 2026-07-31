-- Table-level grants. RLS policies gate *rows*, but PostgREST first checks
-- table *privileges* -- without these every direct table access is a 403
-- (init migration shipped policies only; RPCs worked because they run as
-- definer). Blanket grant + RLS is the standard Supabase posture: anon holds
-- privileges but every policy is `to authenticated`, so anon still sees
-- nothing; swipes/friend_requests remain function-only because they have no
-- insert policies.

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to authenticated, service_role;

-- Re-assert the deliberate exceptions after the blanket routine grant.
revoke execute on function public.app_announce(text) from public, anon, authenticated;
revoke execute on function public._make_friends(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._send_friend_request(uuid, uuid, text) from public, anon, authenticated;
