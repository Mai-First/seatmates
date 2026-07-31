-- Seatmates initial schema. See docs/PLAN.md §3 for the design discussion.
-- Migrations are append-only from here on (PLAN §7 rule 1).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  major       text,
  hometown    text,
  bio         text,
  instagram   text,
  linkedin    text,
  photo_url   text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  term        text not null,
  code        text not null,          -- "COMS W3157", the form students know
  subject     text not null,
  number      text not null,
  title       text not null,
  department  text,
  unique (term, code)
);

create table public.sections (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  term          text not null,
  section       text not null,        -- "001"
  call_number   text,                 -- SSOL registration id; unique per term
  instructor    text,
  points        text,
  enrolled      int,
  capacity      int,
  legacy_number text,                 -- URL-only number, differs from courses.number
  unique (course_id, section),
  unique (term, call_number)
  -- No meeting day/time/location: the Directory stopped publishing them (PLAN A1).
);

create table public.enrollments (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  section_id  uuid not null references public.sections (id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'dropped')),
  created_at  timestamptz not null default now(),
  primary key (profile_id, section_id)
);

create table public.swipes (
  swiper_id   uuid not null references public.profiles (id) on delete cascade,
  swipee_id   uuid not null references public.profiles (id) on delete cascade,
  direction   text not null check (direction in ('left', 'right')),
  created_at  timestamptz not null default now(),
  primary key (swiper_id, swipee_id),
  check (swiper_id <> swipee_id)
);

create table public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  from_id      uuid not null references public.profiles (id) on delete cascade,
  to_id        uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined')),
  source       text not null default 'group_chat'
               check (source in ('swipe', 'group_chat', 'profile')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_id, to_id),
  check (from_id <> to_id)
);

