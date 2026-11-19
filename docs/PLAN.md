# TKP Hub Admin Web: build plan

_Drafted 2026-11-18 for approval. Sources: `docs/HANDOFF-ADMIN.md`, the PRD in `docs/`, the client repo `../integration-app` (`harris-consult/` docs and `code/`), and the Figma file `tftEO6O0fcSeIWzEZzHcv6`._

---

## 1. Decisions recorded

| # | Decision | Date |
|---|---|---|
| D1 | We build the **front end of the web admin console only**. The backend team builds the API from the user's code; the mobile app and member portal come later. | 2026-11-18 |
| D2 | Stack: **React + TypeScript**. One standalone repo, no monorepo. | 2026-11-18 |
| D3 | **Modules that exist in the client repo** (Welcome, Connect, Scripts, LCM, sign-in): replicate the front end **behaviour exactly as it is**. Only the look and feel changes. Where the repo and the PRD disagree, the repo wins. | 2026-11-18 |
| D4 | **Modules the repo does not cover**: build them from the PRD. | 2026-11-18 |
| D5 | **Build order: the `integration-app` modules first** (TKP Connect: sign-in, Welcome, Connect, Scripts, LCM). Then the PRD modules for the remaining sidebar items. 168 Hours of Praise comes later with the other PRD modules (corrected 2026-11-18). | 2026-11-18 |
| D6 | Navigation: the Figma sidebar, built from permissions. Inside Welcome and Connect, the repo's tabs stay as they are. | 2026-11-18 |
| D8 | **Guest PDF export is enabled**, following the PRD (W-9), not the repo's disabled button (FI-40). Every other repo-vs-PRD conflict follows the repo (see the appendix) | 2026-11-18 |
| D7 | Look: the Figma "TKP Hub" visual system (maroon, cream, gold), keeping the repo's **colour meanings** (status, cell group, charcoal phases, gold Save log) and the wording that must not change. | 2026-11-18 |

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite** + React 19 + TypeScript (strict) | A plain single-page app. It needs no server, because the API is separate |
| Routing | React Router (data routers) | Route guards and lazy-loaded modules |
| Server state | TanStack Query | Caching, paging and retries; optimistic updates with rollback on 409 |
| Forms | react-hook-form + Zod 4 | Same as the form project. Schemas are shared with `api.ts` |
| Styling | Tailwind v4, tokens in `@theme`, `cursor: pointer` rule in `@layer base` | Standing preference; canonical classes |
| Motion | `motion/react` | Same as the form project |
| Charts | Recharts | Animated and simple. Covers the repo's bars, stacked bars and gauges |
| Maps (LCM) | react-leaflet, without a street-map background | The repo uses Leaflet, and the client decided against street maps on Nov 9 |
| Big grid (168HOP) | TanStack Table + TanStack Virtual | 168 rows or more, with inline editing and autosave |
| Spreadsheet import (mock side) | SheetJS | Previews and maps the workbook columns; the real parsing is on the server |
| Mocks | **MSW** (Mock Service Worker) | `api.ts` makes real `fetch` calls, so switching to the real backend only means changing `VITE_API_BASE_URL` and `VITE_USE_MOCKS` |
| Tests | Vitest + Testing Library; Playwright for checks at 375, 768 and 1280 px | The repo's acceptance tests (FI-xx) become test cases |
| 3D (optional) | R3F only in the sign-in hero | Never on work screens |

## 3. Project structure

```
src/
  app/            router.tsx, providers.tsx, AppShell (sidebar, top bar, role switcher), NoAccess, NotFound
  lib/
    api.ts        the only module that calls fetch; base URL, error envelope, clientRequestId, ETag/rowVer
    errors.ts     ApiError type and helpers for mapping field errors into react-hook-form
    permissions.ts  role templates → permission keys; can(), useCan(), <Guard>
    time.ts       UTC ↔ America/Chicago, service-date helpers
    motion.ts     shared variants and durations; reduced-motion aware
  components/ui/  Button, Chip, Tile, CountUp, Tabs, Dialog, Drawer, Sheet, DataTable, Pager,
                  Toast (with undo), Skeleton, EmptyState, ConfidentialChip, Tooltip, OptionButton, MultiOption
  features/
    auth/  dashboard/  welcome/  connect/  events/  learn/  projects/  prayer/  qr/  admin/  reports/
      each holds: routes.tsx · pages/ · components/ · queries.ts (TanStack hooks) · schema.ts (Zod)
  mocks/
    browser.ts    MSW worker setup
    db.ts         in-memory store, seeded deterministically
    seed/         factories per entity (fictional people only: 555 phone numbers, example.com addresses)
    handlers/     one file per module; they mirror docs/API.md exactly
  styles/globals.css
docs/  HANDOFF-ADMIN.md · PLAN.md · API.md · ROLES.md
```

