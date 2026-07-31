-- Demo data for local dev and demos. Runs after seed_catalog.sql (config.toml order).
-- Everything here uses insert-select lookups so a changed catalog never breaks it.

-- ---------------------------------------------------------------------------
-- Demo students (auth.users insert fires the profile trigger; @columbia.edu
-- passes the domain gate). Data-only accounts: sign-in for them is untested,
-- they exist to fill the deck, the chats, and the study feed.
-- ---------------------------------------------------------------------------

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, email_change, email_change_token_new, recovery_token)
select
  ('d0000000-0000-0000-0000-00000000000' || n)::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  email, crypt('seatmates-demo', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  (1, 'emma.demo@columbia.edu'),
  (2, 'liam.demo@columbia.edu'),
  (3, 'sofia.demo@columbia.edu'),
  (4, 'noah.demo@columbia.edu'),
  (5, 'maya.demo@columbia.edu'),
  (6, 'tariq.demo@columbia.edu'),
  (7, 'leona.demo@columbia.edu'),
  (8, 'diego.demo@columbia.edu')
) as t (n, email)
on conflict (id) do nothing;

update public.profiles p set
  full_name = d.full_name, major = d.major, hometown = d.hometown, bio = d.bio,
  instagram = d.instagram, linkedin = d.linkedin, photo_url = d.photo_url,
  is_demo = true
from (values
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'Emma Chen', 'Computer Science',
   'San Francisco, CA', 'Debugger by day, boba critic by night. Always down to whiteboard.',
   'emmac.codes', null, 'https://i.pravatar.cc/300?img=47'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'Liam O''Brien', 'Economics',
   'Chicago, IL', 'Problem sets are better with company. Butler 4th floor regular.',
   'liam.obrien', 'in/liamobrien', 'https://i.pravatar.cc/300?img=12'),
  ('d0000000-0000-0000-0000-000000000003'::uuid, 'Sofia Reyes', 'Psychology',
   'Miami, FL', 'Here for study buddies and the occasional deli run.',
   'sofia.reyes', null, 'https://i.pravatar.cc/300?img=32'),
  ('d0000000-0000-0000-0000-000000000004'::uuid, 'Noah Kim', 'Computer Science',
   'Fort Lee, NJ', 'Ask me about my mechanical keyboard. Or don''t.',
   null, 'in/noahkim', 'https://i.pravatar.cc/300?img=68'),
  ('d0000000-0000-0000-0000-000000000005'::uuid, 'Maya Patel', 'Mathematics',
   'Austin, TX', 'Proofs before parties. Okay, sometimes parties.',
   'maya.p', null, 'https://i.pravatar.cc/300?img=25'),
  ('d0000000-0000-0000-0000-000000000006'::uuid, 'Tariq Hassan', 'History',
   'Dearborn, MI', 'Will trade lecture notes for coffee recommendations.',
   'tariqh', null, 'https://i.pravatar.cc/300?img=59'),
  ('d0000000-0000-0000-0000-000000000007'::uuid, 'Leona Marchetti', 'English',
   'Providence, RI', 'Annotating in the margins since 2019.',
   null, null, 'https://i.pravatar.cc/300?img=44'),
  ('d0000000-0000-0000-0000-000000000008'::uuid, 'Diego Alvarez', 'Biology',
   'Los Angeles, CA', 'Pre-med but fun about it, I promise.',
   'diego.alv', 'in/diegoalvarez', 'https://i.pravatar.cc/300?img=15')
) as d (id, full_name, major, hometown, bio, instagram, linkedin, photo_url)
where p.id = d.id;

-- ---------------------------------------------------------------------------
-- Demo enrollments. These fire the auto-join trigger, which creates the section
-- conversations -- the same code path a real signup uses.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.enroll(p_profile uuid, p_code text, p_section text)
returns void language sql as $$
  insert into public.enrollments (profile_id, section_id)
  select p_profile, s.id
  from public.sections s join public.courses c on c.id = s.course_id
  where c.code = p_code and s.section = p_section
  on conflict do nothing;
$$;

