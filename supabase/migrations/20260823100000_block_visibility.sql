-- Blocking was already bidirectional for the swipe deck (is_blocked_pair is
-- symmetric and get_swipe_deck already checks it) but get_members() never
-- checked it at all -- a blocked pair still saw each other in every group
-- chat's member list. Instagram-style: still share the group, just hidden
-- from each other in that list. Also adds a real "blocked profiles" list
-- (previously only a per-profile "am I blocking them" check existed, no way
-- to see or manage the whole list).

drop function if exists public.get_members(uuid);
create function public.get_members(p_conversation uuid)
returns table (
  id uuid, full_name text, major text, photo_url text, relationship text
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.photo_url, public.relationship_with(p.id)
  from conversation_members m
  join profiles p on p.id = m.profile_id
  where m.conversation_id = p_conversation and m.status = 'active'
    and public.is_conversation_member(p_conversation)
    and (p.id = auth.uid() or not public.is_blocked_pair(auth.uid(), p.id))
  order by (p.id = auth.uid()) desc, p.full_name;
$$;
grant execute on function public.get_members(uuid) to authenticated;

create or replace function public.get_my_blocks()
returns table (id uuid, full_name text, major text, photo_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.photo_url
  from blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by p.full_name;
$$;
grant execute on function public.get_my_blocks() to authenticated;
