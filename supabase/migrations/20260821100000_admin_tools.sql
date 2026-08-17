-- Admin tools, in-app: announcements and report review, previously SQL-editor
-- only (README's "operating the app" runbook). Also fixes is_admin being
-- tied to a profiles.id that doesn't survive delete/recreate — it's now
-- derived from email via admin_emails, checked on every new signup.

create table public.admin_emails (
  email text primary key
);

insert into public.admin_emails (email) values
  ('ml5386@columbia.edu'),
  ('mf3709@columbia.edu'),
  ('es3977@columbia.edu')
on conflict do nothing;

-- Keep existing rows in sync with the table above, then make every future
-- signup (including a recreated account under the same email) self-assign.
update public.profiles p set is_admin = true
where exists (select 1 from admin_emails a where a.email = p.email) and not p.is_admin;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, exists (select 1 from admin_emails a where a.email = new.email))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Reports: list, dismiss, remove the reported user.
-- ---------------------------------------------------------------------------

-- attachment_path (not "url": report-evidence is a private bucket, so this
-- is a raw storage path the client resolves to a short-lived signed URL on
-- demand, not something directly fetchable).
alter table public.reports
  add column resolved_at timestamptz,
  add column attachment_path text,
  add column attachment_type text check (attachment_type in ('image', 'file')),
  add column attachment_name text,
  add constraint reports_attachment_check check ((attachment_path is null) = (attachment_type is null));

-- Evidence is sensitive (harassment screenshots etc.) so, unlike chat-media,
-- this bucket is NOT publicly readable — only the reporter who uploaded it
-- and admins reviewing it can. Path convention: {reporter_id}/{filename}.
insert into storage.buckets (id, name, public) values ('report-evidence', 'report-evidence', false)
on conflict (id) do nothing;

create policy "report evidence viewable by reporter or admins" on storage.objects
  for select to authenticated using (
    bucket_id = 'report-evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from profiles where profiles.id = auth.uid() and is_admin)
    )
  );

create policy "upload own report evidence" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'report-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.list_reports()
returns table (
  id uuid, reason text, created_at timestamptz,
  reporter_id uuid, reporter_name text,
  reported_id uuid, reported_name text, reported_photo text,
  attachment_path text, attachment_type text, attachment_name text
) language plpgsql stable security definer set search_path = public as $$
begin
  -- Qualified as profiles.id: RETURNS TABLE implicitly declares `id` as a
  -- PL/pgSQL variable in scope for the whole function body, which an
  -- unqualified `id` here would collide with (ambiguous column reference).
  if not exists (select 1 from profiles where profiles.id = auth.uid() and is_admin) then
    raise exception 'Admins only.';
  end if;
  return query
    select r.id, r.reason, r.created_at,
           r.reporter_id, rp.full_name,
           r.reported_id, rd.full_name, rd.photo_url,
           r.attachment_path, r.attachment_type, r.attachment_name
    from reports r
    join profiles rp on rp.id = r.reporter_id
    join profiles rd on rd.id = r.reported_id
    where r.resolved_at is null
    order by r.created_at desc;
end $$;
grant execute on function public.list_reports() to authenticated;

create or replace function public.dismiss_report(p_report uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Admins only.';
  end if;
  update reports set resolved_at = now() where id = p_report;
end $$;
grant execute on function public.dismiss_report(uuid) to authenticated;

-- Same shape as delete_my_account, minus the client-side avatar-storage step
-- (that requires the target's own session) -- the orphaned avatar file is a
-- harmless leftover, not a functional issue.
create or replace function public.admin_remove_user(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Admins only.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Use account deletion (Account tab) for your own account.';
  end if;
  delete from conversations where kind = 'dm' and match_key like '%' || p_user || '%';
  update reports set resolved_at = now() where reported_id = p_user and resolved_at is null;
  delete from auth.users where id = p_user;
end $$;
grant execute on function public.admin_remove_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Announcements: wraps app_announce() (postgres/SQL-editor only) behind an
-- admin check so it's callable from the app.
-- ---------------------------------------------------------------------------

create or replace function public.admin_send_announcement(p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Admins only.';
  end if;
  if length(trim(p_body)) = 0 then
    raise exception 'Announcement cannot be empty.';
  end if;
  perform public.app_announce(trim(p_body));
end $$;
grant execute on function public.admin_send_announcement(text) to authenticated;
