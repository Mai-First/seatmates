# seatmates

Make friends with the people already in the room.

Columbia only. Swipe on classmates who share your sections, land in
per-section group chats, send friend requests, and post Partiful-style study
sessions.

Built for the Pathfinders Stellic Challenge. Design decisions live in
[docs/PLAN.md](docs/PLAN.md).

**Stack:** Expo (React Native, SDK 57), expo-router, TypeScript and React Query
on the front. Supabase (Postgres, Auth, Realtime, Storage, RLS) on the back.
Course catalog scraped from the
[CU Directory of Classes](https://doc.sis.columbia.edu).

**Design:** warm palette, Instrument Sans and Instrument Serif, light and dark.
Every token lives in `src/lib/theme.ts`. Every screen reads `useTheme()`, so
changing a token there re-skins the whole app.

---

## For judges

You need no Columbia email, no Supabase account, and no terminal.

### Open the app

Use the link and credentials in our submission form. If you are reading this
on GitHub without them, email the team and we will send both.

To run it yourself, see [Run it](#run-it) below. That path needs two Supabase
values which we supply with the submission, since the backend is not public.

### Sign in

Signup requires an `@columbia.edu` address, enforced in the UI and again by a
database trigger, so you cannot create an account. Sign in instead. Two
doors, both open.

**Door 1: onboard as a new student.** Five accounts, each with a confirmed
login and no profile yet:

| Email | Password |
|---|---|
| `judge1@columbia.edu` through `judge5@columbia.edu` | `SeatmatesDemo1` |

Signing in drops you into the real onboarding flow: profile, schedule,
tutorial, tabs. Identical to a first-time student. Pick a different `judgeN`
if a colleague is testing at the same time. Nobody needs to clean them up
afterward.

**Door 2: sign in as a populated student.** Thirteen demo personas accept the
password `seatmates-demo`:

```
batman.demo@columbia.edu       ellewoods.demo@columbia.edu
harrystyles.demo@columbia.edu  homer.demo@columbia.edu
liam.demo@columbia.edu         mrbeast.demo@columbia.edu
rihanna.demo@columbia.edu      shrek.demo@columbia.edu
taylorswift.demo@columbia.edu  therock.demo@columbia.edu
vader.demo@columbia.edu        yoda.demo@columbia.edu
zendaya.demo@columbia.edu
```

These land you in a filled-out account: classes joined, group chats with
history, friends, study sessions. The mailbox names are internal handles from
an earlier seed, so on screen you appear under an invented student name.

Start with door 1 to see what a student experiences. Start with door 2 to see
the app full.

### Then follow the walkthrough

[Ten-minute walkthrough](#ten-minute-walkthrough) covers every feature in
order, and takes about ten minutes.

Two things that will save you confusion:

**Search one of these eight courses.** The catalog holds 4,467 courses, and
only eight have demo students in them. Join any other section and you land in
an empty room with no classmates and no chat, which looks broken but is not.

```
COMS W3157   COMS W3134   MATH UN1101   ECON UN1105
PSYC UN1001  HIST UN1786  ENGL BC1068   BIOL UN2005
```

**Enrolling triggers the demo.** The moment you join a section with demo
classmates, two of them swipe right on you and a third sends a friend
request. That is deliberate, and it means one account on one device can reach
matching, the celebration screen, and the inbox without a second person.

---

## Run it

### Prerequisites

- Node 20 or newer (`node --version`)
- Expo Go on a phone, an iOS simulator, an Android emulator, or a browser

```bash
npm install
```

### 1. Backend

The team shares one hosted Supabase project. Teammates: ask each other for the
project URL and anon key. Judges: both values come with our submission. Then:

```bash
cp .env.example .env
```

Paste them into `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
and skip to [step 2](#2-app).

<details>
<summary><b>Setting up a fresh hosted project from scratch</b></summary>

Only for starting a new team or instance, not for joining the existing one.

1. Create a project at [supabase.com](https://supabase.com). Free tier is fine.
2. Link and push the schema and seeds:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --include-seed
   npx supabase config push
   ```

   `config push` syncs auth settings from `config.toml`. Watch `otp_length`.
   It must stay at **6**, because the sign-in screen's code input accepts
   exactly six digits and hosted projects default to eight. Get this wrong and
   sign-in breaks with no error message at all.

   The free tier rejects custom email templates on the default built-in mailer,
   so `config push` errors on the template section until you configure real
   SMTP in step 4. Before that, hosted signups get Supabase's stock template: a
   clickable link with no visible code. The app's type-in-a-code flow cannot
   work against it.

3. Put the project's URL and anon key (Project Settings, then API) in `.env`.

4. Configure real SMTP so you can push the custom template and its 6-digit
   code. The built-in mailer cannot send it on any tier.

   Gmail works and skips domain verification. Most transactional providers only
   deliver to the account owner on their free tier until you verify a domain,
   which breaks the moment a tester uses a different address.

   1. On a Gmail-backed account (a Columbia address on Google Workspace
      qualifies), turn on 2-Step Verification, then Security, then App
      passwords, and generate one for "Mail".
   2. Fill in `[auth.email.smtp]` in `config.toml`: `host = "smtp.gmail.com"`,
      `port = 587`, `user` set to that Gmail address, and
      `pass = "env(GMAIL_APP_PASSWORD)"`. The password never touches the file.
      Supabase reads it from your shell at push time.
   3. Run:
      ```bash
      GMAIL_APP_PASSWORD="<16-char app password, no spaces>" npx supabase config push
      ```
      This turns on SMTP and pushes the branded OTP template in one call, now
      that the built-in mailer is out of the way.
   4. Anyone re-running `supabase config push` later needs `GMAIL_APP_PASSWORD`
      set too, or the push blanks out the SMTP password.

</details>

### 2. App

```bash
npx expo start
```

- `w` for the browser, the fastest loop
- `i` for the iOS simulator
- Scan the QR code in Expo Go for a real phone

The app shows "Almost there" when `.env` is missing or empty. Expo bakes env
vars in at bundle time, so restart `expo start` after you edit it.

---

## Test it

### Sign-in

Create an account with a real `@columbia.edu` address. The hosted project sends
real email, so use one you can check, and check spam. A 6-digit code verifies
the address, then you set a password.

After that you sign in with email and password. The "email me a code" link
handles a forgotten one. Try to create a second account on an email that
already exists and the app sends you to sign-in instead.

### The seeded world

The shared project ships with the full Fall 2026 catalog: 4,467 courses across
339 subjects, 8,441 sections.

**Only eight of those courses have demo students in them.** Join any other
section and you land in an empty room: no classmates, no chat activity, no
swipe deck. Search one of these instead:

```
COMS W3157   COMS W3134   MATH UN1101   ECON UN1105
PSYC UN1001  HIST UN1786  ENGL BC1068   BIOL UN2005
```

It also ships **20 invented students**. Not real people, and not existing
fictional characters either, so no name or likeness question arises:

> Priya Chandrasekaran, Liam O'Brien, Jonah Fitzgerald, Dante Reyes, Adrian
> Voss, Miles Okafor, Charlie Kowalski, Wei Lin, Ada Nakamura, Sage Whitfield,
> Marcus Reid, Owen Bramble, Desmond Ortiz, Vivian Cole, Ethan Brooks,
> Josephine Park, Tommy Reeves, Derek Sanders, Freya Lindqvist,
> Claire Marsh

They enroll across COMS W3157, COMS W3134, MATH UN1101, ECON UN1105,
PSYC UN1001, HIST UN1786, ENGL BC1068, and BIOL UN2005.

Each has a full profile: a DiceBear cartoon avatar (MIT licensed), a real US
hometown, a bio, a study spot, and three in-character prompt answers, so the
prompts feature has something to show from a cold seed.

Two section chats, COMS W3157 §001 and MATH UN1101 §001, arrive with
live-looking chatter. Four study sessions already carry RSVPs.

**The demo greeter.** Enroll in a section that has demo classmates and two of
them right-swipe you, while a third sends a friend request. One account on one
device can exercise every flow, including matching and the celebration screen,
with no second person and no second phone.

**Resetting.** Testing leaves stray RSVPs, friendships, cluttered chats, and
judge accounts stuck mid-onboarding. Reset touches only demo personas, the two
seeded group chats, and the judge accounts:

```bash
npx supabase db query --linked --file supabase/reset_demo.sql
```

### Ten-minute walkthrough

1. **Onboard.** Sign in, fill the profile (photo required, pronouns optional),
   add a prompt answer or two, search `W3157` or `3157` or the call number `13536`, join
   **COMS W3157 §001**, read the one-time tutorial.
2. **Chats.** An auto-join trigger already put you in COMS W3157 §001 with
   seeded messages. Send one. Double-tap a message to like it. Tap once for its
   exact time. Send a photo or a file. Pin the chat, mute it, or give it a
   custom icon from the overflow menu.
3. **Inbox** (bell, top right). A demo classmate has sent a friend request.
   Accept it, open the DM, tap an icebreaker chip, send.
4. **Swipe.** Cards show the class you share, with prompt answers on the back.
   Swipe right on everyone. One of them already swiped you, so you hit the
   connect screen. "Say hi" opens the DM.
5. **Study.** Filter by class. RSVP to "AP midterm grind" and check who else is
   going. Host a session and send everyone who RSVP'd an announcement, which
   lands as a notification and a push rather than a chat message. Everyone in
   the course sees your session, whatever section they are in. Add it to
   Google, Apple, or Outlook calendar.
6. **Members list** (people icon in a group chat). Add friends one at a time.
   There is no "add all", by design.
7. **Account.** Edit your profile. Toggle whether your Columbia email shows.
   Hide your profile to drop out of everyone's deck without leaving your
   classes. Set per-category notification preferences. Under my classes, drop
   W3157 and watch chat membership end, the deck empty of its people, and your
   DMs survive, then re-add it. Archive the semester at rollover.
8. **Block and report.** Block from any profile. They vanish from your deck and
   DMs stop. Contact details stay hidden until you are friends, never while
   browsing.
9. **Delete account** (double confirm). Removes the profile, matches, swipes,
   friend requests, RSVPs, and hosted sessions, and frees the email for
   re-signup, as App Store guideline 5.1.1(v) requires. Messages they sent stay
   put for whoever they were talking to, in group chats and DMs alike. The
   sender shows as "deleted user" with a grey placeholder avatar, and DM
   threads go read-only.

### Realtime across two accounts

Open a second browser or a private window at the same URL, sign in as a second
account, join the same section, and chat between the windows. Messages appear
live over Supabase Realtime.

### Automated checks

```bash
npm run typecheck   # tsc --noEmit
```

GitHub Actions runs `npm ci`, the Expo CLI, and the typecheck on every pull
request. See `.github/workflows/ci.yml`, which also carries a commented-out
pgTAP job for database policy tests.

---

## Repo map

```
docs/PLAN.md                 product + architecture decisions (D1-D19), build phases
scripts/scrape_doc.py        Directory of Classes to JSON (traps in PLAN §8)
scripts/catalog_to_sql.py    JSON to supabase/seed_catalog.sql
supabase/migrations/         schema, RLS, triggers, RPCs. Append only.
supabase/seed_catalog.sql    generated Fall 2026 catalog subset (committed)
supabase/seed.sql            demo students, messages, study sessions, demo greeter
supabase/reset_demo.sql      restores demo data, leaves real accounts alone
src/app/                     expo-router screens (tabs are directories, PLAN §7)
src/features/                shared feature components (course search and manage)
src/lib/                     supabase client, auth context, theme, row types
src/lib/theme.ts             design tokens, ThemeProvider, useTheme (light + dark)
```

Re-scraping the catalog for a new term:

```bash
python3 scripts/scrape_doc.py --term Fall2026 --out data/
python3 scripts/catalog_to_sql.py data/courses_20263.json data/sections_20263.json
npx supabase db push --include-seed
```

## Team runbook

**Announcements.** Run `select app_announce('text');` as postgres from the SQL
editor or psql. It lands in every user's inbox. Use it for the end-of-semester
nudge to archive classes.

**Reports.** Mark your team's accounts once:

```sql
update profiles set is_admin = true where email in ('you@columbia.edu');
```

Every filed report then arrives in your inbox, and tapping the avatar opens the
reported profile. Removing a user is still manual SQL.

**Term rollover.** Scrape the new term, load it, then:

```sql
update app_settings set value = '20271' where key = 'current_term';
```

Search only ever shows the current term.

**Push notifications.** The plumbing is live: tokens sit on profiles, and a
database trigger POSTs every notification to Expo's push API. It activates the
day you make an EAS dev build with a projectId. In Expo Go and on web,
registration is a no-op and the in-app inbox covers everything.

