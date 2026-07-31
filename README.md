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

---

## Run it

### 0. Prerequisites

- Node 20+ (`node --version`)
- **Docker Desktop** — only for the local backend path below
  ([docker.com](https://www.docker.com/products/docker-desktop/)); the Supabase
  CLI is already a dev dependency, no separate install
- A phone with **Expo Go**, or an iOS simulator / Android emulator, or just a
  browser (`w` in the Expo CLI)

```bash
npm install
```

### 1. Backend — pick one

**Option A: local (recommended for dev — free, resettable, fake email inbox)**

```bash
npm run db:start
```

First run downloads Docker images (a few minutes). When it finishes it prints
the stack's URLs and keys. Then:

```bash
cp .env.example .env
```

Paste the printed **anon key** into `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The URL in
the example file (`http://127.0.0.1:54321`) is already correct for simulators
and web on this machine.

`db:start` applies every migration and seed automatically. If you ever want a
factory reset (fresh schema + catalog + demo data):

```bash
npm run db:reset
```

**Option B: hosted (needed for a multi-device demo)**

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Link and push the schema + seeds:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --include-seed
   ```
3. Put the project's URL and anon key (Project Settings → API) in `.env`.
4. Auth → Providers → Email: make sure **Email OTP** is enabled. The hosted
   free tier sends ~2 emails/hour through the built-in mailer — enough to test,
   but wire up a free Resend/SMTP key in Auth → SMTP before demo day.

### 2. App

```bash
npx expo start
```

- `w` → web browser (fastest loop)
- `i` → iOS simulator
- Scan the QR in **Expo Go** for a real phone. Phone + local backend: your phone
  can't reach `127.0.0.1` — set `EXPO_PUBLIC_SUPABASE_URL` to your Mac's LAN IP
  (`ipconfig getifaddr en0`), e.g. `http://192.168.1.20:54321`, and restart
  `expo start`.

If the app shows "Almost there," `.env` is missing or empty — env vars are baked
in at bundle time, so restart `expo start` after editing it.

---

## Test it

### Sign-in (local backend)

Sign up with **any** address ending in `@columbia.edu` — it doesn't need to
exist. The local stack traps all outgoing email in a fake inbox at
**http://127.0.0.1:54324** — open it, find the message, type the 6-digit code
into the app. (Non-Columbia addresses are rejected twice: in the UI and by a
database trigger.)

### The seeded world

`db:reset` gives you a Fall 2026 catalog (9 subjects, ~900 sections) and eight
demo students — Emma, Liam, Sofia, Noah, Maya, Tariq, Leona, Diego — enrolled
across **COMS W3157, COMS W3134, MATH UN1101, ECON UN1105, PSYC UN1001,
HIST UN1786, ENGL BC1068, BIOL UN2005**, with live-looking chatter in the
COMS W3157 §001 and MATH UN1101 §001 group chats and four upcoming study
sessions.

The seed also installs a **demo greeter**: the moment you enroll in a section
with demo classmates, two of them right-swipe you and one sends you a friend
request. That means a single account can exercise every flow with no second
device.

### Ten-minute walkthrough

1. **Onboard.** Sign in → fill the profile (photo optional) → search `W3157`
   or `3157` or a call number like `13536` → join **COMS W3157 §001** → Done.
2. **Chats tab.** You're already in *COMS W3157 §001* (auto-join trigger) with
   seeded messages. Send one.
3. **Inbox (bell, top right).** A demo classmate has sent you a friend request.
   **Accept** → open the DM → tap an icebreaker chip → send.
4. **Swipe tab.** Cards show the class you share. Swipe right on everyone —
   one of them already right-swiped you, so you'll hit the 🎉 connect screen.
   *Say hi* opens the DM.
5. **Study tab.** RSVP to "AP midterm grind." Post your own session — everyone
   in the course (any section) sees it.
6. **Members list** (people icon in a group chat): add-friend per person —
   deliberately no "add all."
7. **Account tab.** Edit profile; **My classes** → drop W3157 (chat membership
   ends, deck empties of its people, DMs survive) → re-add it.
8. **Block/report:** any profile → Block. They vanish from your deck; DMs stop.

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
src/app/                expo-router screens (tabs = directories, PLAN §7)
src/features/           shared feature components (course search/manage)
src/lib/                supabase client, auth context, theme, row types
```

To widen the catalog beyond the seeded 9 subjects:

```bash
python3 scripts/scrape_doc.py --term Fall2026 --out data/
python3 scripts/catalog_to_sql.py data/courses_20263.json data/sections_20263.json
npm run db:reset
```

## What's deliberately not here (yet)

Push notifications (in-app inbox badge covers the demo; needs an EAS dev
build), LLM icebreakers (static list ships; swap in an Edge Function), profile
prompt questions, meeting times (the Directory stopped publishing them —
sections are identified by number + instructor + call number, see PLAN A1),
announcements UI (insert via `select app_announce('…')` as postgres).
