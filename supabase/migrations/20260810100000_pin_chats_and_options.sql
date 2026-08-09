-- Pin a chat (any kind) to the top of the list, and give the chat options
-- screen what it needs: the other person's id on a DM (for block/report/
-- view-profile/social links) and whether I've pinned or muted this thread.

alter table public.conversation_members add column pinned boolean not null default false;

create or replace function public.set_conversation_pinned(p_conversation uuid, p_pinned boolean)
returns void language sql security definer set search_path = public as $$
  update conversation_members set pinned = p_pinned
  where conversation_id = p_conversation and profile_id = auth.uid();
$$;
grant execute on function public.set_conversation_pinned(uuid, boolean) to authenticated;

drop function if exists public.get_conversation_info(uuid);
create function public.get_conversation_info(p_id uuid)
returns table (
  id uuid, kind text, title text, subtitle text, member boolean, can_post boolean,
  blocked boolean, muted boolean, pinned boolean, other_id uuid
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then c.code || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end,
         case when cv.kind = 'section' then initcap(lower(c.title)) else op.major end,
         public.is_conversation_member(cv.id),
         public.can_post(cv.id),
         cv.kind = 'dm' and public.is_blocked_pair(auth.uid(), op.id),
         coalesce((select m.muted from conversation_members m
                   where m.conversation_id = cv.id and m.profile_id = auth.uid()), false),
         coalesce((select m.pinned from conversation_members m
                   where m.conversation_id = cv.id and m.profile_id = auth.uid()), false),
         op.id
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
  muted boolean, pinned boolean
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
                   and x.created_at > me.last_read_at) as unread,
         me.muted,
         me.pinned
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
grant execute on function public.get_conversations() to authenticated;
