-- Double-tap-to-like a message (Instagram DM style — double tap toggles a
-- heart on/off, not a one-way "like"). conversation_id is denormalized onto
-- the row (not just derivable via message_id) so realtime can filter on it
-- the same way the messages channel already does.

create table public.message_likes (
  message_id      uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (message_id, profile_id)
);
create index message_likes_conversation_idx on public.message_likes (conversation_id);

alter table public.message_likes enable row level security;

create policy "read likes in my conversations" on public.message_likes
  for select to authenticated using (public.is_conversation_member(conversation_id));

create policy "like a message in my conversations" on public.message_likes
  for insert to authenticated
  with check (profile_id = auth.uid() and public.is_conversation_member(conversation_id));

create policy "unlike my own like" on public.message_likes
  for delete to authenticated using (profile_id = auth.uid());

alter publication supabase_realtime add table public.message_likes;
