# Seatmates — Build Plan

Columbia-only mobile app that connects students who share classes.
Pathfinders Stellic Challenge. Team of 3.

---

## 1. What the transcript actually decided

These are settled. Don't re-litigate them in standup.

| # | Decision |
|---|---|
| D1 | Account creation is gated to `@columbia.edu` emails, verified by a code sent to that address. |
| D2 | At the start of every semester the user enters their schedule. Primary path: type a class code into a **search bar** that autocompletes the course ~~+ meeting time~~ (times are no longer published — see A1) and then pick your section. |
| D3 | You are **auto-joined** to each class group chat. No "do you want to join?" prompt. (Explicitly changed mid-conversation.) |
| D4 | Four bottom tabs: **Swipe · Chats · Study Groups · Account**. |
| D5 | Profile fields: photo, name, major, hometown, Columbia email, **optional** bio, Instagram, LinkedIn. Prompt-style questions in addition to the bio. |
| D6 | Swipe card preview shows photo + name + major + hometown. Tap to expand → bio, socials, prompts. The **shared class** is displayed on the card. |
| D7 | Mutual right-swipe → match → a 1:1 chat appears in Chats. |
| D8 | Chats tab: class group chats **pinned at top**, 1:1 chats below. |
| D9 | Group chats have an **add-friend affordance next to each person's name on their message**, plus a member list. **No "add all" button** — deliberate anti-Instagram decision. Tap any name → view their profile. |
| D10 | Sending a first message is **not** forced. Instead: a notification ("X added you as a friend") + **suggested icebreakers**. |
| D11 | Study Groups is Partiful-style: post a study session, others RSVP. |
| D12 | You only see study sessions **for classes you're in**. |
| D13 | **Rejected:** requiring you to friend the organizer before you can join a study session. |

### Resolved after the transcript

