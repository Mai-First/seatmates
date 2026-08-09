-- Media messages (photos/files), delete-for-everyone, per-chat pastel icon
-- color, and a Columbia-email visibility toggle.

-- ---------------------------------------------------------------------------
-- 1. Messages: optional attachment, optional caption, soft delete
-- ---------------------------------------------------------------------------

alter table public.messages
  add column attachment_url text,
  add column attachment_type text check (attachment_type in ('image', 'file')),
  add column attachment_name text,
  add column deleted_at timestamptz;

alter table public.messages alter column body drop not null;
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check
  check (body is null or char_length(body) between 1 and 4000);
alter table public.messages add constraint messages_content_check
  check (body is not null or attachment_url is not null or deleted_at is not null);
alter table public.messages add constraint messages_attachment_check
  check ((attachment_url is null) = (attachment_type is null));

create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns void language sql security definer set search_path = public as $$
  update messages set
    deleted_at = now(), body = null,
    attachment_url = null, attachment_type = null, attachment_name = null
  where id = p_message_id and sender_id = auth.uid();
$$;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;

insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

create policy "chat media viewable by anyone" on storage.objects
  for select using (bucket_id = 'chat-media');

-- Path convention: {conversation_id}/{filename} -- only current members of
-- that conversation may drop a file in its folder.
create policy "upload chat media as conversation member" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and exists (
      select 1 from conversation_members m
      where m.profile_id = auth.uid() and m.status = 'active'
        and m.conversation_id::text = (storage.foldername(name))[1]
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Per-chat pastel icon color (personal — each member picks their own)
-- ---------------------------------------------------------------------------

alter table public.conversation_members add column icon_color text
  check (icon_color is null or icon_color in (
    '#F7C5CC', '#F8D9B4', '#F5EAB0', '#C9E4C5',
    '#BFE3DE', '#C6DCF0', '#D9CDEE', '#EBC9DD'
  ));

create or replace function public.set_conversation_color(p_conversation uuid, p_color text)
returns void language sql security definer set search_path = public as $$
  update conversation_members set icon_color = p_color
  where conversation_id = p_conversation and profile_id = auth.uid();
$$;
grant execute on function public.set_conversation_color(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Columbia email visibility toggle
-- ---------------------------------------------------------------------------

alter table public.profiles add column show_email boolean not null default true;

-- ---------------------------------------------------------------------------
-- 4. Study tab badge: unread study_new notifications specifically
-- ---------------------------------------------------------------------------

create or replace function public.unread_study_notification_count()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from notifications
  where user_id = auth.uid() and kind = 'study_new' and read_at is null;
$$;
grant execute on function public.unread_study_notification_count() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Surface icon_color where conversations already get read
-- ---------------------------------------------------------------------------

drop function if exists public.get_conversation_info(uuid);
create function public.get_conversation_info(p_id uuid)
returns table (
  id uuid, kind text, title text, subtitle text, member boolean, can_post boolean,
  blocked boolean, muted boolean, pinned boolean, other_id uuid, icon_color text
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
         op.id,
         (select m.icon_color from conversation_members m
          where m.conversation_id = cv.id and m.profile_id = auth.uid())
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
  muted boolean, pinned boolean, icon_color text
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then c.code || ' §' || s.section
              else coalesce(op.full_name, 'Classmate') end as title,
         case when cv.kind = 'section' then initcap(lower(c.title))
              else op.major end as subtitle,
         case when cv.kind = 'dm' then op.photo_url end as photo_url,
         op.id as other_id,
         coalesce(lm.body, case when lm.attachment_type = 'image' then '📷 Photo'
                                 when lm.attachment_type = 'file' then '📎 File'
                                 when lm.id is not null then 'This message was deleted' end) as last_body,
         coalesce(lm.created_at, cv.created_at) as last_at,
         exists (select 1 from messages x
                 where x.conversation_id = cv.id
                   and x.sender_id <> auth.uid()
                   and x.created_at > me.last_read_at) as unread,
         me.muted,
         me.pinned,
         me.icon_color
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