Route names follow the repo's pages, so the backend developer and TKP can match them up: `/welcome`, `/welcome/lookup`, `/welcome/lcm`, `/connect/queue`, `/connect/log/:journeyId`, `/connect/scripts`, then `/events`, `/learn`, `/projects`, `/prayer`, `/qr`, `/admin/users`, `/admin/audit`, `/reports`.

## 4. Roles and permissions

**Model.** The UI never checks role names. It checks **permission keys** (`welcome.overview.view`, `connect.log.save`, `event.schedule.edit` and so on). Roles are templates that bundle keys. This meets the repo's AC-08 ("rules live in one place") and the PRD's "menus are built from permissions".

**People.** A user has `roles[]` and a `connectTeam` (`church_office`, `integration` or `both`, or none). The 11 repo roles behave exactly as described in the repo's doc 02. The PRD allows several roles per person; with the repo's single role, `roles` has one item and the role switcher stays hidden.

### 4.1 Welcome and Connect: the repo's matrix, unchanged

This is copied from `integration-app/harris-consult/02-roles-and-access.md` §2. Every cell becomes a test.

| Role | Overview | Lookup | LCM | Work queue | Log follow-up | Scripts |
|---|---|---|---|---|---|---|
| Tech Admin | V | V | V | V E A · both teams | reads all, saves Mine | V |
| Tech Team | V | V | V | V · both teams | reads all, no save | V |
| Lead Pastor | V | V | V | V E A · both teams | reads all, saves Mine | V |
| Church Admin | V | V | V | V E A · both teams | reads all, no save | V |
| Church Office Admin | V | V | V | V E A · Team | reads Team, saves Mine | V |
| Church Office | V | V | V | V · Mine | Mine | V |
| Integration Admin | V | V | V | V E A · Team | reads Team, saves Mine | V |
| Integration Team | V | V | — | V · Mine | Mine | V |
| Welcome Lead | V | V | V | — | — | — |
| Welcome Team | V | V | — | — | — | — |
| TKP Member | — | — | — | — | — | — |

The rules AC-01 to AC-07 apply, and so does the exact Access Denied wording. **Guest PDF export is enabled** (D8). This replaces the repo's FI-40, where the button is disabled; which roles may export is still to be confirmed, and every export is logged.

### 4.2 New modules (from the PRD)

| Module | Full edit | View | Notes |
|---|---|---|---|
| Events / 168HOP | Tech Admin (system_admin), Church Admin | Lead Pastor (totals only: `event.view_summary`), Tech Team | Scoped grants on each event: Event owner, Programme coordinator, Music coordinator, Duty manager (with an expiry), Event viewer. Contacts and honorarium have their own keys |
| Learn (Registrar console) | **Registrar** (new role), Course author, Grader | Church Admin (view and export, never edits grades) | Answer keys are visible only to the Registrar and the authors |
| Projects | Tech Admin, Church Admin, **Project lead** (own projects) | Lead Pastor, Tech Team | |
| Prayer Wall moderation | Tech Admin, Church Admin, Prayer moderator | Tech Team | |
| QR codes | Tech Admin, Church Admin | Tech Team | |
| Users, roles, audit, settings | Tech Admin | Tech Team (audit only) | |
| Reports hub | Tech Admin, Church Admin | Lead Pastor (totals; groups smaller than 5 hidden) | PRD §7.2 rules |

New roles added beyond the repo's 11: Registrar, Course author, Grader, Project lead, Prayer moderator. Event roles are grants on a single event, not roles.

## 5. Modules and build order

Today is **Wednesday, Nov 18**. Dates after M0 are estimates, to be firmed up once the foundation is in.

**Part 1: replicate `integration-app` (TKP Connect).** Every FI row in the repo's doc 07 must pass before the temporary app can be retired. That also needs three Sundays of parallel use.

