-- Reverting the 🗑️ emoji prefix from 20260817100000 — the client now
-- renders a real Ionicons trash icon next to the preview text instead
-- (matching the icon already used in the message bubble itself), so the
-- SQL fallback goes back to plain text.

drop function if exists public.get_conversations();
create function public.get_conversations()
returns table (
  id uuid, kind text, title text, subtitle text, photo_url text,
  other_id uuid, last_body text, last_at timestamptz, unread boolean,
  muted boolean, pinned boolean, icon_name text
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then lower(c.title) || ' §' || s.section
              else coalesce(op.full_name, 'classmate') end as title,
         case when cv.kind = 'section' then c.code else op.major end as subtitle,
         case when cv.kind = 'dm' then op.photo_url end as photo_url,
         op.id as other_id,
         coalesce(lm.body, case when lm.attachment_type = 'image' then '📷 photo'
                                 when lm.attachment_type = 'file' then '📎 file'
                                 when lm.id is not null then 'this message was deleted' end) as last_body,
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
