-- Study tab badge should clear on visiting the tab, the same way the
-- Inbox already clears the bell's count on visiting it.

create or replace function public.mark_study_notifications_read()
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and kind = 'study_new' and read_at is null;
$$;
grant execute on function public.mark_study_notifications_read() to authenticated;
