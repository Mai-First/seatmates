-- Two study-session additions:
--   1. get_study_rsvps(): who's going, for a "see who's coming" list.
--   2. send_study_announcement(): host-authored note to everyone RSVP'd
--      'going' — a notification + push, deliberately not a chat message
--      (it doesn't belong in the class group chat, and DMs don't apply).

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('friend_request', 'request_accepted', 'new_match', 'announcement',
                  'study_rsvp', 'study_update', 'report', 'study_new', 'study_announcement'));

create or replace function public.get_study_rsvps(p_session_id uuid)
returns table (profile_id uuid, full_name text, photo_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.photo_url
  from rsvps r
  join profiles p on p.id = r.profile_id
  join study_sessions s on s.id = r.session_id
  where r.session_id = p_session_id
    and r.status = 'going'
    and public.enrolled_in_course(s.course_id)
  order by p.full_name;
$$;
grant execute on function public.get_study_rsvps(uuid) to authenticated;

create or replace function public.send_study_announcement(p_session_id uuid, p_body text)
returns void language plpgsql security definer set search_path = public, net as $$
declare
  sess study_sessions%rowtype;
  host_name text;
  recipient record;
begin
  select * into sess from study_sessions where id = p_session_id;
  if sess.id is null then raise exception 'Session not found.'; end if;
  if sess.host_id <> auth.uid() then raise exception 'Only the host can announce.'; end if;
  if length(trim(p_body)) = 0 then raise exception 'Announcement cannot be empty.'; end if;

  select full_name into host_name from profiles where id = auth.uid();

  insert into notifications (user_id, kind, actor_id, entity_id, body)
  select r.profile_id, 'study_announcement', auth.uid(), sess.id,
         '"' || sess.title || '": ' || trim(p_body)
  from rsvps r
  where r.session_id = sess.id
    and r.profile_id <> auth.uid()
    and public.notif_enabled(r.profile_id, 'study_new');

  for recipient in
    select p.push_token
    from rsvps r
    join profiles p on p.id = r.profile_id
    where r.session_id = sess.id
      and r.profile_id <> auth.uid()
      and p.push_token is not null
      and public.notif_enabled(r.profile_id, 'study_new')
  loop
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', recipient.push_token,
          'title', coalesce(host_name, 'study session') || ' · ' || sess.title,
          'body', trim(p_body),
          'data', jsonb_build_object('kind', 'study_announcement', 'entity_id', sess.id)),
        headers := '{"Content-Type": "application/json"}'::jsonb);
    exception when others then
      null;
    end;
  end loop;
end $$;
grant execute on function public.send_study_announcement(uuid, text) to authenticated;
