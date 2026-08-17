-- Requires a short note on group-chat-sourced friend requests: a bare
-- "add friend" tap in a member list is an easy way to spam-add a whole
-- roster with zero context, and a note doubles as the conversation opener.
-- Swipe-based connections are mutual by construction (both people already
-- said yes) and profile-sourced requests are one-at-a-time and deliberate,
-- so neither needs the same guardrail.

alter table public.friend_requests add column note text;
alter table public.friend_requests add constraint friend_requests_note_check
  check (source <> 'group_chat' or (note is not null and length(trim(note)) > 0));

-- Adding a trailing parameter makes a NEW overload rather than replacing the
-- old one (Postgres keys functions on name + argument types) — drop the old
-- signatures explicitly so a stale, differently-privileged copy can't be
-- left callable alongside the new one.
drop function if exists public._send_friend_request(uuid, uuid, text);
drop function if exists public.send_friend_request(uuid, text);

create function public._send_friend_request(
  p_from uuid, p_to uuid, p_source text, p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  reverse_pending uuid;
  req uuid;
  sender text;
begin
  if p_from = p_to then raise exception 'Cannot friend yourself.'; end if;
  if public.is_blocked_pair(p_from, p_to) then raise exception 'Unavailable.'; end if;
  if p_source = 'group_chat' and (p_note is null or length(trim(p_note)) = 0) then
    raise exception 'Add a short note so they know why you''re reaching out.';
  end if;
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
  values (p_from, p_to, p_source, nullif(trim(coalesce(p_note, '')), ''))
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
            || coalesce(': "' || p_note || '"', ''));
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

-- Internal: takes an arbitrary p_from, so it must stay off-limits to direct
-- client calls exactly like the signature it replaces was.
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
