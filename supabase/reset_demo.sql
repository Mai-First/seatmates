-- Resets the demo world to a clean, judge-ready state without touching real
-- (non-demo) accounts or their relationships. Safe to re-run any time
-- testing has left stray RSVPs, friendships, or chat clutter behind.
--
-- Run from the SQL editor, or:
--   npx supabase db query --linked --file supabase/reset_demo.sql
--
-- Scope: only rows involving a demo persona (id like 'd0000000-...') are
-- touched for swipes/friend_requests/matches/DMs/reports. The two seeded
-- section chats (COMS W3157 §001, MATH UN1101 §001) are reset for everyone
-- in them, since they're the app's showcase group chats — that includes
-- real students enrolled in those same sections.

-- 1. Study sessions + RSVPs + their notifications
delete from notifications where kind in ('study_new','study_update','study_rsvp','study_announcement');
delete from study_sessions;

insert into public.study_sessions (course_id, host_id, title, description, location, starts_at)
select c.id, v.host, v.title, v.descr, v.loc, v.starts
from (values
  ('COMS W3157', 'd0000000-0000-0000-0000-000000000001'::uuid,
   'AP midterm grind', 'Bring your worst segfaults. We''ll order pizza at 8.',
   'Butler 403', now() + interval '2 days' + interval '18 hours'),
  ('COMS W3157', 'd0000000-0000-0000-0000-000000000002'::uuid,
   'Makefile lab co-work', 'Low key co-working, headphones welcome.',
   'Milstein 502', now() + interval '5 days' + interval '15 hours'),
  ('MATH UN1101', 'd0000000-0000-0000-0000-000000000005'::uuid,
   'Calc PS5 party', 'We suffer together. Whiteboard reserved.',
   'Math Library', now() + interval '3 days' + interval '19 hours'),
  ('ECON UN1105', 'd0000000-0000-0000-0000-000000000002'::uuid,
   'Econ recitation review', 'Going over supply/demand curves before Friday quiz.',
   'Lehman Library', now() + interval '1 day' + interval '17 hours')
) as v (code, host, title, descr, loc, starts)
join public.courses c on c.code = v.code
on conflict do nothing;

insert into public.rsvps (session_id, profile_id, status)
select ss.id, p.profile, 'going'
from public.study_sessions ss
join public.courses c on c.id = ss.course_id
join (values
  ('COMS W3157', 'd0000000-0000-0000-0000-000000000002'::uuid),
  ('COMS W3157', 'd0000000-0000-0000-0000-000000000003'::uuid),
  ('COMS W3157', 'd0000000-0000-0000-0000-000000000007'::uuid),
  ('MATH UN1101', 'd0000000-0000-0000-0000-000000000004'::uuid),
  ('MATH UN1101', 'd0000000-0000-0000-0000-000000000008'::uuid)
) as p (code, profile) on p.code = c.code
on conflict do nothing;

-- 2. Swipes/friend_requests/matches involving a demo persona
delete from swipes
where swiper_id::text like 'd0000000-0000-0000-0000-%'
   or swipee_id::text like 'd0000000-0000-0000-0000-%';

delete from friend_requests
where from_id::text like 'd0000000-0000-0000-0000-%'
   or to_id::text like 'd0000000-0000-0000-0000-%';

delete from matches
where user_a::text like 'd0000000-0000-0000-0000-%'
   or user_b::text like 'd0000000-0000-0000-0000-%';

-- 3. DM conversations involving a demo persona (cascades to members/messages/likes)
delete from conversations
where kind = 'dm' and match_key like '%d0000000-0000-0000-0000-%';

-- 3b. Reports involving a demo persona (e.g. test reports made while trying
-- out the admin review screen)
delete from reports
where reporter_id::text like 'd0000000-0000-0000-0000-%'
   or reported_id::text like 'd0000000-0000-0000-0000-%';

-- 4. Stale relationship notifications pointing at now-deleted requests/matches
delete from notifications
where kind in ('friend_request', 'request_accepted', 'new_match')
  and (actor_id::text like 'd0000000-0000-0000-0000-%'
       or user_id::text like 'd0000000-0000-0000-0000-%');

-- 5. Reset every section-chat membership row to a clean baseline
update conversation_members m
set status = 'active', left_via = null, muted = false, pinned = false, icon_name = null
from conversations c
where c.id = m.conversation_id and c.kind = 'section';

-- 6. Wipe and reseed the two demo "little life" section chats
delete from messages
where conversation_id in (select id from conversations where kind = 'section');

insert into public.messages (conversation_id, sender_id, body, created_at)
select cv.id, t.id, t.body, now() - (t.mins || ' minutes')::interval
from (values
  ('d0000000-0000-0000-0000-000000000001'::uuid,
   'has anyone started the makefile lab or are we all in denial', 340),
  ('d0000000-0000-0000-0000-000000000002'::uuid,
   'denial. strong denial.', 332),
  ('d0000000-0000-0000-0000-000000000003'::uuid,
   'office hours were actually so useful today, TA walked through valgrind', 250),
  ('d0000000-0000-0000-0000-000000000007'::uuid,
   'wait which TA?? mine just stared at my segfault with me in silence', 244),
  ('d0000000-0000-0000-0000-000000000008'::uuid,
   'a moment of silence for the segfault', 240),
  ('d0000000-0000-0000-0000-000000000001'::uuid,
   'starting a study session for the midterm, check the study tab', 55)
) as t (id, body, mins)
cross join lateral (
  select cv.id from public.conversations cv
  join public.sections s on s.id = cv.section_id
  join public.courses c on c.id = s.course_id
  where c.code = 'COMS W3157' and s.section = '001'
) cv;

insert into public.messages (conversation_id, sender_id, body, created_at)
select cv.id, t.id, t.body, now() - (t.mins || ' minutes')::interval
from (values
  ('d0000000-0000-0000-0000-000000000005'::uuid,
   'ps4 q3 is evil and I need to talk about it', 400),
  ('d0000000-0000-0000-0000-000000000004'::uuid,
   'the trick is integration by parts twice. you''re welcome. I lost an evening to it.', 390),
  ('d0000000-0000-0000-0000-000000000008'::uuid,
   'castronovo dropped a practice midterm on courseworks btw', 120)
) as t (id, body, mins)
cross join lateral (
  select cv.id from public.conversations cv
  join public.sections s on s.id = cv.section_id
  join public.courses c on c.id = s.course_id
  where c.code = 'MATH UN1101' and s.section = '001'
) cv;

-- 7. Judge accounts: wipe back to a blank, un-onboarded profile so sign-in
-- drops straight into onboarding again (leave the auth.users row itself —
-- the password stays valid).
update profiles set
  full_name = null, major = null, hometown = null, bio = null, study_spot = null,
  instagram = null, linkedin = null, photo_url = null, school = null, grad_year = null
where email like 'judge%@columbia.edu';
delete from profile_prompts where profile_id in (select id from profiles where email like 'judge%@columbia.edu');
delete from enrollments where profile_id in (select id from profiles where email like 'judge%@columbia.edu');