| Milestone | Scope | Source |
|---|---|---|
| **M0 Foundation** (Nov 18–24) | Scaffold, design tokens taken from Figma, the UI kit, AppShell (sidebar built from permissions, NoAccess, Access Denied wording), `permissions.ts`, `api.ts`, MSW | Repo + Figma |
| **M1 Sign-in and accounts** | Email + password with one error message for every failure, "Forgot password?" panel, password rules checklist, session renewal and ceiling, Change password, TKP Member home | Repo FI-01–04, PL-06, PL-13 |
| **M2 Connect** | Work queue (team switch, service-date filter, tiles, name buttons, assignment, row actions, 48h overdue rule); Log follow-up in the Church Office and Integration views; checklist; scripts side panel; Previous/Next guest; save rules (idempotent, 409 on conflict); view-only mode; Logs table; Scripts library (all 15 scripts, word for word) | Repo FI-50–70 |
| **M3 Welcome** | Overview (date control, 10 tiles, cell tiles, stacked chart with drill-down); Guest lookup with the drawer; View entry pop-up; **guest PDF export (D8)** | Repo FI-30–36 |
| **M4 LCM** | LCM Metrics, Map 1 and Map 2 | Repo FI-37–40 |
| M5 Repo planned tabs | Guest journey, Phase board, Guest Track, Team metrics | Repo PL-02–05 (once their designs and rules are agreed) |

Connect goes before Welcome because it is the daily working tool, and the repo designs it phone-first. If you'd rather follow the repo's journey order (Welcome first), it's a simple swap.

**Part 2: the remaining sidebar modules, from the PRD,** in the PRD's delivery order.

| Milestone | Scope | Source |
|---|---|---|
| M6 Admin | Role dashboards (the Figma dashboard becomes the Church Admin home), users and roles, audit log, settings, MFA for staff | PRD + Figma |
| M7 PRD additions to Welcome and Connect | QR code manager, ZIP→cell and services managers, import wizard, duplicate merge, Reports hub | PRD W-, C-, QR- |
| M8 Belong and Grow | Learn admin: Registrar console, course and exam builders, grading queue, certificates | Figma Grow screens + PRD |
| M9 Care and Serve | Prayer Wall moderation, Projects (positions, bulk upload, applicant review) | PRD PR-, P- |
| M10 Events / 168 Hours of Praise | Slices A (programme builder, import, exports), B and C (admin parts) | PRD EV- |
| M11 Lead, Go, Transform | Leadership and executive views | PRD |

## 6. Figma → workflow mapping

| Figma frame | Becomes | Notes |
|---|---|---|
| `125:4815` Admin Dashboard | Shell and sidebar for every page; the Church Admin / Tech Admin home | Menu items appear only when the user has the permission. "New Member Connect" in the sidebar opens Welcome and Connect with the repo's tabs. The dashboard tiles use repo data: Total guests, Contacted within 48h, 48h overdue, plus the cell-group card using the **repo's cell names (Red, Yellow, Blue, Green)**, not the Figma placeholders |
| `180:5527` Member Dashboard | Not in scope | Belongs to the member portal |
| `135:*` Grow screens (Grow Dashboard, Class Management, Assessment Builder, Mark Attendance, Certificate Review, Forum, …) | M7 Learn admin | Mapped one-to-one to the PRD's LMS and Registrar requirements |
| `54:30` "New Member Connect" section (black sidebar) | **Not followed** | The rejected earlier build. Reused only for component ideas |
| Welcome, Connect, LCM, View entry (no Figma frames) | The repo's approved HTML mockups, restyled in the Figma system | Layout and wording follow the mockups and the live app; tokens follow Figma |
| Events / 168HOP (no Figma frames) | Designed by us in the Figma system | Screenshots shared for sign-off before M10 |

Phone widths: every Connect screen passes at **375 px** with no horizontal scrolling (FI-11). The rest of the console is desktop-first and still usable at 768 and 375 px. On phones, the sidebar becomes a drawer.

## 7. Where animation adds value

All motion is 150–300 ms and switches off when `prefers-reduced-motion` is set.

- **Shell:** page and tab cross-fades; the sidebar active indicator slides between items (`layoutId`); the drawer slides in on phones.
- **Dashboards:** tile numbers count up; charts draw in; the stacked bar animates when you drill into a month.
- **Work queue:** tile counts change smoothly when a name button filters the list; rows enter staggered; a row that leaves after a save collapses out; the assignment menu shows a success tick.
- **Log follow-up:** the outcome options animate when the method changes; the checklist "✓ by name · date" line appears; the gold Save log button turns into a tick; toasts ("Log saved · journey closed") include Undo only where the repo allows it (not after a close).
- **View entry / drawer:** spring slide-in; the Previous/Next content slides sideways.
- **168HOP grid:** autosave status ("Saving… / Saved") per row; clash warnings shake gently; the import wizard's step indicator; preview rows fade in.
- **Drag and drop:** band line-ups and slot participants (reordering), and cover-shift assignment. **No drag between Connect phases**, because the repo moves phases only on "Phase n Complete" ticks (BR-12).
- **Loading:** skeletons instead of spinners everywhere.

