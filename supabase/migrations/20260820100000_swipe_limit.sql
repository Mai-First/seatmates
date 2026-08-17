-- Daily swipe limit: 10 swipes per person per day, resetting at midnight
-- America/New_York (the "day" a Columbia student actually lives in).
-- Admins (profiles.is_admin) get a manual reset so testing the flow doesn't
-- mean waiting for the clock — it doesn't touch swipe history, so people
-- already swiped stay excluded from the deck; it only lifts the count that
-- gates *new* swipes.

alter table public.profiles add column swipe_limit_reset_at timestamptz;

-- Start of the current counting window: normally midnight ET, but an admin's
-- manual reset (always in the future of the last midnight while same-day)
-- pushes it forward.
create or replace function public._swipe_window_start(p_profile uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select greatest(
    (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'),
    coalesce((select swipe_limit_reset_at from profiles where id = p_profile), '-infinity'::timestamptz)
  );
$$;
revoke execute on function public._swipe_window_start(uuid) from public, anon, authenticated;

create or replace function public.get_swipe_limit_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'remaining', greatest(0, 10 - (
      select count(*)::int from swipes sw
      where sw.swiper_id = auth.uid()
        and sw.created_at >= public._swipe_window_start(auth.uid())
    )),
    'limit', 10,
    'resets_at', public._swipe_window_start(auth.uid()) + interval '1 day',
    'is_admin', coalesce((select is_admin from profiles where id = auth.uid()), false)
  );
$$;
grant execute on function public.get_swipe_limit_status() to authenticated;

create or replace function public.record_swipe(p_swipee uuid, p_direction text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  conv uuid;
  today_count int;
begin
  select count(*) into today_count from swipes
  where swiper_id = auth.uid()
    and created_at >= public._swipe_window_start(auth.uid());

  if today_count >= 10 then
    raise exception 'You''ve hit today''s swipe limit (10). It resets at midnight ET.';
  end if;

  insert into swipes (swiper_id, swipee_id, direction)
  values (auth.uid(), p_swipee, p_direction)
  on conflict do nothing;

  select cv.id into conv
  from matches m
  join conversations cv
    on cv.match_key = m.user_a || ':' || m.user_b
  where m.user_a = least(auth.uid(), p_swipee)
    and m.user_b = greatest(auth.uid(), p_swipee);

  return jsonb_build_object('matched', conv is not null, 'conversation_id', conv);
end $$;

create or replace function public.reset_my_swipe_limit()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Admins only.';
  end if;
  update profiles set swipe_limit_reset_at = now() where id = auth.uid();
end $$;
grant execute on function public.reset_my_swipe_limit() to authenticated;
