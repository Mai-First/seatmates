-- Lowercase class names everywhere we control them (codes stay as-is —
-- they're an external identifier format, not our copy). Class group chat
-- titles switch from code+section to name+section, with the code moved to
-- the subtitle. Plus: profile prompts, mark-as-unread, and swapping the
-- (short-lived) per-chat color customization for an icon customization.

-- ---------------------------------------------------------------------------
-- 1. Lowercase course titles wherever they're read
-- ---------------------------------------------------------------------------

create or replace function public.search_catalog(p_q text)
returns table (
  section_id uuid, course_id uuid, code text, title text, section text,
  instructor text, call_number text, enrolled int, capacity int, enrolled_here boolean
) language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.code, lower(c.title), s.section,
         s.instructor, s.call_number, s.enrolled, s.capacity,
         exists (select 1 from enrollments e
                 where e.profile_id = auth.uid() and e.section_id = s.id
                   and e.status = 'active')
  from sections s
  join courses c on c.id = s.course_id
  where s.term = coalesce((select value from app_settings where key = 'current_term'), s.term)
    and (c.code ilike '%' || p_q || '%'
      or c.title ilike '%' || p_q || '%'
      or s.call_number = trim(p_q))
  order by c.code, s.section
  limit 40;
$$;

create or replace function public.get_study_feed()
returns table (
  id uuid, title text, description text, location text, starts_at timestamptz,
  capacity int, course_code text, course_title text, host_id uuid, host_name text,
  going_count bigint, my_status text
) language sql stable security definer set search_path = public as $$
  select ss.id, ss.title, ss.description, ss.location, ss.starts_at, ss.capacity,
         c.code, lower(c.title), ss.host_id, p.full_name,
         (select count(*) from rsvps r
          where r.session_id = ss.id and r.status = 'going'),
         (select r.status from rsvps r
          where r.session_id = ss.id and r.profile_id = auth.uid())
  from study_sessions ss
  join courses c on c.id = ss.course_id
  join profiles p on p.id = ss.host_id
  where public.enrolled_in_course(ss.course_id)
    and not public.is_blocked_pair(auth.uid(), ss.host_id)
  order by ss.starts_at;
$$;

create or replace function public.shared_sections(p_other uuid)
returns table (code text, section text, title text)
language sql stable security definer set search_path = public as $$
  select c.code, s.section, lower(c.title)
  from enrollments me
  join enrollments them on them.section_id = me.section_id
                       and them.profile_id = p_other and them.status = 'active'
  join sections s on s.id = me.section_id
  join courses c on c.id = s.course_id
  where me.profile_id = auth.uid() and me.status = 'active';
$$;

create or replace function public.get_my_courses()
returns table (
  section_id uuid, course_id uuid, code text, title text, section text,
  instructor text, chat_left boolean
) language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.code, lower(c.title), s.section, s.instructor,
         exists (
           select 1 from conversation_members m
           join conversations cv on cv.id = m.conversation_id
           where cv.section_id = s.id and m.profile_id = auth.uid() and m.left_via = 'leave'
         )
  from enrollments e
  join sections s on s.id = e.section_id
  join courses c on c.id = s.course_id
  where e.profile_id = auth.uid() and e.status = 'active'
  order by c.code;
$$;

create or replace function public.get_past_courses()
returns table (
  section_id uuid, course_id uuid, code text, title text, section text, instructor text
) language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.code, lower(c.title), s.section, s.instructor
  from enrollments e
  join sections s on s.id = e.section_id
  join courses c on c.id = s.course_id
  where e.profile_id = auth.uid() and e.status = 'archived'
  order by c.code;
$$;

create or replace function public.get_swipe_deck()
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
           'code', c.code, 'section', s.section, 'title', lower(c.title))) as shared,
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

-- ---------------------------------------------------------------------------
-- 2. Mark a chat unread again (last_read_at back before its oldest message)
-- ---------------------------------------------------------------------------

create or replace function public.mark_conversation_unread(p_conversation uuid)
returns void language sql security definer set search_path = public as $$
  update conversation_members set last_read_at = 'epoch'::timestamptz
  where conversation_id = p_conversation and profile_id = auth.uid();
$$;
grant execute on function public.mark_conversation_unread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Profile prompts: unlimited, freely add/remove, picked from a fixed list
--    the client offers (Hinge-style) — the list itself lives client-side,
--    this table just stores whatever prompt text + answer someone picked.
-- ---------------------------------------------------------------------------

create table public.profile_prompts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  prompt      text not null,
  answer      text not null check (char_length(answer) between 1 and 300),
  created_at  timestamptz not null default now()
);
alter table public.profile_prompts enable row level security;