## 8. Mock data and API

- `api.ts` uses `VITE_API_BASE_URL`. Every request carries a session token. Writes carry a `clientRequestId`, and conflict-checked writes carry `rowVer`.
- **Error envelope**, from the handoff: `{ "error": { "code", "message", "fields" } }`. The repo's API returns `{ "error": "message" }`. Since our backend team is building a new API, we use the handoff envelope and document it in `docs/API.md`.
- **Paging:** `{ items, page, pageSize, total }`. Filtering and sorting happen on the server.
- Seed: 2 years of fictional guests (from Jan 21, 2024, as in the repo), about 6 per service date, cell groups chosen by the repo's 16 ZIPs; staff for all 11 roles plus the new ones; a 168HOP 2026 event with 168 slots, bands, a directory and cover shifts.

Main entities (front-end view; the backend decides the storage):

| Entity | Key fields |
|---|---|
| `User` | id, name, email, roles[], connectTeam, isActive, eventGrants[] |
| `GuestEntry` | id, serviceDate, serviceType, the form project's submission payload (`toSubmissionPayload` shape), personKey, cell, zip, city/state |
| `Journey` | id, personKey, firstEntryId, latestServiceDate, state (Active / Completed / Closed), closedReason, phase (1–3), week, overdue48h, churchOfficeAssigneeId, integrationAssigneeId, rowVer |
| `FollowUpLog` | id, journeyId, team, authorId, method, outcome(s), membership, department, note, sopStep, nextAction, returnedOn, createdAt, clientRequestId |
| `ChecklistTick` | journeyId, phase, item, doneBy, doneAt |
| `Script` | id, team, phase, channel, checklistItem, title, body with placeholders |
| `Event` | id, type, title, edition, startUtc, endUtc, timeZone, slotMinutes, status, publishAt, templateId, version |
| `Slot` | id, eventId, startUtc, endUtc, title, slotType, status, isPublic, participants[], bandId, backup[], version |
| `DirectoryPerson`, `Band`, `BandPosition`, `CoverShift`, `ImportBatch` | as in PRD §5.9 |
| `AuditEntry` | id, actorId, action, target, at, meta |

## 9. Risks and open items

1. **168 Hours of Praise 2026 (Dec 24) will run on the team's existing workbook.** With 168HOP in M10, the module is aimed at the 2027 edition, which is the PRD's own fallback.
2. **No Figma frames for 168HOP or for Welcome and Connect.** I design them in the Figma system and share screenshots for quick sign-off.
3. **Product owner questions** for where the PRD departs from the repo. We follow the repo until they answer (see the appendix).
4. The 15 script texts, the checklist item names and the outcome labels are copied word for word from the repo's Appendix A and doc 01.

## Appendix: questions to send to the product owner (Gideon Dare)

These are places where the PRD differs from the live app. We will build the repo's behaviour unless the product owner says otherwise.

1. Roles: the PRD has 15 role keys, allows several roles per person, and has no Church Office roles. Should we keep the repo's 11 roles and add Registrar, Course author, Grader, Project lead and Prayer moderator?
2. Connect stages: the PRD adds Guest Track, Integrated and **Paused** after 3 failed attempts. The repo stays Active (Q9). Is Paused wanted?
3. Log outcomes: the PRD uses the follow-up tracker's Reached / No Answer / Left Voicemail / Wrong Number, plus Follow-up needed with a due date. Should we keep the repo's outcomes, which change with the method?
4. Work queue tiles: the PRD's Awaiting first contact / Due today / Returned / Paused / Handoffs due, or the repo's tiles?
5. Automatic assignment (round robin or by cell): the PRD says must; the repo's Q7 says by hand.
6. Lead Pastor: the PRD's `pastor_exec` sees totals only; the repo's Lead Pastor sees names and assigns guests.
7. Same-person matching: the PRD says never by name alone; the repo uses the phone, or else first + last name.
8. Guest PDF export: the PRD says DONE and must-have; the repo keeps it disabled. **Harris Consult's position: enable it** (D8). Ask which roles may export.
9. Ratings scale: the PRD says 1–10; the repo says 0–10.
