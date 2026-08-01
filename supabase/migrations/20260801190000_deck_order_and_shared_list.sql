-- Deck ordering + a fully enumerated shared-class list.
--
-- Two changes, both about the same idea: how much you overlap with someone is
-- the most interesting thing on the card, so lead with it.
--   1. Sort the deck by number of shared sections, descending. The person you
--      sit near in three classes should not be card #14.
--   2. Return `shared` in a stable, human order (course code) so the card can
--      list every shared class instead of collapsing the tail into "+N".
--
-- DISTINCT is gone from the aggregate: enrollments is unique on
-- (profile_id, section_id), so the join already yields one row per shared
-- section, and dropping it lets us apply a real ORDER BY inside jsonb_agg.

drop function if exists public.get_swipe_deck();
create function public.get_swipe_deck()
returns table (
  id uuid, full_name text, major text, hometown text, bio text,
  instagram text, linkedin text, photo_url text, email text,
  shared jsonb, shared_count bigint
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.major, p.hometown, p.bio,
         p.instagram, p.linkedin, p.photo_url, p.email,
         jsonb_agg(
           jsonb_build_object(
             'code', c.code, 'section', s.section, 'title', initcap(lower(c.title))
           ) order by c.code, s.section
         ) as shared,
         count(*) as shared_count
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
  -- most overlap first; name only as a stable tiebreak
  order by count(*) desc, p.full_name
  limit 50;
$$;

grant execute on function public.get_swipe_deck() to authenticated;
