-- Follow-up on the block/deck review:
--   1. A blocked pair could still end up matched: an already-pending friend
--      request survives a block untouched, and neither _make_friends() nor
--      respond_friend_request() checked is_blocked_pair before accepting it.
--      Close it at the _make_friends() chokepoint (the ONLY path that creates
--      a match/DM, per its own header comment) and treat a stale accept on a
--      blocked pair as a silent decline rather than quietly no-oping.
--   2. Deck asymmetry: if I requested them, I've already acted -- they should
--      leave my deck like anyone else I swiped on. If THEY requested me, they
--      should still appear, flagged, so accepting/declining can happen right
--      from the card (right = accept, left = decline) instead of only via
--      the inbox.
--   3. Defense in depth: nothing stopped a self-block at the DB layer.

-- ---------------------------------------------------------------------------
-- 1. Blocking beats an old pending request, for every path that can accept one
-- ---------------------------------------------------------------------------

create or replace function public._make_friends(a uuid, b uuid, src text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  lo uuid := least(a, b);
  hi uuid := greatest(a, b);
  conv uuid;
  created boolean;
  name_a text; name_b text;
begin
  if public.is_blocked_pair(a, b) then
    return null; -- a block always wins, however this got triggered
  end if;

  insert into matches (user_a, user_b, source) values (lo, hi, src)
  on conflict do nothing;
  created := found;

  insert into conversations (kind, match_key) values ('dm', lo || ':' || hi)
  on conflict (match_key) do nothing;
  select id into conv from conversations where match_key = lo || ':' || hi;

  insert into conversation_members (conversation_id, profile_id)
  values (conv, a), (conv, b)
  on conflict (conversation_id, profile_id)
    do update set status = 'active', left_via = null;

  update friend_requests set status = 'accepted', responded_at = now()
  where status = 'pending'
    and (from_id, to_id) in ((a, b), (b, a));

  if created then
    select full_name into name_a from profiles where id = a;
    select full_name into name_b from profiles where id = b;
    insert into notifications (user_id, kind, actor_id, entity_id, body) values
      (a, 'new_match', b, conv,
       'You and ' || coalesce(name_b, 'a classmate') || ' are now connected — say hi!'),
      (b, 'new_match', a, conv,
       'You and ' || coalesce(name_a, 'a classmate') || ' are now connected — say hi!');
  end if;

  return conv;
end $$;

create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r friend_requests%rowtype;
  conv uuid;
  accepter text;
begin
  select * into r from friend_requests where id = p_request and to_id = auth.uid();
  if r.id is null then raise exception 'Request not found.'; end if;
  if r.status <> 'pending' then return null; end if;

  if p_accept and not public.is_blocked_pair(r.from_id, r.to_id) then
    conv := public._make_friends(r.from_id, r.to_id, r.source);
    select full_name into accepter from profiles where id = r.to_id;
    insert into notifications (user_id, kind, actor_id, entity_id, body)
    values (r.from_id, 'request_accepted', r.to_id, conv,
            coalesce(accepter, 'A classmate') || ' accepted your request — say hi!');
  else
    -- Silent either way: a real decline is never announced to the sender,
    -- and a blocked pair's stale request should behave exactly like one.
    update friend_requests set status = 'declined', responded_at = now()
    where id = r.id;
  end if;
  return conv;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Deck: hide who I've requested, flag who's requested me
-- ---------------------------------------------------------------------------

drop function if exists public.get_swipe_deck();
create function public.get_swipe_deck()
returns table (
  id uuid, full_name text, major text, hometown text, bio text, study_spot text,
  school text, grad_year int,
  instagram text, linkedin text, photo_url text, email text,
  shared jsonb, shared_count bigint, request_id uuid
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.hometown, p.bio, p.study_spot,
         p.school, p.grad_year,
         p.instagram, p.linkedin, p.photo_url, p.email,
         jsonb_agg(distinct jsonb_build_object(
           'code', c.code, 'section', s.section,
           'title', initcap(lower(c.title)))) as shared,
         count(distinct s.id) as shared_count,
         (select fr.id from friend_requests fr
          where fr.from_id = p.id and fr.to_id = auth.uid() and fr.status = 'pending') as request_id
  from enrollments me
  join enrollments them on them.section_id = me.section_id
                       and them.profile_id <> me.profile_id
                       and them.status = 'active'
  join sections s on s.id = me.section_id
  join courses c on c.id = s.course_id
  join profiles p on p.id = them.profile_id
  where me.profile_id = auth.uid()
    and me.status = 'active'
    and p.full_name is not null
    and not exists (select 1 from swipes sw
                    where sw.swiper_id = auth.uid() and sw.swipee_id = p.id)
    and not exists (select 1 from matches m
                    where m.user_a = least(auth.uid(), p.id)
                      and m.user_b = greatest(auth.uid(), p.id))
    and not exists (select 1 from friend_requests fr
                    where fr.from_id = auth.uid() and fr.to_id = p.id and fr.status = 'pending')
    and not public.is_blocked_pair(auth.uid(), p.id)
  group by p.id
  limit 50;
$$;

grant execute on function public.get_swipe_deck() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Self-block: unreachable via the UI, but the DB shouldn't allow it either
-- ---------------------------------------------------------------------------

alter table public.blocks add constraint blocks_not_self check (blocker_id <> blocked_id);