select pg_temp.enroll(id, code, sec) from (values
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'COMS W3157', '001'),
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'COMS W3134', '001'),
  ('d0000000-0000-0000-0000-000000000001'::uuid, 'MATH UN1101', '001'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'ECON UN1105', '001'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'COMS W3157', '001'),
  ('d0000000-0000-0000-0000-000000000002'::uuid, 'MATH UN1101', '001'),
  ('d0000000-0000-0000-0000-000000000003'::uuid, 'PSYC UN1001', '001'),
  ('d0000000-0000-0000-0000-000000000003'::uuid, 'COMS W3157', '001'),
  ('d0000000-0000-0000-0000-000000000004'::uuid, 'COMS W3157', '002'),
  ('d0000000-0000-0000-0000-000000000004'::uuid, 'COMS W3134', '001'),
  ('d0000000-0000-0000-0000-000000000004'::uuid, 'MATH UN1101', '001'),
  ('d0000000-0000-0000-0000-000000000005'::uuid, 'MATH UN1101', '001'),
  ('d0000000-0000-0000-0000-000000000005'::uuid, 'COMS W3134', '001'),
  ('d0000000-0000-0000-0000-000000000006'::uuid, 'HIST UN1786', '001'),
  ('d0000000-0000-0000-0000-000000000006'::uuid, 'ECON UN1105', '001'),
  ('d0000000-0000-0000-0000-000000000007'::uuid, 'ENGL BC1068', '001'),
  ('d0000000-0000-0000-0000-000000000007'::uuid, 'COMS W3157', '001'),
  ('d0000000-0000-0000-0000-000000000008'::uuid, 'BIOL UN2005', '001'),
  ('d0000000-0000-0000-0000-000000000008'::uuid, 'MATH UN1101', '001'),
  ('d0000000-0000-0000-0000-000000000008'::uuid, 'COMS W3157', '001')
) as t (id, code, sec);

-- ---------------------------------------------------------------------------
-- A little life in the two busiest chats.
-- ---------------------------------------------------------------------------

create or replace function pg_temp.say(p_profile uuid, p_code text, p_section text,
                                       p_body text, p_mins_ago int)
returns void language sql as $$
  insert into public.messages (conversation_id, sender_id, body, created_at)
  select cv.id, p_profile, p_body, now() - (p_mins_ago || ' minutes')::interval
  from public.conversations cv
  join public.sections s on s.id = cv.section_id
  join public.courses c on c.id = s.course_id
  where c.code = p_code and s.section = p_section;
$$;

select pg_temp.say(id, 'COMS W3157', '001', body, mins) from (values
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
) as t (id, body, mins);

select pg_temp.say(id, 'MATH UN1101', '001', body, mins) from (values
  ('d0000000-0000-0000-0000-000000000005'::uuid,
   'ps4 q3 is evil and I need to talk about it', 400),
  ('d0000000-0000-0000-0000-000000000004'::uuid,
   'the trick is integration by parts twice. you''re welcome. I lost an evening to it.', 390),
  ('d0000000-0000-0000-0000-000000000008'::uuid,
   'castronovo dropped a practice midterm on courseworks btw', 120)
) as t (id, body, mins);

-- ---------------------------------------------------------------------------
-- Study sessions + RSVPs (D11/D12: Partiful-style, visible to course-mates).
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Demo greeter: when a REAL user enrolls in a section that has demo classmates,
-- two of them right-swipe the newcomer (so the tester's first right-swipes can
-- match) and one sends a friend request (so the inbox has something to accept).
-- Seed-only behavior -- lives here, not in migrations, so production never has it.
-- ---------------------------------------------------------------------------

create or replace function public.demo_greeter()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  demo record;
  i int := 0;
begin
  if new.status <> 'active'
     or (select is_demo from profiles where id = new.profile_id) then
    return new;
  end if;
  for demo in
    select p.id from enrollments e
    join profiles p on p.id = e.profile_id
    where e.section_id = new.section_id and e.status = 'active'
      and p.is_demo and p.id <> new.profile_id
    order by p.id
    limit 2
  loop
    i := i + 1;
    insert into swipes (swiper_id, swipee_id, direction)
    values (demo.id, new.profile_id, 'right')
    on conflict do nothing;
    if i = 1 then
      perform public._send_friend_request(demo.id, new.profile_id, 'group_chat');
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists demo_greeter_on_enroll on public.enrollments;
create trigger demo_greeter_on_enroll
  after insert on public.enrollments
  for each row execute function public.demo_greeter();
