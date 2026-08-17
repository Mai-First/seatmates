-- Account deletion still removes everything that's genuinely the deleted
-- user's own data (profile, matches, swipes, friend requests, RSVPs, hosted
-- sessions, notifications, blocks, reports) via the existing cascade from
-- auth.users. What changes here: messages they sent into a still-live chat
-- (a shared section chat, or a DM the other person kept) are no longer
-- yanked out from under everyone else — the message stays, only the sender
-- reference goes null, and the UI shows a "deleted account" placeholder.
-- DM threads themselves also stop being force-deleted; the surviving
-- participant keeps the history, the thread just goes read-only.

alter table public.messages alter column sender_id drop not null;
alter table public.messages drop constraint messages_sender_id_fkey;
alter table public.messages add constraint messages_sender_id_fkey
  foreign key (sender_id) references public.profiles (id) on delete set null;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in.';
  end if;

  -- NOTE: the avatar file is removed by the client through the Storage API
  -- before this call -- storage installs a guard trigger that blocks direct
  -- SQL deletes from storage.objects.

  -- Everything else cascades from here: profile, matches, swipes, friend
  -- requests, RSVPs/hosted sessions, notifications, blocks, reports, this
  -- user's own conversation_members rows. Messages they sent are kept with
  -- sender_id set to null (see messages_sender_id_fkey above) rather than
  -- deleted, and DM threads are no longer force-deleted -- the other
  -- participant keeps the history.
  delete from auth.users where id = uid;
end $$;

-- A DM's "other party" existing is now part of whether you can still post
-- into it -- their conversation_members row cascades away with their
-- profile, so no matching row means the account is gone.
create or replace function public.can_post(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = c and profile_id = auth.uid() and status = 'active'
  ) and (
    (select kind from conversations where id = c) <> 'dm'
    or exists (
      select 1 from conversation_members other
      where other.conversation_id = c and other.profile_id <> auth.uid()
        and not public.is_blocked_pair(auth.uid(), other.profile_id)
    )
  );
$$;

drop function if exists public.get_conversation_info(uuid);
create function public.get_conversation_info(p_id uuid)
returns table (
  id uuid, kind text, title text, subtitle text, member boolean, can_post boolean,
  blocked boolean, deleted boolean, muted boolean, pinned boolean, other_id uuid, icon_name text
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then lower(c.title) || ' §' || s.section
              when cv.kind = 'dm' and op.id is null then 'deleted user'
              else coalesce(op.full_name, 'Classmate') end,
         case when cv.kind = 'section' then c.code
              when cv.kind = 'dm' and op.id is null then 'this account no longer exists'
              else op.major end,
         public.is_conversation_member(cv.id),
         public.can_post(cv.id),
         cv.kind = 'dm' and op.id is not null and public.is_blocked_pair(auth.uid(), op.id),
         cv.kind = 'dm' and op.id is null,
         coalesce((select m.muted from conversation_members m
                   where m.conversation_id = cv.id and m.profile_id = auth.uid()), false),
         coalesce((select m.pinned from conversation_members m
                   where m.conversation_id = cv.id and m.profile_id = auth.uid()), false),
         op.id,
         (select m.icon_name from conversation_members m
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
  other_id uuid, deleted boolean, last_body text, last_at timestamptz, unread boolean,
  muted boolean, pinned boolean, icon_name text
) language sql stable security definer set search_path = public as $$
  select cv.id, cv.kind,
         case when cv.kind = 'section' then lower(c.title) || ' §' || s.section
              when cv.kind = 'dm' and op.id is null then 'deleted user'
              else coalesce(op.full_name, 'classmate') end as title,
         case when cv.kind = 'section' then c.code
              when cv.kind = 'dm' and op.id is null then 'this account no longer exists'
              else op.major end as subtitle,
         case when cv.kind = 'dm' and op.id is not null then op.photo_url end as photo_url,
         op.id as other_id,
         cv.kind = 'dm' and op.id is null as deleted,
         coalesce(lm.body, case when lm.attachment_type = 'image' then '📷 photo'
                                 when lm.attachment_type = 'file' then '📎 file'
                                 when lm.id is not null then 'this message was deleted' end) as last_body,
         coalesce(lm.created_at, cv.created_at) as last_at,
         -- was `x.sender_id <> auth.uid()`: a null sender_id (deleted
         -- account) made that comparison NULL, not true, so a genuinely
         -- unread message from a deleted account could never mark the
         -- chat unread. `is distinct from` treats null as its own value.
         exists (select 1 from messages x
                 where x.conversation_id = cv.id
                   and x.sender_id is distinct from auth.uid()
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
