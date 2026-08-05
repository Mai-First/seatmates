-- Four review-round requests:
--   1. A pending friend request should not pull someone off the deck — request
--      and swipe are separate flows, and hiding on request made the deck feel
--      like it lost people at random.
--   2. "Rejoin chat" for a class group chat you deliberately left (previously
--      only the drop→re-add path could ever reactivate a membership).
--   3. Blocking someone hides their study sessions, blocks messaging (already
--      mostly enforced by can_post/is_blocked_pair), and the chat itself says
--      so instead of the generic archived banner.
--   4. A mandatory "favorite study spot" question after bio.

-- ---------------------------------------------------------------------------
-- 1. Deck: pending friend requests no longer exclude someone
-- ---------------------------------------------------------------------------

drop function if exists public.get_swipe_deck();
create function public.get_swipe_deck()
returns table (
  id uuid, full_name text, major text, hometown text, bio text,
  instagram text, linkedin text, photo_url text, email text,
  shared jsonb, shared_count bigint
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.hometown, p.bio,
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
    and not public.is_blocked_pair(auth.uid(), p.id)
  group by p.id
  limit 50;
$$;

grant execute on function public.get_swipe_deck() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rejoin a class chat you deliberately left (while still enrolled)
-- ---------------------------------------------------------------------------

create or replace function public.rejoin_section_chat(p_section_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update conversation_members m set status = 'active', left_via = null
  from conversations c
  where c.id = m.conversation_id and c.section_id = p_section_id and c.kind = 'section'
    and m.profile_id = auth.uid() and m.left_via = 'leave'
    and exists (
      select 1 from enrollments e
      where e.profile_id = auth.uid() and e.section_id = p_section_id and e.status = 'active'
    );
end $$;
grant execute on function public.rejoin_section_chat(uuid) to authenticated;

drop function if exists public.get_my_courses();
create function public.get_my_courses()
returns table (
  section_id uuid, course_id uuid, code text, title text, section text,
  instructor text, chat_left boolean
) language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.code, initcap(lower(c.title)), s.section, s.instructor,
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
grant execute on function public.get_my_courses() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Blocking: hide their study sessions, and say so in the DM thread
-- ---------------------------------------------------------------------------

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
    and not public.is_blocked_pair(auth.uid(), ss.host_id)
  order by ss.starts_at;
$$;
grant execute on function public.get_study_feed() to authenticated;

drop function if exists public.get_conversation_info(uuid);
create function public.get_conversation_info(p_id uuid)
returns table (
  id uuid, kind text, title text, subtitle text, member boolean, can_post boolean,
  blocked boolean
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then c.code || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end,
         case when cv.kind = 'section' then initcap(lower(c.title)) else op.major end,
         public.is_conversation_member(cv.id),
         public.can_post(cv.id),
         cv.kind = 'dm' and public.is_blocked_pair(auth.uid(), op.id)
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

-- ---------------------------------------------------------------------------
-- 4. Mandatory "favorite study spot" question, right after bio
-- ---------------------------------------------------------------------------

alter table public.profiles add column study_spot text;
