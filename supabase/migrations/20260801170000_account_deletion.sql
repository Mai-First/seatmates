-- In-app account deletion (App Store guideline 5.1.1(v) requires it; it's
-- also just the right thing to offer).
--
-- Deleting the auth.users row cascades through profiles into everything the
-- user owns: enrollments, memberships, swipes, matches, friend requests,
-- messages, RSVPs, hosted study sessions, notifications, blocks, reports.
-- Messages are deleted, not anonymized -- privacy-forward, and group chats
-- simply lose those bubbles.

-- Notifications should outlive the account that triggered them (e.g. "session
-- cancelled" when a host deletes themselves), so the actor link goes
-- set-null instead of cascade. The recipient's own rows still cascade away
-- via user_id.
alter table public.notifications
  drop constraint notifications_actor_id_fkey,
  add constraint notifications_actor_id_fkey
    foreign key (actor_id) references public.profiles (id) on delete set null;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in.';
  end if;

  -- DM conversations die with either participant -- the other person keeps
  -- no ghost thread. (Section chats are shared infrastructure and stay.)
  delete from conversations
  where kind = 'dm' and match_key like '%' || uid || '%';

  -- NOTE: the avatar file is removed by the client through the Storage API
  -- before this call -- storage installs a guard trigger that blocks direct
  -- SQL deletes from storage.objects.

  -- Everything else cascades from here.
  delete from auth.users where id = uid;
end $$;

grant execute on function public.delete_my_account() to authenticated;

-- The init migration granted insert/update on own avatar but never delete.
create policy "delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and name like auth.uid() || '/%');
