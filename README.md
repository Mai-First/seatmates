# seatmates

Make friends with the people already in the room. Columbia-only: swipe on
classmates who share your sections, get dropped into per-section group chats,
send friend requests, and post Partiful-style study sessions.

Built for the Pathfinders Stellic Challenge. Design decisions live in
[docs/PLAN.md](docs/PLAN.md).

**Stack:** Expo (React Native, SDK 57) + expo-router + TypeScript + React Query
on the front; Supabase (Postgres, Auth, Realtime, Storage, RLS) on the back.
Course catalog scraped from the
[CU Directory of Classes](https://doc.sis.columbia.edu).

**Design:** the visual system (warm palette, Instrument Sans + Instrument Serif,
light/dark) comes from the *Seatmates app redesign brief* Claude Design project.
All of it lives in `src/lib/theme.ts` — every screen reads `useTheme()`, so
changing a token there re-skins the whole app.

---

## Run it

### 0. Prerequisites

- Node 20+ (`node --version`)
- A phone with **Expo Go**, or an iOS simulator / Android emulator, or just a
  browser (`w` in the Expo CLI)

```bash
npm install
```

### 1. Backend

The team shares one hosted Supabase project. Get the project URL and anon key
from a teammate, then:

```bash
cp .env.example .env
```

Paste them into `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
That's it — skip straight to [step 2](#2-app).

**Setting up a new hosted project from scratch** (starting a fresh
team/instance, not joining the existing one):

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Link and push the schema + seeds:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --include-seed
   npx supabase config push
   ```
   `config push` syncs auth settings from `config.toml` — in particular
   `otp_length`, which must stay **6** (the sign-in screen's code input is
   hardcoded to 6 digits; hosted projects default to 8 and will silently break
   sign-in otherwise).

   The free tier rejects custom email templates *on the default built-in
   mailer* — `config push` errors on the template section until real SMTP is
   configured (see step 4). Until then, hosted signups get Supabase's stock
   template, which is a clickable link with no visible code, and the app's
   type-in-a-code flow won't work at all.
3. Put the project's URL and anon key (Project Settings → API) in `.env`.
4. Configure real SMTP so the custom template (and its 6-digit code) can
   actually be pushed — the built-in mailer can't send it, free tier or not.
   Gmail works and needs no domain verification (unlike most transactional
   providers' free tiers, which only deliver to the account owner until you
   verify a domain — a dealbreaker if your testers use other addresses):
   1. On a Gmail-backed account (a Columbia address on Google Workspace works
      fine), turn on 2-Step Verification, then Security → App passwords →
      generate one for "Mail".
   2. Fill in `[auth.email.smtp]` in `config.toml` (`host = "smtp.gmail.com"`,
      `port = 587`, `user` = that Gmail address, `pass = "env(GMAIL_APP_PASSWORD)"`).
      The password is never written to the file — it's read from your shell
      at push time.
   3. `GMAIL_APP_PASSWORD="<the 16-char app password, no spaces>" npx supabase config push`
      — this both turns on SMTP and (now that it's no longer the default
      mailer) pushes the branded OTP template in the same call.
   4. Anyone who re-runs `supabase config push` later needs `GMAIL_APP_PASSWORD`
      set locally too, or the push blanks the SMTP password out.

### 2. App

```bash
npx expo start
```

- `w` → web browser (fastest loop)
- `i` → iOS simulator
- Scan the QR in **Expo Go** for a real phone.

If the app shows "Almost there," `.env` is missing or empty — env vars are baked
in at bundle time, so restart `expo start` after editing it.

---

## Test it

### Sign-in

**Create account** with a real address ending in `@columbia.edu` — the hosted
project sends real email now, so it has to be one you can actually check (spam
folder too). The emailed 6-digit code verifies the address, then you set a
password. From then on you **sign in with email + password**; the "email me a
code" link on the sign-in screen covers forgotten passwords. Creating an
account with an already-used email redirects you to sign-in. (Non-Columbia
addresses are rejected twice: in the UI and by a database trigger.)

### For judges — no Columbia email needed

The app gates real signup to `@columbia.edu` addresses (enforced client-side
*and* by a database trigger — see [D1](docs/PLAN.md)), so judging without one
means either signing into an already-populated account, or actually going
through account creation the way a real student would. Five pre-provisioned
accounts cover the second path — they pass the domain check with a real
`@columbia.edu`-shaped address, but nobody's checking that inbox, so sign-in
(not "create account") is the door in:

| Email | Password |
|---|---|
| `judge1@columbia.edu` through `judge5@columbia.edu` | `SeatmatesDemo1` |

Each one has a confirmed login and **no profile yet** — signing in drops you
straight into the real onboarding flow (profile → schedule → tutorial → tabs),
identical to what a first-time student sees. Use a different `judgeN` if you
want a clean slate alongside someone else testing at the same time; the
account is otherwise disposable — no requirement to clean it up afterward.

Prefer to explore a fully populated account instead of onboarding from
scratch? Any of the 20 demo personas below works the same way once you know
its email (`select email from profiles where full_name = 'Elowen Marsh';` from the
SQL editor) — they don't have set passwords, so that route needs an admin
password reset first.

### The seeded world

The shared project comes pre-loaded with a Fall 2026 catalog (9 subjects,
~900 sections) and **20 wholly made-up demo personas** — not real people,
not existing fictional characters either, so there's no name/likeness
question of any kind: Priya Chandrasekaran, Liam O'Brien, Jonah Fitzgerald,
Dante Reyes, Adrian Voss, Miles Okafor, Charlie Kowalski, Wei Lin, Ada
Nakamura, Sage Whitfield, Marcus Reid, Owen Bramble, Desmond Ortiz, Nyx
Castellan, Silas Kade, Josephine Park, Bartholomew Higgins, Percival
Lockhart, Freya Lindqvist, and Elowen Marsh — enrolled across **COMS W3157,
COMS W3134, MATH UN1101, ECON UN1105, PSYC UN1001, HIST UN1786, ENGL BC1068,
BIOL UN2005**. Each one has a full profile: photo (DiceBear-generated
cartoon avatars, MIT-licensed), bio, study spot, and three in-character
prompt answers, so the prompts feature has something to show from a fresh
seed. Two
section chats (COMS W3157 §001, MATH UN1101 §001) come pre-loaded with
live-looking chatter, and four study sessions are posted with RSVPs already
on them.

The seed also installs a **demo greeter**: the moment you enroll in a section
with demo classmates, two of them right-swipe you and one sends you a friend
request. That means a single account can exercise every flow with no second
device.

Testing muddied the demo data (old RSVPs, stray friendships, cluttered group
chats, a judge account that's been through onboarding)? Re-run the reset —
it only touches demo personas, the two seeded group chats, and the judge
accounts, never a real student's data:

```bash
npx supabase db query --linked --file supabase/reset_demo.sql
```

### Ten-minute walkthrough

1. **Onboard.** Sign in (or use a judge account, above) → fill the profile
   (photo required) → add a couple of optional prompt answers → search
   `W3157` or `3157` or a call number like `13536` → join **COMS W3157 §001**
   → the one-time tutorial → Done.
2. **Chats tab.** You're already in *COMS W3157 §001* (auto-join trigger) with
   seeded messages. Send one, double-tap a message to like it, tap once to
   reveal its exact time, send a photo or a file, pin the chat, mute it, or
   give it a custom icon (⋮ menu).
3. **Inbox (bell, top right).** A demo classmate has sent you a friend
   request. **Accept** → open the DM → tap an icebreaker chip → send.
4. **Swipe tab.** Cards show the class you share and prompt answers on the
   back. Swipe right on everyone — one of them already right-swiped you, so
   you'll hit the 🎉 connect screen. *Say hi* opens the DM.
5. **Study tab.** Filter by class, RSVP to "AP midterm grind," check who else
   is going (people icon), and if you're hosting a session, send everyone
   RSVP'd an announcement (megaphone icon) — it lands as a notification +
   push, not a chat message. Post your own session — everyone in the course
   (any section) sees it. Add it to Google/Apple/Outlook calendar.
6. **Members list** (people icon in a group chat): add-friend per person —
   deliberately no "add all."
7. **Account tab.** Edit profile; toggle whether your Columbia email shows on
   your profile; **hide my profile** to drop out of everyone's swipe deck
   without leaving your classes; set per-category notification preferences;
   **my classes** → drop W3157 (chat membership ends, deck empties of its
   people, DMs survive) → re-add it; **archive this semester** at rollover.
8. **Block/report:** any profile → Block. They vanish from your deck; DMs
   stop. Contact info (email/Instagram/LinkedIn) only ever shows once you're
   friends with someone — never while just browsing.
9. **Delete account** (Account tab, double confirm): removes the profile,
   matches, messages, and hosted sessions, frees the email for re-signup, and
   kills the other side's DM thread. Required by App Store guideline 5.1.1(v).

### Realtime across two accounts

Open a second browser (or private window) at the same URL, sign up as a second
`@columbia.edu` address, join the same section, and DM or group-chat between the
windows — messages appear live via Supabase Realtime.

### Automated checks

```bash
npm run typecheck   # tsc --noEmit; CI-able as-is
```

---

## Repo map

```
docs/PLAN.md            product + architecture decisions (D1–D19), build phases
scripts/scrape_doc.py   Directory of Classes → JSON (see PLAN §8 for its traps)
scripts/catalog_to_sql.py   JSON → supabase/seed_catalog.sql
supabase/migrations/    schema, RLS, triggers, RPCs — append-only
supabase/seed_catalog.sql   generated Fall 2026 catalog subset (committed)
supabase/seed.sql       demo students, messages, study sessions, demo greeter
supabase/reset_demo.sql restores demo data to a clean state, real accounts untouched
src/app/                expo-router screens (tabs = directories, PLAN §7)
src/features/           shared feature components (course search/manage)
src/lib/                supabase client, auth context, theme, row types
src/lib/theme.ts        design tokens + ThemeProvider/useTheme (light + dark)
```

To widen the catalog beyond the seeded 9 subjects:

```bash
python3 scripts/scrape_doc.py --term Fall2026 --out data/
python3 scripts/catalog_to_sql.py data/courses_20263.json data/sections_20263.json
npx supabase db push --include-seed
```

## Operating the app (team runbook)

- **Announcements:** `select app_announce('text');` as postgres (SQL editor /
  psql) — lands in every user's inbox. Use it for the end-of-semester
  "archive your classes" nudge.
- **Reports:** mark your team's accounts once —
  `update profiles set is_admin = true where email in ('you@columbia.edu');`
  — and every filed report arrives in your inbox; tapping the avatar opens the
  reported profile. Removing a user is manual SQL for now.
- **Term rollover:** scrape the new term, load it, then
  `update app_settings set value = '20271' where key = 'current_term';`
  Search only ever shows the current term.
- **Push notifications:** the plumbing is live (tokens on profiles, a DB
  trigger POSTs every notification to Expo's push API). It activates the day
  you make an **EAS dev build** with a projectId — in Expo Go and on web,
  registration is a silent no-op and the in-app inbox covers everything.

## What's deliberately not here (yet)

LLM icebreakers (static list ships; swap in an Edge Function), meeting times
(the Directory stopped publishing them — sections are identified by number +
instructor + call number, see PLAN A1), in-app moderation tooling beyond
report routing, multiple profile photos (one only), and an automated test
suite (verification today is `tsc --noEmit`, a full `expo export` bundle
check, and direct queries against the hosted DB — see PLAN §6 and the git
history for what that's caught in practice).
