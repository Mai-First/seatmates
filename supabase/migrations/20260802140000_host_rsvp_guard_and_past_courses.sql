-- Two requests from the same review round:
--   1. A session host can't un-RSVP from their own session (they're always
--      going -- that's what makes them the host).
--   2. Archived classes should be visible somewhere -- "past classes" in the
--      My Classes screen, not just vanished.

-- ---------------------------------------------------------------------------
-- 1. Host un-RSVP guard. Enforced at the DB layer (not just hidden client-
--    side) so it holds regardless of which client is calling.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_host_unrsvp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.profile_id = (select host_id from study_sessions where id = old.session_id) then
    raise exception 'The host is always going to their own session.';
  end if;
  return old;
end $$;

drop trigger if exists rsvp_host_guard on public.rsvps;
create trigger rsvp_host_guard
  before delete on public.rsvps
  for each row execute function public.prevent_host_unrsvp();

-- ---------------------------------------------------------------------------
-- 2. Past classes: archived enrollments, same shape as get_my_courses() so
--    CourseManager can render both with one row component.
-- ---------------------------------------------------------------------------

create or replace function public.get_past_courses()
returns table (
  section_id uuid, course_id uuid, code text, title text, section text, instructor text
) language sql stable security definer set search_path = public as $$
  select s.id, c.id, c.code, initcap(lower(c.title)), s.section, s.instructor
  from enrollments e
  join sections s on s.id = e.section_id
  join courses c on c.id = s.course_id
  where e.profile_id = auth.uid() and e.status = 'archived'
  order by c.code;
$$;

grant execute on function public.get_past_courses() to authenticated;
