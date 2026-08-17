-- Friend-request notes, take three: fully optional now, offered as a popup
-- at send time rather than required or hidden behind a separate screen.
-- Idempotent against either starting point (the note column may or may not
-- already exist, with or without the old "required for group_chat" check,
-- depending on what's already been applied) since this has churned a few
-- times this session.

alter table public.friend_requests add column if not exists note text;
alter table public.friend_requests drop constraint if exists friend_requests_note_check;

drop function if exists public._send_friend_request(uuid, uuid, text);
drop function if exists public._send_friend_request(uuid, uuid, text, text);
drop function if exists public.send_friend_request(uuid, text);
drop function if exists public.send_friend_request(uuid, text, text);

create function public._send_friend_request(
  p_from uuid, p_to uuid, p_source text, p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  reverse_pending uuid;
  req uuid;
  sender text;
  clean_note text := nullif(trim(coalesce(p_note, '')), '');
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
  insert into friend_requests (from_id, to_id, source, note)
  values (p_from, p_to, p_source, clean_note)
  on conflict (from_id, to_id) do update
    set status = 'pending', source = excluded.source, note = excluded.note,
        created_at = now(), responded_at = null
    where friend_requests.status = 'declined'
  returning id into req;

  if req is not null and public.notif_enabled(p_to, 'friend_request') then
    select full_name into sender from profiles where id = p_from;
    insert into notifications (user_id, kind, actor_id, entity_id, body)
    values (p_to, 'friend_request', p_from, req,
            coalesce(sender, 'A classmate') || ' wants to connect'
            || coalesce(': "' || clean_note || '"', ''));
  end if;
end $$;

create function public.send_friend_request(
  p_to uuid, p_source text default 'group_chat', p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._send_friend_request(auth.uid(), p_to, p_source, p_note);
end $$;
grant execute on function public.send_friend_request(uuid, text, text) to authenticated;
revoke execute on function public._send_friend_request(uuid, uuid, text, text) from public, anon, authenticated;

drop function if exists public.get_pending_friend_requests();
create function public.get_pending_friend_requests()
returns table (
  id uuid, from_id uuid, full_name text, major text, photo_url text,
  created_at timestamptz, source text, note text
) language sql stable security definer set search_path = public as $$
  select fr.id, fr.from_id, p.full_name, p.major, p.photo_url, fr.created_at, fr.source, fr.note
  from friend_requests fr
  join profiles p on p.id = fr.from_id
  where fr.to_id = auth.uid() and fr.status = 'pending'
  order by fr.created_at desc;
$$;
grant execute on function public.get_pending_friend_requests() to authenticated;

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
    -- The note (if there was one) becomes the opening message so accepting
    -- drops both people into an actual conversation.
    if r.note is not null then
      insert into messages (conversation_id, sender_id, body)
      values (conv, r.from_id, r.note);
    end if;
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