-- Pair stored ordered so the same friendship can never exist twice (PLAN §3).
create table public.matches (
  user_a      uuid not null references public.profiles (id) on delete cascade,
  user_b      uuid not null references public.profiles (id) on delete cascade,
  source      text not null default 'swipe',
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('section', 'dm')),
  section_id  uuid unique references public.sections (id) on delete cascade,
  match_key   text unique,            -- "least:greatest" of the pair, dm only
  created_at  timestamptz not null default now(),
  check ((kind = 'section') = (section_id is not null)),
  check ((kind = 'dm') = (match_key is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  status          text not null default 'active' check (status in ('active', 'left')),
  -- Distinguishes "left the chat on purpose" from "membership lapsed with a course
  -- drop": re-adding the course restores a 'drop' exit but never a 'leave' (PLAN §3).
  left_via        text check (left_via in ('leave', 'drop')),
  last_read_at    timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in
              ('friend_request', 'request_accepted', 'new_match', 'announcement')),
  actor_id    uuid references public.profiles (id) on delete cascade,
  entity_id   uuid,                   -- request id or conversation id, by kind
  body        text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Study sessions scope to the COURSE, chats and swipe to the SECTION (PLAN A2).
create table public.study_sessions (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  host_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  description text,
  location    text,
  starts_at   timestamptz not null,
  capacity    int,
  created_at  timestamptz not null default now()
);

create table public.rsvps (
  session_id  uuid not null references public.study_sessions (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'going' check (status in ('going', 'maybe')),
  created_at  timestamptz not null default now(),
  primary key (session_id, profile_id)
);

create table public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auth: columbia.edu gate + auto-created profile row
-- ---------------------------------------------------------------------------

create or replace function public.enforce_columbia_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or new.email !~* '@columbia\.edu$' then
    raise exception 'A columbia.edu email address is required.';
  end if;
  return new;
end $$;

create trigger columbia_email_gate
  before insert on auth.users
  for each row execute function public.enforce_columbia_email();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helpers used by RLS policies (definer functions avoid recursive policies)
-- ---------------------------------------------------------------------------

create or replace function public.is_conversation_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = c and profile_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
    where (blocker_id, blocked_id) in ((a, b), (b, a))
  );
$$;

create or replace function public.enrolled_in_course(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments e join sections s on s.id = e.section_id
    where e.profile_id = auth.uid() and e.status = 'active' and s.course_id = c
  );
$$;

-- A DM member can post unless the pair is blocked; section members can always post.
create or replace function public.can_post(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_conversation_member(c) and not exists (
    select 1
    from conversations cv
    join conversation_members other
      on other.conversation_id = cv.id and other.profile_id <> auth.uid()
    where cv.id = c and cv.kind = 'dm'
      and public.is_blocked_pair(auth.uid(), other.profile_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Core state machine: friendships and DMs.
-- _make_friends is the ONLY code path that creates a DM (PLAN §3).
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

  -- Any pending request between the pair is now moot.
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

  if req is not null then
    select full_name into sender from profiles where id = p_from;
    insert into notifications (user_id, kind, actor_id, entity_id, body)
    values (p_to, 'friend_request', p_from, req,
            coalesce(sender, 'A classmate') || ' wants to connect');
  end if;
end $$;

create or replace function public.send_friend_request(p_to uuid, p_source text default 'group_chat')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._send_friend_request(auth.uid(), p_to, p_source);
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

  if p_accept then
    conv := public._make_friends(r.from_id, r.to_id, r.source);
    select full_name into accepter from profiles where id = r.to_id;
    insert into notifications (user_id, kind, actor_id, entity_id, body)
    values (r.from_id, 'request_accepted', r.to_id, conv,
            coalesce(accepter, 'A classmate') || ' accepted your request — say hi!');
  else
    -- Silent: the sender is never told about a decline.
    update friend_requests set status = 'declined', responded_at = now()
    where id = r.id;
  end if;
  return conv;
end $$;

-- Mutual right-swipe: both people opted in, so the request auto-accepts (PLAN §3).
create or replace function public.on_swipe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'right' and exists (
    select 1 from swipes
    where swiper_id = new.swipee_id and swipee_id = new.swiper_id
      and direction = 'right'
  ) then
    perform public._make_friends(new.swiper_id, new.swipee_id, 'swipe');
  end if;
  return new;
end $$;

create trigger swipe_match after insert on public.swipes
  for each row execute function public.on_swipe();

-- ---------------------------------------------------------------------------
-- Enrollment → section chat auto-join (PLAN D3/D15/D18)
-- ---------------------------------------------------------------------------

create or replace function public.on_enrollment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conv uuid;
begin
  if new.status = 'active' then
    insert into conversations (kind, section_id) values ('section', new.section_id)
    on conflict (section_id) do nothing;
    select id into conv from conversations where section_id = new.section_id;

    -- Re-activate a 'drop' exit; respect a deliberate 'leave' (PLAN §3).
    insert into conversation_members (conversation_id, profile_id)
    values (conv, new.profile_id)
    on conflict (conversation_id, profile_id) do update
      set status = 'active', left_via = null
      where conversation_members.left_via = 'drop';
  else
    update conversation_members m set status = 'left', left_via = 'drop'
    from conversations c
    where c.id = m.conversation_id and c.section_id = new.section_id
      and m.profile_id = new.profile_id and m.status = 'active';
  end if;
  return new;
end $$;

create trigger enrollment_chat_sync
  after insert or update of status on public.enrollments
  for each row execute function public.on_enrollment_change();

create or replace function public.leave_conversation(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update conversation_members m set status = 'left', left_via = 'leave'
  from conversations c
  where c.id = m.conversation_id and m.conversation_id = p_conversation
    and m.profile_id = auth.uid() and c.kind = 'section';
end $$;

-- ---------------------------------------------------------------------------
-- Read-side RPCs
-- ---------------------------------------------------------------------------

-- The deck: classmates in my sections I haven't swiped, befriended, requested,
-- or blocked (either direction). One row per person with one shared section label.
create or replace function public.get_swipe_deck()
returns table (
  id uuid, full_name text, major text, hometown text, bio text,
  instagram text, linkedin text, photo_url text, email text,
  shared_code text, shared_count bigint
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.hometown, p.bio,
         p.instagram, p.linkedin, p.photo_url, p.email,
         min(c.code || ' §' || s.section) as shared_code,
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

create or replace function public.get_conversations()
returns table (
  id uuid, kind text, title text, subtitle text, photo_url text,
  other_id uuid, last_body text, last_at timestamptz, unread boolean
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
                   and x.created_at > me.last_read_at) as unread
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

create or replace function public.get_conversation_info(p_id uuid)
returns table (id uuid, kind text, title text, subtitle text, member boolean)
language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then c.code || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end,
         case when cv.kind = 'section' then initcap(lower(c.title)) else op.major end,
         public.is_conversation_member(cv.id)
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

create or replace function public.relationship_with(p_other uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_other = auth.uid() then 'self'
    when public.is_blocked_pair(auth.uid(), p_other) then 'blocked'
    when exists (select 1 from matches
                 where user_a = least(auth.uid(), p_other)
                   and user_b = greatest(auth.uid(), p_other)) then 'friends'
    when exists (select 1 from friend_requests
                 where from_id = auth.uid() and to_id = p_other
                   and status = 'pending') then 'out_pending'
    when exists (select 1 from friend_requests
                 where from_id = p_other and to_id = auth.uid()
                   and status = 'pending') then 'in_pending'
    else 'none'
  end;
$$;

create or replace function public.dm_with(p_other uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from conversations
  where match_key = least(auth.uid(), p_other) || ':' || greatest(auth.uid(), p_other);
$$;

create or replace function public.get_members(p_conversation uuid)
returns table (
  id uuid, full_name text, major text, photo_url text, relationship text
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.photo_url, public.relationship_with(p.id)
  from conversation_members m
  join profiles p on p.id = m.profile_id
  where m.conversation_id = p_conversation and m.status = 'active'
    and public.is_conversation_member(p_conversation)
  order by (p.id = auth.uid()) desc, p.full_name;
$$;

create or replace function public.shared_sections(p_other uuid)
returns table (code text, section text, title text)
language sql stable security definer set search_path = public as $$
  select c.code, s.section, initcap(lower(c.title))
  from enrollments me
  join enrollments them on them.section_id = me.section_id
                       and them.profile_id = p_other and them.status = 'active'
  join sections s on s.id = me.section_id
  join courses c on c.id = s.course_id
  where me.profile_id = auth.uid() and me.status = 'active';
$$;

create or replace function public.search_catalog(p_q text)
returns table (
  section_id uuid, course_id uuid, code text, title text, section text,
  instructor text, call_number text, enrolled int, capacity int, enrolled_here boolean
) language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.code, initcap(lower(c.title)), s.section,
         s.instructor, s.call_number, s.enrolled, s.capacity,
         exists (select 1 from enrollments e
                 where e.profile_id = auth.uid() and e.section_id = s.id
                   and e.status = 'active')
  from sections s
  join courses c on c.id = s.course_id
  where c.code ilike '%' || p_q || '%'
     or c.title ilike '%' || p_q || '%'
     or s.call_number = trim(p_q)
  order by c.code, s.section
  limit 40;
$$;

create or replace function public.get_my_courses()
returns table (
  section_id uuid, course_id uuid, code text, title text, section text, instructor text
) language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.code, initcap(lower(c.title)), s.section, s.instructor
  from enrollments e
  join sections s on s.id = e.section_id
  join courses c on c.id = s.course_id
  where e.profile_id = auth.uid() and e.status = 'active'
  order by c.code;
$$;

create or replace function public.get_study_feed()
returns table (
  id uuid, title text, description text, location text, starts_at timestamptz,
  capacity int, course_code text, course_title text, host_id uuid, host_name text,
  going_count bigint, my_status text
) language sql stable security definer set search_path = public as $$
  select ss.id, ss.title, ss.description, ss.location, ss.starts_at, ss.capacity,
         c.code, initcap(lower(c.title)), ss.host_id, p.full_name,
         (select count(*) from rsvps r
          where r.session_id = ss.id and r.status = 'going'),
         (select r.status from rsvps r
          where r.session_id = ss.id and r.profile_id = auth.uid())
  from study_sessions ss
  join courses c on c.id = ss.course_id
  join profiles p on p.id = ss.host_id
  where public.enrolled_in_course(ss.course_id)
  order by ss.starts_at;
$$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language sql security definer set search_path = public as $$
  update conversation_members set last_read_at = now()
  where conversation_id = p_conversation and profile_id = auth.uid();
$$;

create or replace function public.get_inbox()
returns table (
  id uuid, kind text, body text, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_name text, actor_photo text, entity_id uuid, request_status text
) language sql stable security definer set search_path = public as $$
  select n.id, n.kind, n.body, n.created_at, n.read_at,
         n.actor_id, a.full_name, a.photo_url, n.entity_id, fr.status
  from notifications n
  left join profiles a on a.id = n.actor_id
  left join friend_requests fr
    on n.kind = 'friend_request' and fr.id = n.entity_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit 100;
$$;

create or replace function public.unread_notification_count()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from notifications
  where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

-- Team-only announcement fanout. Run from the SQL editor / psql as postgres:
--   select app_announce('Welcome to Seatmates! Tell us what breaks.');
create or replace function public.app_announce(p_body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, body)
  select id, 'announcement', p_body from profiles;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.courses              enable row level security;
alter table public.sections             enable row level security;
alter table public.enrollments          enable row level security;
alter table public.swipes               enable row level security;
alter table public.friend_requests      enable row level security;
alter table public.matches              enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.notifications        enable row level security;
alter table public.study_sessions       enable row level security;
alter table public.rsvps                enable row level security;
alter table public.blocks               enable row level security;
alter table public.reports              enable row level security;

create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "own profile update" on public.profiles
  for update to authenticated using (id = auth.uid());

create policy "catalog readable" on public.courses
  for select to authenticated using (true);
create policy "sections readable" on public.sections
  for select to authenticated using (true);

create policy "own enrollments" on public.enrollments
  for select to authenticated using (profile_id = auth.uid());
create policy "enroll self" on public.enrollments
  for insert to authenticated with check (profile_id = auth.uid());
create policy "update own enrollment" on public.enrollments
  for update to authenticated using (profile_id = auth.uid());

create policy "own swipes" on public.swipes
  for select to authenticated using (swiper_id = auth.uid());
-- swipes are written via record_swipe(); no direct insert policy on purpose

create policy "requests involving me" on public.friend_requests
  for select to authenticated using (auth.uid() in (from_id, to_id));

create policy "my matches" on public.matches
  for select to authenticated using (auth.uid() in (user_a, user_b));

create policy "my conversations" on public.conversations
  for select to authenticated using (public.is_conversation_member(id));
create policy "co-member rows visible" on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));

create policy "read messages in my conversations" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "post to my conversations" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_post(conversation_id));

create policy "my notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "mark my notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid());

create policy "sessions for my courses" on public.study_sessions
  for select to authenticated using (public.enrolled_in_course(course_id));
create policy "host a session" on public.study_sessions
  for insert to authenticated
  with check (host_id = auth.uid() and public.enrolled_in_course(course_id));
create policy "host edits own session" on public.study_sessions
  for update to authenticated using (host_id = auth.uid());
create policy "host deletes own session" on public.study_sessions
  for delete to authenticated using (host_id = auth.uid());

create policy "rsvps visible with session" on public.rsvps
  for select to authenticated using (
    exists (select 1 from study_sessions s
            where s.id = session_id and public.enrolled_in_course(s.course_id)));
create policy "rsvp self" on public.rsvps
  for insert to authenticated with check (
    profile_id = auth.uid() and
    exists (select 1 from study_sessions s
            where s.id = session_id and public.enrolled_in_course(s.course_id)));
create policy "change own rsvp" on public.rsvps
  for update to authenticated using (profile_id = auth.uid());
create policy "remove own rsvp" on public.rsvps
  for delete to authenticated using (profile_id = auth.uid());

create policy "my blocks" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy "block someone" on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy "unblock" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

create policy "file a report" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- Announcements are team-only.
revoke execute on function public.app_announce(text) from public, anon, authenticated;
-- Internal state-machine functions are not client-callable.
revoke execute on function public._make_friends(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._send_friend_request(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime + storage
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar images are public" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name like auth.uid() || '/%');
create policy "replace own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name like auth.uid() || '/%');
