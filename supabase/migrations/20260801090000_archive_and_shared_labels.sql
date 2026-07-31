-- Semester archiving + richer shared-class labels.
--
-- Archive is not delete (user decision): archived chats stay readable in an
-- Archived list, you just can't post, and archived classes leave the swipe
-- pool and study feed. The team nudges everyone via app_announce() at term end.

-- ---------------------------------------------------------------------------
-- 'archived' becomes a legal status for enrollments and chat memberships
-- ---------------------------------------------------------------------------

alter table public.enrollments drop constraint enrollments_status_check;
alter table public.enrollments add constraint enrollments_status_check
  check (status in ('active', 'dropped', 'archived'));

alter table public.conversation_members drop constraint conversation_members_status_check;
alter table public.conversation_members add constraint conversation_members_status_check
  check (status in ('active', 'left', 'archived'));

-- rsvp notifications to hosts (see bottom) need a new kind
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('friend_request', 'request_accepted', 'new_match',
                  'announcement', 'study_rsvp'));

-- ---------------------------------------------------------------------------
-- Membership follows enrollment: dropped -> left, archived -> archived
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

    -- Re-activate a 'drop' or 'archived' exit; respect a deliberate 'leave'.
    insert into conversation_members (conversation_id, profile_id)
    values (conv, new.profile_id)
    on conflict (conversation_id, profile_id) do update
      set status = 'active', left_via = null
      where conversation_members.left_via = 'drop'
         or conversation_members.status = 'archived';
  elsif new.status = 'dropped' then
    update conversation_members m set status = 'left', left_via = 'drop'
    from conversations c
    where c.id = m.conversation_id and c.section_id = new.section_id
      and m.profile_id = new.profile_id and m.status = 'active';
  else -- archived
    update conversation_members m set status = 'archived', left_via = null
    from conversations c
    where c.id = m.conversation_id and c.section_id = new.section_id
      and m.profile_id = new.profile_id and m.status = 'active';
  end if;
  return new;
end $$;

-- One tap at semester end: everything active -> archived. DMs are untouched.
create or replace function public.archive_semester()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update enrollments set status = 'archived'
  where profile_id = auth.uid() and status = 'active';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Read access includes archived chats; posting stays active-only
-- ---------------------------------------------------------------------------

create or replace function public.is_conversation_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = c and profile_id = auth.uid()
      and status in ('active', 'archived')
  );
$$;

create or replace function public.can_post(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = c and profile_id = auth.uid() and status = 'active'
  ) and not exists (
    select 1
    from conversations cv
    join conversation_members other
      on other.conversation_id = cv.id and other.profile_id <> auth.uid()
    where cv.id = c and cv.kind = 'dm'
      and public.is_blocked_pair(auth.uid(), other.profile_id)
  );
$$;

drop function if exists public.get_conversation_info(uuid);
create function public.get_conversation_info(p_id uuid)
returns table (id uuid, kind text, title text, subtitle text, member boolean, can_post boolean)
language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then c.code || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end,
         case when cv.kind = 'section' then initcap(lower(c.title)) else op.major end,
         public.is_conversation_member(cv.id),
         public.can_post(cv.id)
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

create or replace function public.get_archived_conversations()
returns table (id uuid, title text, subtitle text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cv.id, c.code || ' §' || s.section, initcap(lower(c.title)),
         coalesce((select max(created_at) from messages where conversation_id = cv.id),
                  cv.created_at)
  from conversation_members me
  join conversations cv on cv.id = me.conversation_id and cv.kind = 'section'
  join sections s on s.id = cv.section_id
  join courses c on c.id = s.course_id
  where me.profile_id = auth.uid() and me.status = 'archived'
  order by 4 desc;
$$;

-- ---------------------------------------------------------------------------
-- Swipe deck: every shared class, with the course NAME next to the code
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
    and not exists (select 1 from friend_requests fr
                    where fr.status = 'pending'
                      and (fr.from_id, fr.to_id) in ((auth.uid(), p.id), (p.id, auth.uid())))
    and not public.is_blocked_pair(auth.uid(), p.id)
  group by p.id
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- Tell hosts when someone RSVPs to their study session
-- ---------------------------------------------------------------------------

create or replace function public.on_rsvp()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s study_sessions%rowtype;
  who text;
begin
  select * into s from study_sessions where id = new.session_id;
  if s.host_id = new.profile_id then return new; end if; -- own RSVP
  select full_name into who from profiles where id = new.profile_id;
  insert into notifications (user_id, kind, actor_id, entity_id, body)
  values (s.host_id, 'study_rsvp', new.profile_id, s.id,
          coalesce(who, 'A classmate') || ' is going to "' || s.title || '"');
  return new;
end $$;

drop trigger if exists rsvp_notify_host on public.rsvps;
create trigger rsvp_notify_host after insert on public.rsvps
  for each row execute function public.on_rsvp();

-- New functions need the standing grants re-applied (default privileges cover
-- future objects created by this role, but be explicit for the replaced ones).
grant execute on function public.archive_semester(),
                          public.get_archived_conversations(),
                          public.get_swipe_deck(),
                          public.get_conversation_info(uuid) to authenticated;