| # | Decision | Supersedes |
|---|---|---|
| D14 | **Friend requests require acceptance.** You get a notification; you accept or decline. Nobody gets a DM with you without your say-so. | A4 |
| D15 | **Group chats are per section**, not per course. | A3 |
| D16 | **Account is a bottom tab**, as originally listed. | A2 |
| D17 | **Notification inbox, top-right**, persistent across tabs. Holds friend requests (accept/decline inline) and team announcements. | new |
| D18 | Users can always **leave a group chat**, **drop a course**, or **add a course** — at any time, not just during onboarding. Leaving a chat and dropping the course are separate actions. | new |
| D19 | ~~Vergil `.ics` import.~~ **Dropped.** Course data comes from scraping the [CU Directory of Classes](https://doc.sis.columbia.edu); students search it and join the correct section. | A1 |

---

## 2. Tech stack

**Frontend — Expo (React Native) + TypeScript + expo-router**

`expo-router` gives file-based routing, which matters here for a specific reason: the four tabs become four directories, and three people can each own a directory without touching a shared navigator config file. That alone kills most of your merge conflicts.

- `nativewind` (Tailwind for RN) + one shared `theme.ts` — utility classes mean styling lives inline in the component instead of in a shared stylesheet everyone edits.
- `@tanstack/react-query` for all server state. `zustand` only for ephemeral local state (swipe deck index, composer draft).
- `react-native-reanimated` + `react-native-gesture-handler` for the swipe deck. Use a library (`rn-swiper-list` or `react-native-deck-swiper`) for v1 — a hand-rolled deck is a two-day tarpit and it is not what you're being judged on.
- `expo-image-picker` + `expo-image` for photos.

**Backend — Supabase**

One service covers Postgres + Auth + Realtime + Storage + row-level security. For a 3-person team on a deadline this is the highest-leverage choice available, and Postgres specifically matters: your core query is *"find people who share ≥1 enrollment with me, whom I haven't swiped on"*. That is one SQL join. In Firebase it's a denormalization project.

| Concern | Choice |
|---|---|
| Auth | Supabase Auth, **email OTP** (magic-code). Enforce the `columbia.edu` domain in an `auth.before_user_created` hook or a DB trigger — do **not** rely on client-side validation. |
| Database | Supabase Postgres, RLS on every table from day one. |
| Realtime chat | Supabase Realtime `postgres_changes` on `messages`. Handles a hackathon's message volume without a custom socket server. |
| File storage | Supabase Storage, one `avatars` bucket. |
| Server logic | Supabase Edge Functions (Deno) for: send push on match, send push on friend-add, generate icebreakers. |
| Push | `expo-notifications` + Expo push service, triggered from an Edge Function. **Note:** remote push does not work in Expo Go on current SDKs — you need an EAS dev build. Verify this against your SDK version early; discovering it the night before demo is a bad time. |

**Why not a custom Node/Express + Socket.io backend:** it's ~2 of your ~3 available person-weeks spent rebuilding auth, RLS, and a websocket layer that Supabase gives you configured. Take the time back and spend it on the swipe UX.

---

## 3. Data model

Sketch this together on day one, as a group, then freeze it. Everything downstream depends on it.

```
profiles          id (=auth.users.id), full_name, email, major, hometown,
                  bio?, instagram?, linkedin?, photo_url, created_at

profile_prompts   profile_id, question_key, answer          -- the "questions" from D5

courses           id, term, code ("COMS W3157"), subject, number, title,
                  department                               -- UNIQUE (term, code)
sections          id, course_id, section ("002"), call_number, instructor,
                  points, enrolled, capacity, legacy_number
                  UNIQUE (course_id, section), UNIQUE (term, call_number)
                  -- no meeting day/time/location: not published anymore, see A1

enrollments       profile_id, section_id, status ('active'|'dropped'), created_at
                  UNIQUE (profile_id, section_id)

swipes            swiper_id, swipee_id, direction, created_at
                  UNIQUE (swiper_id, swipee_id)

friend_requests   from_id, to_id, status ('pending'|'accepted'|'declined'),
                  source ('swipe'|'group_chat'), created_at, responded_at
                  UNIQUE (from_id, to_id)

matches           user_a, user_b (stored ordered, a < b), source, created_at
                  UNIQUE (user_a, user_b)                   -- created only on acceptance

conversations     id, kind ('section'|'dm'), section_id?    -- section_id set iff kind='section'
conversation_members  conversation_id, profile_id, status ('active'|'left'),
                      last_read_at, joined_at, left_at?
messages          id, conversation_id, sender_id, body, created_at

notifications     id, user_id, kind, actor_id?, entity_id?, read_at, created_at
                  -- kind: friend_request | request_accepted | new_match
                  --     | study_rsvp | announcement
announcements     id, title, body, published_at, audience ('all'|'term')

study_sessions    id, course_id, host_id, title, description,
                  location, starts_at, capacity?
rsvps             session_id, profile_id, status ('going'|'maybe')

blocks            blocker_id, blocked_id                    -- see §6
reports           reporter_id, reported_id, reason, created_at
```

Five things to get right the first time, because retrofitting them is painful:

- **`courses` and `sections` are separate tables.** Per-section group chats (D15) mean a section is a first-class entity, and enrollments point at sections, not courses. Keeping them in one table means every "same class as me" query has to decide, ad hoc, whether it means the course or the section — and you'll get it inconsistent across three developers.
- **`matches` stores the pair ordered** (`least(a,b), greatest(a,b)`) with a unique constraint. Otherwise you get duplicate match rows and duplicate chats.
- **A `matches` row is only ever created by an accepted `friend_request`** (D14). Both entry points — a mutual right-swipe and a group-chat add — write a `friend_request`. Mutual-swipe auto-accepts (both people already opted in); a group-chat add stays `pending` until the recipient taps accept. One acceptance trigger creates the match and the DM conversation, so there is exactly one code path that can produce a DM.
- **Section group chats are just `conversations` with `kind='section'`.** Do not build a separate group-chat system. One message table, one realtime subscription, one composer — the Chats tab differs only in sort order and header.
- **`conversation_members.status` is what makes "leave the chat" work** (D18). Leaving sets `status='left'`, it does not delete the row. The auto-join trigger must skip anyone with an existing `left` record, or dropping and re-adding a course silently drags them back into a chat they deliberately left. That's the kind of bug that reads as disrespectful to the user.

**Leaving vs. dropping (D18) — three distinct actions, don't collapse them:**

| Action | Effect |
|---|---|
| Leave group chat | `conversation_members.status='left'`. Still enrolled, still in the swipe pool for that section, can rejoin the chat later. |
| Drop course | `enrollments.status='dropped'` → out of the swipe pool, chat membership set to `left`, study sessions for that course hidden. |
| Add course | New `enrollment` → trigger auto-joins the section chat (unless previously `left`). Works identically at onboarding and mid-semester — same code path. |

Existing matches and DMs **survive** a drop. You met the person; the friendship isn't contingent on the registrar.

**The swipe query** (the thing the whole app hangs on):

```sql
select distinct p.*, c.code || ' §' || s.section as shared_class
from enrollments  me
join enrollments  them on them.section_id = me.section_id
                      and them.profile_id <> me.profile_id
                      and them.status = 'active'
join sections     s     on s.id = me.section_id
join courses      c     on c.id = s.course_id
join profiles     p     on p.id = them.profile_id
where me.profile_id = auth.uid()
  and me.status = 'active'
  and not exists (select 1 from swipes sw
                  where sw.swiper_id = auth.uid() and sw.swipee_id = p.id)
  and not exists (select 1 from blocks b
                  where (b.blocker_id, b.blocked_id) in ((auth.uid(), p.id), (p.id, auth.uid())))
```

Wrap it in a Postgres function and call it via RPC.

Note this matches on `section_id`, not `course_id` — same room, same hour, which is the literal meaning of the app's name and a much better icebreaker than "we're both in Intro Psych somewhere." The tradeoff is a thinner deck; see A7 for the fallback.

---

## 4. Build order

The rule: **nothing renders real data until schema + auth + enrollments exist.** An empty swipe deck is not a demo.

### Phase 0 — Scaffold (day 1, all three together, ~half a day)
Expo app + expo-router + TypeScript, Supabase project, shared `lib/supabase.ts`, `theme.ts`, `types/db.ts` (generated), tab shell with four empty screens, `AppHeader` with a dead top-right inbox icon, EAS dev build working on all three phones. Commit this as one commit before anyone branches.

### Phase 1 — Foundation *(blocks everything)*
1. **Schema + RLS migration.** All tables above.
2. **Seed course data** by running [`scripts/scrape_doc.py`](../scripts/scrape_doc.py) and loading the JSON into `courses` + `sections`. No longer a research task — see §8.
3. **Auth:** OTP flow, `columbia.edu` enforcement server-side, session persistence, auth-gated routing.

### Phase 2 — Onboarding *(blocks Swipe, Chats, Study Groups)*
4. **Profile creation:** photo upload, name, major, hometown, optional bio, socials, prompts.
5. **Schedule entry:** search-as-you-type over the scraped catalog (course code, title, or call number) → pick the course → **pick your section** → writes `enrollments`. Section choice is a required step now, not a detail: per-section chats (D15) mean picking the wrong one puts you in a room with the wrong 80 people. Same screen serves onboarding and mid-semester "add a course" (D18).
6. **Auto-join trigger:** insert into `enrollments` ⇒ upsert `conversation_members` for that section's conversation, creating the conversation if absent, **skipping anyone whose membership is already `left`**. A trigger rather than client code means it's correct for every entry path — ICS import, manual add, seed script.
7. **Schedule management:** view my courses, drop a course, add a course. Small screen, but D18 makes it core rather than a settings-page afterthought.

**Gate:** three real accounts, real sections, overlapping enrollments, visible section chats. Until this holds, everything after is built against fixtures.

### Phase 3 — The three verticals *(parallel, one owner each)*
8. **Swipe:** deck, card front/back, swipe writes, mutual-swipe detection (trigger on `swipes` → auto-accepted `friend_request` → `match` + DM), empty state for "you're done."
9. **Chats:** conversation list (section chats pinned / DMs below), message thread, realtime subscribe, composer, unread indicator, **leave-chat action**.
10. **Study Groups:** feed filtered to your enrolled courses, create-session form, RSVP toggle, attendee list.
11. **Notification inbox shell** (D17): top-right icon with unread badge, persistent in the header across all four tabs, opening a full-screen list. Build the shell in Phase 3 even though it has nothing to show yet — it's a shared header element, and retrofitting a header across four independently-owned tab directories later is exactly the merge conflict this plan is structured to avoid.

### Phase 4 — Connective tissue *(needs 2 of 3 verticals done)*
12. **Friend requests end to end** (D14): add-friend button beside a message author + member list (no add-all) → `friend_request` → notification → **accept/decline inline in the inbox** → on accept, `match` + DM + a `request_accepted` notification back to the sender.
13. **Inbox content:** friend requests with inline actions, match notifications, announcements. Mark-read on open, badge count from `read_at is null`.
14. **Announcements** (D17): team-authored broadcast rows. No admin UI for the demo — insert via SQL and let it render. Genuinely 20 minutes if the inbox already renders a list.
15. **Profile viewer:** shared modal reachable from the swipe card, a group-chat name, and an RSVP list. One component, three entry points.
16. **Push notifications:** mirror of the inbox — friend request, request accepted, new message.
17. **Icebreakers:** suggestion chips in an empty DM.

### Phase 5 — Demo hardening
14. Block + report (see §6), seed script for a believable demo dataset, empty/loading/error states, one polish pass on the swipe screen specifically — it's the screen judges will remember.

### Cut line for demo day
**Must ship:** auth, onboarding, course + section search, auto-joined section chat, swipe → request → accept → DM, notification inbox, study group post + RSVP, leave/add course.
**Cut first if behind:** push notifications (the in-app inbox badge covers the demo), LLM icebreakers (ship a static list), announcements, prompts (bio alone is fine), live enrollment counts. Keep LinkedIn/Instagram — they're text fields, 20 minutes total.

---

## 5. Unresolved — decide before the relevant phase

**A1. Course data — resolved (D19). Scraper is written and validated; see [§8](#8-the-course-data-scraper).**

One consequence needs a product decision, though: **the Directory no longer publishes meeting days, times, or locations.** Every section page says so explicitly — that data moved to Vergil, which requires a UNI login. So the transcript's "it automatically finds the class *and the time*" is not achievable from this source.

What you get instead, per section: course code, title, section number, **call number**, points, instructor, department, live enrollment/capacity. **Recommendation:** disambiguate sections in the search UI by **section number + instructor**, and support **searching by call number** directly — students register by call number in SSOL, so it's the identifier they can actually copy off their own schedule, and it's unique within a term. That's a better join key than a meeting time would have been anyway.

If you decide meeting times are essential to the experience, the only paths are an authenticated Vergil scrape (out of scope, and a ToS question you don't want during a competition) or asking users to type them in (nobody will). I'd drop the feature and lean on instructor + call number.

**A2. Study sessions: scoped to the course or the section?** New, and a direct consequence of D15. Chats are per-section, but a study group for *Advanced Programming* probably shouldn't exclude the other lecture section — study groups are the one place a wider pool helps. **Recommendation:** study sessions scope to **course**, chats and swipe scope to **section**. The schema above already reflects this (`study_sessions.course_id`, `conversations.section_id`). Confirm you agree, because it's awkward to flip later.

**A3. Study sessions: class-only, or campus-wide too?** D12 settled class-only, but "general Columbia ones" was raised and never resolved. **Recommendation:** ship class-only, leave `course_id` nullable so campus-wide becomes a one-line filter change.

**A4. Deck exhaustion.** "And then you're done" — then what? Section-level matching (D15) makes this sharper: a 25-person seminar gives you 24 cards, ever. **Recommendation:** when the section-level deck empties, widen to course-level, then to shared-department, labeling the card honestly ("also in COMS W3157, different section"). Decide this before Phase 3 — it's a query change, not a UI change, and it's cheap if C knows up front.

**A5. Icebreakers: static list or LLM-generated?** LLM-generated from two profiles' shared section and prompts is genuinely impressive in a demo. Static is 30 minutes. **Recommendation:** build the UI against a static list, swap in an Edge Function calling the Claude API if Phase 4 lands early.

**A6. Notification inbox details** (from D17): does a *declined* request notify the sender? (Recommendation: no — silent decline is kinder and is what every comparable app does.) Can someone re-request after a decline, and how often? Do announcements need read receipts? Does the badge count announcements or only actionable items?

**A7. Smaller open items:** one photo or several? What happens to last semester's chats at rollover — archive or delete? How many prompt questions, and which ones? Do you see *all* shared sections on a card or just one? Can you rejoin a section chat you left, and from where — the member list, or the schedule screen?

---

## 6. Not in the transcript, but you need it

**Block and report.** This app puts real, name-and-photo-identified undergrads in swipe and DM contexts with strangers who know their class schedule. Shipping that without a block button is a real safety gap, and it is also the first question a thoughtful judge asks. It's two tables and a menu item — cheap. The swipe query in §3 already filters on `blocks`.

Also worth 20 minutes each: a "hide my profile" toggle in Account, and not exposing hometown/socials until match. Consider whether the shared-class label should name the specific course before someone matches — it's effectively broadcasting a chunk of your schedule to strangers.

---

## 7. Splitting the work across 3 people

Split by **vertical feature slice**, with each person owning directories nobody else edits.

```
app/
  (auth)/          ── A     sign-in, OTP
  onboarding/      ── A     profile, course + section search
  (tabs)/
    swipe/         ── C
    chats/         ── B
    study/         ── C
    account/       ── A     profile edit, my courses, add/drop
  inbox/           ── B     notifications, friend requests, announcements
features/
  profile/  courses/  schedule/   ── A
  chat/     friends/  notifications/ ── B
  swipe/    study/                ── C
components/ui/       ── shared, additive only
components/AppHeader.tsx ── B owns; the top-right inbox badge lives here
lib/  supabase.ts  theme.ts  types/db.ts   ── shared, see rules
scripts/scrape_doc.py  ── A
supabase/migrations/ ── shared, see rules
```

**Person A — Identity**
Auth, OTP, domain gating, onboarding, profile create/edit, the catalog scraper + seed load, course/section search, schedule management (add/drop, D18), Account tab. *Owns the user's first four minutes in the app.* Front-loaded: A is the critical path in Phases 1–2, so A starts first and the other two work against fixtures until Phase 2 clears.

**Person B — Communication**
Conversation list, message thread, realtime, composer, unread state, section-chat member list, leave-chat, add-friend flow, friend request accept/decline, **notification inbox + `AppHeader`**, announcements, icebreakers, push. *Owns everything with a message or a notification in it.* B's load grew most with D14/D17 — if the split feels lopsided by Phase 4, move announcements or icebreakers to whoever's clear.

**Person C — Discovery**
Swipe deck, card front/back, swipe recording, mutual-swipe trigger, match celebration, Study Groups feed, create-session, RSVP. *Owns everything with a card in it.* C also owns the shared profile-viewer modal (it's mostly the swipe-card back).

**One coordination point worth naming:** the friend-request lifecycle spans all three people — C writes the request on a mutual swipe, B writes it from a group chat and renders accept/decline, and the acceptance trigger creates a conversation B renders. Agree the `friend_requests` state machine as a group when you agree the schema, and put the accept/decline logic in a single Postgres function that both B and C call. Do not let two people implement "what happens on accept."

**Conflict rules — actually follow these:**

1. **Migrations are append-only and timestamp-named.** `20260731_1430_add_rsvps.sql`. Never edit a migration someone else wrote; write a new one. This is the single most common way small teams break each other's local DB.
2. **Only one person regenerates `types/db.ts`,** and only right after a migration lands on `main`. Announce it in chat.
3. **`theme.ts` and `components/ui/` are additive only.** Add a variant; don't restyle someone else's. Anyone who wants a shared component changed asks the owner rather than editing.
4. **Never edit a file in someone else's directory.** Need a change there? Ask them. Cross-directory edits are where three-way merges go bad.
5. **Small PRs, merge daily.** Long-lived branches on a shared schema are how you lose a day to a merge two nights before demo.
6. Day-one schema design is a **group** activity. It's the one shared artifact all three verticals depend on, and an hour together up front is cheaper than three conflicting mental models.

**Dependency reality:** Phases 1–2 are almost entirely A's. Rather than have B and C idle, have them build their screens against a local fixtures module (`features/*/fixtures.ts`) exporting fake profiles/messages/sessions with the exact shape of the real types. When Phase 2 lands, they swap the fixture import for a React Query hook. Agree on the TypeScript types on day one and this swap is genuinely a one-line change per screen.

---

## 8. The course-data scraper

[`scripts/scrape_doc.py`](../scripts/scrape_doc.py) — written, run, and validated against the live site.

**Source structure** (all static HTML, no JS, no auth, no `robots.txt`):

```
/sel/subjects.html                index of every {subject, term} listing page
/subj/{SUBJ}/_{Term}{Year}.html   one page per subject per term, every section on it
/subj/{SUBJ}/{NUM}-{TERM}-{SEC}/  per-section detail page, adds course description
```

Term codes are `<year><1=Spring|2=Summer|3=Fall>` — Fall 2026 is `20263`. As of this
writing the index carries **321 subjects for Fall 2026** (plus Summer 2026 and
Spring 2027), so a full term is ~321 requests at the listing level. At 0.5s politeness
delay that's under four minutes. Descriptions would require one request per *section*
(~15–30k); skip them unless you want them on the swipe card.

```bash
python3 scripts/scrape_doc.py --term Fall2026 --out data/
```

**Validated on 9 subjects / 909 sections:** zero missing titles, call numbers, or
section numbers; zero duplicate call numbers; zero unparsed course headers.

### Three traps in this data, all of which bit the first draft

1. **The header number and the URL number are different numbers.** `MATH UN1101`
   lives at `.../V1101-20263-001/`. In the sample, **549 of 645** sections had a
   mismatch — it's the common case, not an edge case. Students know the header form
   (it's what SSOL and Vergil show), so that's what `courses.code` stores; the legacy
   number is kept only for building detail URLs. Deriving one from the other is not
   possible.
2. **Course number formats vary more than they appear to.** `W3157`, `UN1101`,
   `GU4032`, and `N03P_` (medical-center subjects) all coexist. The first draft
   pattern-matched `[A-Z]?\d{4}[A-Z]?` and returned **zero rows for five of six
   subjects, with no error** — an empty subject page looks exactly like a successful
   parse. The scraper now takes the last token of the header instead of matching a
   shape, and reports any header it couldn't turn into rows. If you touch the parser,
   keep that property: **silence is the dangerous failure mode here.**
3. **Subject codes are underscore-padded to four chars in URLs** — `AM__`, `AM__`,
   not `AM`. Strip trailing underscores for display, keep them for fetching.

### Operating it

- **Enrollment counts go stale.** They're live in the source (`246 students (398 max)
  as of 12:05PM Friday, July 31, 2026`). If you show them, re-scrape nightly; if you
  don't, drop the columns and scrape once.
- **Re-scrape at term rollover.** `subjects.html` advertises which terms exist, so the
  script discovers new terms without a code change.
- **Be a good citizen.** Keep the delay, keep the descriptive User-Agent, don't
  parallelize it. This is a university server run by people who may end up looking at
  your project.
- **Sections your users reference but you haven't scraped** shouldn't hard-fail the
  enrollment flow. Either scrape all 321 subjects up front (cheap — do this) or let
  the search fall back to an on-demand fetch of that one subject page.
