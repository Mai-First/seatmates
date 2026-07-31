-- Round 3: password auth support, study-session edit/cancel notifications,
-- term-scoped search, unarchive, push delivery, report routing.

-- ---------------------------------------------------------------------------
-- App settings + term-scoped catalog search (fixes term mixing)
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
create policy "settings readable" on public.app_settings
  for select to authenticated using (true);
grant select on public.app_settings to authenticated;
-- Update at term rollover:  update app_settings set value='20271' where key='current_term';
insert into public.app_settings (key, value) values ('current_term', '20263')
on conflict (key) do nothing;

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
  where s.term = coalesce((select value from app_settings where key = 'current_term'), s.term)
    and (c.code ilike '%' || p_q || '%'
      or c.title ilike '%' || p_q || '%'
      or s.call_number = trim(p_q))
  order by c.code, s.section
  limit 40;
$$;

-- ---------------------------------------------------------------------------
-- Password flow: pre-auth "does this email exist" check.
-- Yes, this is an enumeration oracle -- acceptable for a campus app whose
-- entire population is guessable from the directory anyway.
-- ---------------------------------------------------------------------------

create or replace function public.email_exists(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where lower(email) = lower(trim(p_email)));
$$;
grant execute on function public.email_exists(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Unarchive: bring one archived class (and its chat) back
-- ---------------------------------------------------------------------------

create or replace function public.unarchive_section_chat(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  sec uuid;
begin
  select section_id into sec from conversations where id = p_conversation;
  if sec is null then raise exception 'Not a class chat.'; end if;
  -- The enrollment trigger reactivates the membership.
  update enrollments set status = 'active'
  where profile_id = auth.uid() and section_id = sec and status = 'archived';
end $$;
grant execute on function public.unarchive_section_chat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification kinds for this round
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('friend_request', 'request_accepted', 'new_match',
                  'announcement', 'study_rsvp', 'study_update', 'report'));

-- ---------------------------------------------------------------------------
-- Study sessions: notify RSVP'd people on edit, and on cancel
-- ---------------------------------------------------------------------------

create or replace function public.on_study_session_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.title, old.description, old.location, old.starts_at, old.capacity)
     is distinct from
     (new.title, new.description, new.location, new.starts_at, new.capacity) then
    insert into notifications (user_id, kind, actor_id, entity_id, body)
    select r.profile_id, 'study_update', new.host_id, new.id,
           '"' || new.title || '" was updated — check the new details'
    from rsvps r
    where r.session_id = new.id and r.profile_id <> new.host_id;
  end if;
  return new;
end $$;

drop trigger if exists study_session_edit_notify on public.study_sessions;
create trigger study_session_edit_notify
  after update on public.study_sessions
  for each row execute function public.on_study_session_edit();

create or replace function public.on_study_session_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, actor_id, entity_id, body)
  select r.profile_id, 'study_update', old.host_id, null,
         '"' || old.title || '" was cancelled'
  from rsvps r
  where r.session_id = old.id and r.profile_id <> old.host_id;
  return old;
end $$;

drop trigger if exists study_session_cancel_notify on public.study_sessions;
create trigger study_session_cancel_notify
  before delete on public.study_sessions
  for each row execute function public.on_study_session_cancel();

-- ---------------------------------------------------------------------------
-- Reports route to the team: admin accounts get an inbox notification.
-- Mark your team:  update profiles set is_admin = true where email in (...);
-- ---------------------------------------------------------------------------

alter table public.profiles add column is_admin boolean not null default false;

create or replace function public.on_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reporter text;
  reported text;
begin
  select full_name into reporter from profiles where id = new.reporter_id;
  select full_name into reported from profiles where id = new.reported_id;
  -- actor_id is the REPORTED user so tapping the notification opens the
  -- profile under review, not the reporter's.
  insert into notifications (user_id, kind, actor_id, entity_id, body)
  select p.id, 'report', new.reported_id, new.id,
         coalesce(reporter, 'Someone') || ' reported ' || coalesce(reported, 'a user')
         || coalesce(': ' || nullif(new.reason, ''), '')
  from profiles p where p.is_admin;
  return new;
end $$;

drop trigger if exists report_notify_admins on public.reports;
create trigger report_notify_admins
  after insert on public.reports
  for each row execute function public.on_report();

-- ---------------------------------------------------------------------------
-- Push delivery: store Expo push tokens; fan every notification out to
-- Expo's push API via pg_net. Fire-and-forget -- a push failure must never
-- block the notification insert.
-- ---------------------------------------------------------------------------

alter table public.profiles add column push_token text;

create extension if not exists pg_net;

create or replace function public.on_notification_push()
returns trigger language plpgsql security definer set search_path = public, net as $$
declare
  tok text;
begin
  select push_token into tok from profiles where id = new.user_id;
  if tok is not null then
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', tok, 'title', 'seatmates', 'body', new.body,
          'data', jsonb_build_object('kind', new.kind, 'entity_id', new.entity_id)),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    exception when others then
      null; -- never let push problems break the app
    end;
  end if;
  return new;
end $$;

drop trigger if exists notification_push on public.notifications;
create trigger notification_push
  after insert on public.notifications
  for each row execute function public.on_notification_push();