create policy "prompts readable by signed-in users" on public.profile_prompts
  for select to authenticated using (true);
create policy "add own prompt" on public.profile_prompts
  for insert to authenticated with check (profile_id = auth.uid());
create policy "edit own prompt" on public.profile_prompts
  for update to authenticated using (profile_id = auth.uid());
create policy "remove own prompt" on public.profile_prompts
  for delete to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Revert per-chat color customization; replace with an icon choice
--    instead. Icon defaults to null (automatic subject icon, chosen
--    client-side) unless a member picks one of a fixed set.
-- ---------------------------------------------------------------------------

drop function if exists public.set_conversation_color(uuid, text);
alter table public.conversation_members drop constraint conversation_members_icon_color_check;
alter table public.conversation_members drop column icon_color;

alter table public.conversation_members add column icon_name text
  check (icon_name is null or icon_name in (
    'school-outline', 'book-outline', 'library-outline', 'bulb-outline', 'rocket-outline',
    'planet-outline', 'flask-outline', 'calculator-outline', 'color-palette-outline',
    'musical-notes-outline', 'football-outline', 'basketball-outline', 'game-controller-outline',
    'cafe-outline', 'pizza-outline', 'heart-outline', 'star-outline', 'flame-outline',
    'trophy-outline', 'paw-outline', 'leaf-outline', 'globe-outline', 'camera-outline',
    'headset-outline'
  ));

create or replace function public.set_conversation_icon(p_conversation uuid, p_icon text)
returns void language sql security definer set search_path = public as $$
  update conversation_members set icon_name = p_icon
  where conversation_id = p_conversation and profile_id = auth.uid();
$$;
grant execute on function public.set_conversation_icon(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Class GC title becomes the class name, not the code (code moves to
--    subtitle); icon_color -> icon_name in both read paths
-- ---------------------------------------------------------------------------

drop function if exists public.get_conversation_info(uuid);
create function public.get_conversation_info(p_id uuid)
returns table (
  id uuid, kind text, title text, subtitle text, member boolean, can_post boolean,
  blocked boolean, muted boolean, pinned boolean, other_id uuid, icon_name text
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then lower(c.title) || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end,
         case when cv.kind = 'section' then c.code else op.major end,
         public.is_conversation_member(cv.id),
         public.can_post(cv.id),
         cv.kind = 'dm' and public.is_blocked_pair(auth.uid(), op.id),
         coalesce((select m.muted from conversation_members m
                   where m.conversation_id = cv.id and m.profile_id = auth.uid()), false),
         coalesce((select m.pinned from conversation_members m
                   where m.conversation_id = cv.id and m.profile_id = auth.uid()), false),
         op.id,
         (select m.icon_name from conversation_members m
          where m.conversation_id = cv.id and m.profile_id = auth.uid())
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
  other_id uuid, last_body text, last_at timestamptz, unread boolean,
  muted boolean, pinned boolean, icon_name text
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then lower(c.title) || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end as title,
         case when cv.kind = 'section' then c.code else op.major end as subtitle,
         case when cv.kind = 'dm' then op.photo_url end as photo_url,
         op.id as other_id,
         coalesce(lm.body, case when lm.attachment_type = 'image' then '📷 Photo'
                                 when lm.attachment_type = 'file' then '📎 File'
                                 when lm.id is not null then 'This message was deleted' end) as last_body,
         coalesce(lm.created_at, cv.created_at) as last_at,
         exists (select 1 from messages x
                 where x.conversation_id = cv.id
                   and x.sender_id <> auth.uid()
                   and x.created_at > me.last_read_at) as unread,
         me.muted,
         me.pinned,
         me.icon_name
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
    select id, body, attachment_type, created_at from messages
    where conversation_id = cv.id
    order by created_at desc limit 1
  ) lm on true
  where me.profile_id = auth.uid() and me.status = 'active';
$$;
grant execute on function public.get_conversations() to authenticated;

drop function if exists public.get_archived_conversations();
create function public.get_archived_conversations()
returns table (id uuid, title text, subtitle text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cv.id, lower(c.title) || ' §' || s.section, c.code,
         coalesce((select max(created_at) from messages where conversation_id = cv.id),
                  cv.created_at)
  from conversation_members me
  join conversations cv on cv.id = me.conversation_id and cv.kind = 'section'
  join sections s on s.id = cv.section_id
  join courses c on c.id = s.course_id
  where me.profile_id = auth.uid() and me.status = 'archived'
  order by 4 desc;
$$;

grant execute on function public.get_archived_conversations() to authenticated;
