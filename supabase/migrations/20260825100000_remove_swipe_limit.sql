-- Removes the daily swipe limit entirely, per direct request — swiping is
-- unlimited again.

create or replace function public.record_swipe(p_swipee uuid, p_direction text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  conv uuid;
begin
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

drop function if exists public.get_swipe_limit_status();
drop function if exists public.reset_my_swipe_limit();
drop function if exists public._swipe_window_start(uuid);
alter table public.profiles drop column if exists swipe_limit_reset_at;
