-- Notification system overhaul, replacing the swipe-card accept/decline
-- experiment (reverted below — a pending request goes back to hiding both
-- people from each other's deck, full stop; requests are handled from a
-- dedicated Instagram-requests-style list instead, reachable from Chats).
--
--   1. profiles.notification_prefs: per-category opt in/out, read by every
--      insert point below via notif_enabled() so a disabled category never
--      creates the notification row (and therefore never pushes) at all.
--   2. New 'study_new' notification: fan out to a course's other enrolled
--      students when someone posts a session.
--   3. Messages get their own lightweight, push-only path (on_message_push)
--      instead of a notifications row per message — the Chats list already
--      tracks unread via last_read_at, so a message doesn't need to also
--      clutter the Inbox activity feed. Gated by conversation_members.muted
--      and the 'message' preference.
--   4. get_pending_friend_requests(): backs the new dedicated requests list.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.conversation_members add column muted boolean not null default false;

alter table public.profiles add column notification_prefs jsonb not null default
  '{"friend_request":true,"request_accepted":true,"new_match":true,"study_new":true,"announcement":true,"message":true}'::jsonb;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('friend_request', 'request_accepted', 'new_match', 'announcement',
                  'study_rsvp', 'study_update', 'report', 'study_new'));

create or replace function public.notif_enabled(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (notification_prefs ->> p_kind)::boolean
                    from profiles where id = p_user), true);
