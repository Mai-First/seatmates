-- "Hide my profile" toggle (PLAN §6 — flagged alongside block/report as
-- something the app needs, never built). A hidden profile drops out of
-- everyone else's swipe deck; the person keeps their own account, classes,
-- chats, and matches untouched, and can flip it back on any time.

alter table public.profiles add column hidden boolean not null default false;

drop function if exists public.get_swipe_deck();
create function public.get_swipe_deck()
returns table (
  id uuid, full_name text, major text, hometown text, bio text, study_spot text,
  school text, grad_year int,
  instagram text, linkedin text, photo_url text, email text,
  shared jsonb, shared_count bigint
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.hometown, p.bio, p.study_spot,
         p.school, p.grad_year,
         p.instagram, p.linkedin, p.photo_url, p.email,
         jsonb_agg(distinct jsonb_build_object(
           'code', c.code, 'section', s.section, 'title', lower(c.title))) as shared,
         count(distinct s.id) as shared_count
  from enrollments me
  join enrollments them on them.section_id = me.section_id
                       and them.profile_id <> me.profile_id
                       and them.status = 'active'
  join sections s on s.id = me.section_id
  join courses c on c.id = s.course_id
  join profiles p on p.id = them.profile_id
  where me.profile_id = auth.uid()
    and me.status = 'active'
    and p.full_name is not null
    and not p.hidden
    and not exists (select 1 from swipes sw
                    where sw.swiper_id = auth.uid() and sw.swipee_id = p.id)
    and not exists (select 1 from matches m
                    where m.user_a = least(auth.uid(), p.id)
                      and m.user_b = greatest(auth.uid(), p.id))
    and not exists (select 1 from friend_requests fr
                    where fr.status = 'pending'
                      and (fr.from_id, fr.to_id) in ((auth.uid(), p.id), (p.id, auth.uid())))
    and not public.is_blocked_pair(auth.uid(), p.id)
  group by p.id
  limit 50;
$$;
grant execute on function public.get_swipe_deck() to authenticated;