$$;
grant execute on function public.notif_enabled(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Deck: revert to hiding EITHER direction of a pending request. Friend
-- requests are handled on their own dedicated screen now, not on the deck.
-- ---------------------------------------------------------------------------

drop function if exists public.get_swipe_deck();
create function public.get_swipe_deck()
returns table (
  id uuid, full_name text, major text, hometown text, bio text, study_spot text,
  school text, grad_year int,
  instagram text, linkedin text, photo_url text, email text,
  shared jsonb, shared_count bigint
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.hometown, p.bio, p.study_spot,
         p.school, p.grad_year,
         p.instagram, p.linkedin, p.photo_url, p.email,
         jsonb_agg(distinct jsonb_build_object(
           'code', c.code, 'section', s.section,
           'title', initcap(lower(c.title)))) as shared,
         count(distinct s.id) as shared_count
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
                    where fr.status = 'pending'
                      and (fr.from_id, fr.to_id) in ((auth.uid(), p.id), (p.id, auth.uid())))
    and not public.is_blocked_pair(auth.uid(), p.id)
  group by p.id
  limit 50;
$$;
grant execute on function public.get_swipe_deck() to authenticated;

-- ---------------------------------------------------------------------------
-- Dedicated "Friend requests" list (Chats tab entry point)
-- ---------------------------------------------------------------------------

create or replace function public.get_pending_friend_requests()
returns table (
  id uuid, from_id uuid, full_name text, major text, photo_url text,
  created_at timestamptz, source text
) language sql stable security definer set search_path = public as $$
  select fr.id, fr.from_id, p.full_name, p.major, p.photo_url, fr.created_at, fr.source
  from friend_requests fr
  join profiles p on p.id = fr.from_id
  where fr.to_id = auth.uid() and fr.status = 'pending'
  order by fr.created_at desc;
$$;
grant execute on function public.get_pending_friend_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- Gate every notification insert point on the sender's preference
-- ---------------------------------------------------------------------------

create or replace function public._send_friend_request(p_from uuid, p_to uuid, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare
  reverse_pending uuid;
  req uuid;
  sender text;
begin
  if p_from = p_to then raise exception 'Cannot friend yourself.'; end if;
  if public.is_blocked_pair(p_from, p_to) then raise exception 'Unavailable.'; end if;
  if exists (select 1 from matches
             where user_a = least(p_from, p_to) and user_b = greatest(p_from, p_to)) then
    return; -- already friends
  end if;

  -- If they already asked us, both sides want it: connect immediately.
  select id into reverse_pending from friend_requests
  where from_id = p_to and to_id = p_from and status = 'pending';
  if reverse_pending is not null then
    perform public._make_friends(p_from, p_to, p_source);
    return;
  end if;

  -- Re-request after a decline is allowed (silent declines, PLAN A6);
  -- a still-pending request is left untouched.
  insert into friend_requests (from_id, to_id, source)
  values (p_from, p_to, p_source)
  on conflict (from_id, to_id) do update
    set status = 'pending', source = excluded.source,
        created_at = now(), responded_at = null
    where friend_requests.status = 'declined'
  returning id into req;

  if req is not null and public.notif_enabled(p_to, 'friend_request') then
    select full_name into sender from profiles where id = p_from;
    insert into notifications (user_id, kind, actor_id, entity_id, body)
    values (p_to, 'friend_request', p_from, req,
            coalesce(sender, 'A classmate') || ' wants to connect');
  end if;
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
    if public.notif_enabled(r.from_id, 'request_accepted') then
      select full_name into accepter from profiles where id = r.to_id;
      insert into notifications (user_id, kind, actor_id, entity_id, body)
      values (r.from_id, 'request_accepted', r.to_id, conv,
              coalesce(accepter, 'A classmate') || ' accepted your request — say hi!');
    end if;
  else
    -- Silent either way: a real decline is never announced to the sender,
    -- and a blocked pair's stale request should behave exactly like one.
    update friend_requests set status = 'declined', responded_at = now()
    where id = r.id;
  end if;
  return conv;
end $$;

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
    if public.notif_enabled(a, 'new_match') then
      insert into notifications (user_id, kind, actor_id, entity_id, body) values
        (a, 'new_match', b, conv,
         'You and ' || coalesce(name_b, 'a classmate') || ' are now connected — say hi!');
    end if;
    if public.notif_enabled(b, 'new_match') then
      insert into notifications (user_id, kind, actor_id, entity_id, body) values
        (b, 'new_match', a, conv,
         'You and ' || coalesce(name_a, 'a classmate') || ' are now connected — say hi!');
    end if;
  end if;

  return conv;
end $$;

create or replace function public.app_announce(p_body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, body)
  select id, 'announcement', p_body from profiles
  where public.notif_enabled(id, 'announcement');
$$;

-- ---------------------------------------------------------------------------
-- New study session posted -> notify the rest of the course
-- ---------------------------------------------------------------------------

create or replace function public.on_study_session_new()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  host_name text;
begin
  select full_name into host_name from profiles where id = new.host_id;
  insert into notifications (user_id, kind, actor_id, entity_id, body)
  select distinct e.profile_id, 'study_new', new.host_id, new.id,
         coalesce(host_name, 'A classmate') || ' posted "' || new.title || '"'
  from enrollments e
  where e.section_id in (select id from sections where course_id = new.course_id)
    and e.status = 'active'
    and e.profile_id <> new.host_id
    and public.notif_enabled(e.profile_id, 'study_new');
  return new;
end $$;

drop trigger if exists study_session_new_notify on public.study_sessions;
create trigger study_session_new_notify
  after insert on public.study_sessions
  for each row execute function public.on_study_session_new();

-- ---------------------------------------------------------------------------
-- Messages: push-only (no Inbox row), muteable per conversation
-- ---------------------------------------------------------------------------

create or replace function public.set_conversation_muted(p_conversation uuid, p_muted boolean)
returns void language sql security definer set search_path = public as $$
  update conversation_members set muted = p_muted
  where conversation_id = p_conversation and profile_id = auth.uid();
$$;
grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;

create or replace function public.on_message_push()
returns trigger language plpgsql security definer set search_path = public, net as $$
declare
  sender_name text;
  push_title text;
  push_body text;
  recipient record;
begin
  select full_name into sender_name from profiles where id = new.sender_id;

  select
    case when cv.kind = 'section' then c.code || ' §' || s.section
         else coalesce(sender_name, 'New message') end,
    case when cv.kind = 'section' then coalesce(sender_name, 'Someone') || ': ' || left(new.body, 120)
         else left(new.body, 120) end
  into push_title, push_body
  from conversations cv
  left join sections s on s.id = cv.section_id
  left join courses c on c.id = s.course_id
  where cv.id = new.conversation_id;

  for recipient in
    select p.push_token
    from conversation_members m
    join profiles p on p.id = m.profile_id
    where m.conversation_id = new.conversation_id
      and m.profile_id <> new.sender_id
      and m.status = 'active'
      and m.muted = false
      and p.push_token is not null
      and public.notif_enabled(m.profile_id, 'message')
  loop
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', recipient.push_token, 'title', push_title, 'body', push_body,
          'data', jsonb_build_object('kind', 'message', 'entity_id', new.conversation_id)),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    exception when others then
      null; -- never let push problems break the app
    end;
  end loop;
  return new;
end $$;

drop trigger if exists message_push on public.messages;
create trigger message_push
  after insert on public.messages
  for each row execute function public.on_message_push();

-- ---------------------------------------------------------------------------
-- Surface mute state where conversations already get read
-- ---------------------------------------------------------------------------

drop function if exists public.get_conversation_info(uuid);
create function public.get_conversation_info(p_id uuid)
returns table (
  id uuid, kind text, title text, subtitle text, member boolean, can_post boolean,
  blocked boolean, muted boolean
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then c.code || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end,
         case when cv.kind = 'section' then initcap(lower(c.title)) else op.major end,
         public.is_conversation_member(cv.id),
         public.can_post(cv.id),
         cv.kind = 'dm' and public.is_blocked_pair(auth.uid(), op.id),
         coalesce((select m.muted from conversation_members m
                   where m.conversation_id = cv.id and m.profile_id = auth.uid()), false)
  from conversations cv
  left join sections s on s.id = cv.section_id
  left join courses c on c.id = s.course_id
  left join lateral (
    select p.* from conversation_members om
    join profiles p on p.id = om.profile_id
    where om.conversation_id = cv.id and om.profile_id <> auth.uid()
    limit 1
  ) op on cv.kind = 'dm'
  where cv.id = p_id;
$$;
grant execute on function public.get_conversation_info(uuid) to authenticated;

drop function if exists public.get_conversations();
create function public.get_conversations()
returns table (
  id uuid, kind text, title text, subtitle text, photo_url text,
  other_id uuid, last_body text, last_at timestamptz, unread boolean, muted boolean
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then c.code || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end as title,
         case when cv.kind = 'section' then initcap(lower(c.title))
              else op.major end as subtitle,
         case when cv.kind = 'dm' then op.photo_url end as photo_url,
         op.id as other_id,
         lm.body as last_body,
         coalesce(lm.created_at, cv.created_at) as last_at,
         exists (select 1 from messages x
                 where x.conversation_id = cv.id
                   and x.sender_id <> auth.uid()
                   and x.created_at > me.last_read_at) as unread,
         me.muted
  from conversation_members me
  join conversations cv on cv.id = me.conversation_id
  left join sections s on s.id = cv.section_id
  left join courses c on c.id = s.course_id
  left join lateral (
    select p.* from conversation_members om
    join profiles p on p.id = om.profile_id
    where om.conversation_id = cv.id and om.profile_id <> auth.uid()
    limit 1
  ) op on cv.kind = 'dm'
  left join lateral (
    select body, created_at from messages
    where conversation_id = cv.id
    order by created_at desc limit 1
  ) lm on true
  where me.profile_id = auth.uid() and me.status = 'active';
$$;
grant execute on function public.get_conversations() to authenticated;
