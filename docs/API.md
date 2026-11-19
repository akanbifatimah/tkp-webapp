# TKP Hub Admin: API contract (front end ↔ backend)

This is what the admin front end calls. The mock layer (`src/mocks/handlers/`) implements exactly this, so the backend can be checked against it. Sections are added module by module.

Behaviour follows TKP Connect's spec where it exists (`integration-app/harris-consult/04-app-functions-and-api.md`, IDs such as API-A1 are quoted). Where this contract differs from TKP Connect, it says so.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `VITE_API_BASE_URL`, default `/api/v1`. All paths below are relative to it |
| Format | JSON in and out, UTF-8. Field names in camelCase |
| Auth | `Authorization: Bearer <token>` on every call except sign-in and `GET /settings/public` |
| Times | ISO 8601 in UTC (`2026-11-15T20:05:00Z`). The front end shows church time (America/Chicago). Calendar dates such as a service date are `YYYY-MM-DD` |
| Idempotency | Writes that must not double up (Save log, assignments) send `Idempotency-Key: <uuid>`. A repeat with the same key returns the first result (TKP Connect BR-18) |
| Concurrency | Records that can be edited by two people carry `rowVer`. Send it back on save; a stale value returns **409 `CONFLICT`** (BR-19) |
| Paging | List endpoints take `page` (from 1) and `pageSize`, and return `{ "items": [], "page": 1, "pageSize": 25, "total": 0 }`. Filtering and sorting happen on the server |
| Auditing | The server writes the audit row (sign-ins, searches, guest views, assignments, saves, exports: FI-09). The front end never writes audit rows itself |

### Error envelope

Every error response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Friendly text the front end can show as is",
    "fields": { "contact.phone": ["Too short"] }
  }
}
```

`fields` is optional and keyed by the request field's path. **Differs from TKP Connect**, which returns `{ "error": "message" }`; the front end still reads that form if it arrives.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `UNAUTHENTICATED` / `INVALID_CREDENTIALS` | No valid session, or sign-in failed. On 401 the front end ends the session and shows Sign in, then returns to the page (UI-G6) |
| 403 | `FORBIDDEN` / `MUST_CHANGE_PASSWORD` | Signed in but not allowed (API-A7 for the second) |
| 404 | `NOT_FOUND` | |
| 409 | `CONFLICT` | Stale `rowVer`, or the record changed state (e.g. journey closed) |
| 422 | `VALIDATION_FAILED` | With `fields` |
| 5xx | `SERVER_ERROR` | The front end shows the message and keeps what the person typed (UI-G4) |

---

## 2. Sign-in and session

### `POST /auth/sign-in`

API-A1. One message for every failure, including inactive people.

Request:

```json
{ "email": "grace.adeyemi@example.com", "password": "••••••••" }
```

200:

```json
{
  "token": "<opaque or JWT>",
  "expiresAt": "2026-11-18T21:05:00Z",
  "member": {
    "id": "u01",
    "fullName": "Grace Adeyemi",
    "email": "grace.adeyemi@example.com",
    "roles": ["tech_admin"],
    "connectTeam": "integration",
    "isTeamAdmin": false,
    "mustChangePassword": false
  }
}
```

401: `{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" } }`

**`member` differs from TKP Connect's API-A8** in one way: `roles` is an array (the PRD allows several roles per person; the front end shows a role switcher when there is more than one). TKP Connect people have exactly one.

| Field | Values |
|---|---|
| `roles[]` | `tech_admin`, `tech_team`, `lead_pastor`, `church_admin`, `church_office_admin`, `church_office`, `integration_admin`, `integration_team`, `welcome_lead`, `welcome_team`, `tkp_member`, and for the PRD modules `registrar`, `course_author`, `grader`, `project_lead`, `prayer_moderator` |
| `connectTeam` | `church_office`, `integration`, `both`, or `null` (doc 02) |
| `isTeamAdmin` | true for Church Office Admin and Integration Admin |

### `POST /auth/token/renew`

API-A2. The token lasts 1 hour; the front end renews it 5 minutes before expiry. The server refuses renewal past the 12-hour ceiling from the original sign-in (401). Response: same as sign-in.

### `POST /auth/sign-out`

204. Ends the session on the server.

### `GET /me`

API-A3/A8. Re-reads the person on every call; a deactivated person or a revoked session gets 401.

200: `{ "member": { …same as above… } }`

### `POST /auth/change-password`

TKP Connect `auth-change-password` (API-A5, A6). Allowed while a temporary password is still in use.

Request: `{ "currentPassword": "…", "newPassword": "…" }`

200: `{ "signedOut": true }`. The server stamps the person's sessions-revoked time, so **every** session ends, including this one, and the person signs in again (API-A6). It also clears `mustChangePassword` and writes the audit row `password.change`.

| Status | `code` | `message` | Notes |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Current and new password are required | |
| 403 | `WRONG_PASSWORD` | Your current password is not correct | 403, not 401: the person is signed in, and a 401 would end the session and lose the form |
| 422 | `PASSWORD_RULES` | That password does not meet the requirements | Also returns `fields.newPassword` (the rule labels) and `failed: [{ "key", "label" }]` |
| 422 | `SAME_PASSWORD` | That is already your password. Please choose a different one. | |

**Password rules** (server-side; the page shows them as a live checklist). The keys match TKP Connect's `shared/password-policy.js`:

| `key` | Rule |
|---|---|
| `len` | At least 8 characters |
| `case` | One uppercase and one lowercase letter |
| `num` | One number |
| `sym` | One symbol (! ? # $ and so on) |
| `deny` | Not built on a password you were given. Matched case-insensitively as a substring against the issued-password list (`temppass123`, `welcome2026`, `tkpconnect`) |

**Differs from TKP Connect:** TKP Connect returns 400 `{ "error": "…", "failed": [...] }`; here it is 422 inside the error envelope.

### Temporary passwords (API-A7)

When the Tech Admin issues a temporary password, `member.mustChangePassword` is `true`. While it is, every route **except** `POST /auth/change-password`, `POST /auth/token/renew` and `GET /me` answers:

`403 { "error": { "code": "MUST_CHANGE_PASSWORD", "message": "Choose your own password before you continue." } }`

The front end sends the person to `/account/password` before anything else. TKP Connect built this rule but switched it off until an in-app *Change password* button existed (PL-06). TKP Hub has that button, so the rule is **on**.

### `GET /settings/public`

No auth. For the *Forgot password?* panel (UI-S1: no self-service reset).

200: `{ "resetContact": "Grace Adeyemi", "resetRelay": "Joy Ibekwe" }` (`resetRelay` may be `null`).

### Token storage (for the backend team to decide)

The front end keeps the token in memory, mirrored to `sessionStorage` so a reload keeps the session and closing the tab ends it. If the backend prefers an **httpOnly cookie** (closer to TKP Connect's API-A4), the front end already sends `credentials: "include"`; only `src/lib/session.ts` would change.

---

## 3. Connect

Follows TKP Connect API-C1…C6 (`integration-app/harris-consult/04-app-functions-and-api.md`). The behaviour and every refusal message are the live app's. The mock server in `src/mocks/connect-api.ts` implements all of it, and `src/mocks/connect-api.test.ts` lists the expected behaviour as tests (FI-50…FI-70).

**Differs from TKP Connect in naming only:**
- `team` is `church_office` or `integration`, not "Church Office" / "Integration Team".
- People ids are strings.
- Errors use the envelope in §1. Codes are listed per endpoint; the messages are TKP Connect's.

**Who may do what** (doc 02):
- Whole-team roles (Tech Admin, Tech Team, Lead Pastor, Church Admin) open both teams and see every guest.
- Team admins see every guest of their own team.
- Everyone else sees only guests assigned to them.
- Only the assignee for a team saves a log.
- A team role without a follow-up team gets `403 NO_FOLLOW_UP_TEAM` "You are not on a follow-up team yet. Ask the team lead to add you."
- Roles without Connect get `403 FORBIDDEN` "Access Denied, restricted to the church office or integration team members only".

### `GET /connect/queue?team=&date=` (API-C1)

`date` is `YYYY-MM-DD` or `all`. The default is the **latest service date that has Active journeys**. Rows are Active journeys only, ordered by service date (newest first), last name, then first name. Capped at 1,500 (`truncated`).

```json
{
  "me": { "id": "u08", "fullName": "Joy Ibekwe" },
  "team": "integration", "teams": ["integration"], "date": "2026-11-15", "dates": ["2026-11-15", "2026-11-08"],
  "seesWholeTeam": true, "canAssign": true,
  "members": [{ "id": "u09", "fullName": "Tobi Martins", "isTeamAdmin": false }],
  "totalGuests": 8, "truncated": false,
  "rows": [{
    "connectId": 106, "guestId": 5106, "serviceDate": "2026-11-15", "serviceType": "Sunday 1st Service",
    "firstName": "Victor", "lastName": "Harris", "phone": "(281) 555-0139", "cellGroup": "Red",
    "clockStartAt": "2026-11-15T16:42:00Z", "status": "Active", "phase": 1, "weekNo": 1,
    "coMemberId": "u06", "coName": "Lydia Fashola", "itMemberId": "u10", "itName": "Hannah Greene",
    "coContacted": false, "coAttempts": 0, "coLastCallOutcome": null, "coNextAction": null,
    "itContacted": true, "done": { "p1": 2, "p2": 0, "p3": 0 }, "overdue48": false, "returned2ndVisit": false
  }]
}
```

- `weekNo` follows BR-15: whole weeks since the service date + 1, in church time.
- `overdue48` follows BR-13: Active, Phase 1, no *48 Hr Welcome* tick, more than 48 h since `clockStartAt`.
- `coContacted` means at least one saved Church Office log.

### `POST /connect/assign` (API-C2)

Request: `{ "connectId": 106, "team": "integration", "memberId": "u09" }`. `memberId: null` un-assigns.

200: `{ connectId, coMemberId, coName, itMemberId, itName }`. Audited as `connect.assign`.

| Status | `code` | Message |
|---|---|---|
| 403 | `FORBIDDEN` | Only the team admin can assign guests. |
| 400 | `BAD_REQUEST` | That person is not on this team. |
| 404 | `NOT_FOUND` | Guest not found in Connect. |

### `GET /connect/guests/{connectId}?team=` (API-C3)

200: `{ me, team, teams, canSave, guest, myList }`.

- `canSave` is true only for the assignee of that team while the journey is Active.
- `guest` holds the queue-row fields plus:
  - `closedReason`
  - `state`: `coWantsMembership`, `coNoReason`, `coNoOtherDetails`, `coNextAction`, `itMembership`, `itWorkforce`, `itDepartmentId`, `itLifeGroup`, `multi{SpBelieversClass…OtNotApplicable}`, `returned2ndVisit`, `returnVisitDate`
  - `checklist`: each of the 15 step keys → `{ at, byId, by }` or `null`
  - `coNote`: the latest Church Office log
  - `legacyNotes[]`
  - `returnDates[]`: up to 26 service dates after the first visit
  - `rowVer`
- `myList` is the caller's own Active guests on the same service date, in queue order. It drives Previous / Next.

Audited as `connect.guest.view`. The prayer request is never included (BR-30).

### `POST /connect/log` (API-C4)

The browser sends an `Idempotency-Key` header with the same value as `clientRequestId`.

```json
{
  "connectId": 106, "team": "integration", "clientRequestId": "uuid", "rowVer": "3",
  "method": "Phone Call", "callOutcome": "Reached", "note": "…",
  "stepsTicked": ["P1Culture"], "stepsUnticked": [],
  "phase": 1, "membership": "Interested", "workforce": "Interested", "departmentId": 2, "lifeGroup": "Undecided",
  "multi": { "SpBelieversClass": true, "SpWaterBaptism": false, "SpMatureChristian": false, "SpNotApplicable": false,
             "OtCounseling": false, "OtPastoralContact": false, "OtFinancialCare": false, "OtFollowUp": false, "OtNotApplicable": true },
  "returned2ndVisit": false, "returnVisitDate": null
}
```

A Church Office log sends `wantsMembership`, `noReason`, `noOtherDetails`, `sopStep` and `nextAction` instead of the Integration fields.

200: `{ "logId": 812, "duplicate": false, "status": "Active", "phase": 1, "rowVer": "4" }`. Repeating the same `clientRequestId` returns the first result with `duplicate: true`.

**State changes** (TKP Connect `usp_ConnectSaveLog`):
- Non-null answers win (BR-09).
- The first tick keeps its time and author; an un-tick clears it.
- The phase follows the *Complete* ticks (BR-12).
- These close the journey (BR-11): `nextAction = "Not Interested in Becoming a Member"`, or `membership = "Not Interested"`. With Not Interested, every other Integration outcome is ignored.
- *Phase 3 Complete* marks the journey Completed.
- The department is kept only when Workforce = Interested.

| Status | `code` | Message |
|---|---|---|
| 400 | `VALIDATION_FAILED` | How did you reach out? is required |
| 400 | `VALIDATION_FAILED` | That outcome does not match how you reached out. (BR-08) |
| 400 | `VALIDATION_FAILED` | Spiritual Outcome: Not Applicable cannot be combined with other options |
| 400 | `VALIDATION_FAILED` | Choose the return visit date |
| 400 | `VALIDATION_FAILED` | A checklist item does not belong to this team. |
| 403 | `NOT_ASSIGNEE` | Only the Integration Team person assigned to this guest can save a log. (or "Church office") |
| 404 | `NOT_FOUND` | Guest not found in Connect. |
| 409 | `JOURNEY_CLOSED` | This guest's journey is closed. Reopen it before logging. |
| 409 | `CONFLICT` | Someone else saved this guest a moment ago. Reload and try again. |

On any refusal the front end keeps everything typed. On 409 it offers **Reload and keep my note**.

### `GET /connect/logs?team=&connectId=` (API-C5)

200: `{ team, all, logs[] }`, newest first. Whole-team viewers of that team get every log (`all: true`); everyone else gets only their own.

Each log has: `logId`, `connectId`, `team`, `authorId`, `author`, `savedAt`, `guest`, `serviceDate`, `method`, `callOutcome`, `sopStep`, `wantsMembership`, `noReason`, `nextAction`, `phase`, `membership`, `workforce`, `department`, `lifeGroup`, `spiritual[]`, `other[]`, `note`, `returned2ndVisit`, `returnVisitDate`, `stepsTicked[]`, `stepsUnticked[]`.

### `GET /connect/departments` (API-C6)

200: `{ "departments": [{ "id": 1, "name": "Choir / Music Ministry" }] }`. The mock uses the departments named in script A.3.1 until the church sends its list (TKP Connect Q14).

---

## 4. Welcome

Follows TKP Connect API-W1…W4. The mock server is `src/mocks/welcome-api.ts`, with its tests in `src/mocks/welcome-api.test.ts` (FI-30…FI-36).

**Counting rules** (TKP Connect doc 01 §5 and §8.1, owned by the Integration Team; dashboards must not recompute them another way):
- One entry per person per service date; if they submitted twice, the latest counts (BR-02).
- **Membership intent** is "Would you like to become a member?", or else "Will you give a thought…". *Maybe* counts as *Undecided*.
- **Young adults** are 16–35; **Adults** are 36 and over.
- **Referral** means "Invited By Someone".
- **Not on cell map** means the ZIP isn't on the cell list (blank ZIPs included).
- **Average rating** is the mean of each guest's answered ratings. A blank rating is "no answer", never 0 (BR-23).

### `GET /welcome/overview?date=&scope=` (API-W1)

`date` defaults to the latest service date. `scope` is `service`, `mtd` or `ytd`.

```json
{
  "meta": { "date": "2026-11-15", "scope": "service", "currentStart": "2026-11-15", "currentEnd": "2026-11-15", "priorStart": "2026-11-08", "priorEnd": "2026-11-08" },
  "kpis": {
    "current": { "guests": 9, "female": 4, "male": 5, "youngAdults": 3, "adults": 6, "membershipYes": 1, "membershipUndecided": 3,
                 "willComeAgainYes": 5, "referrals": 2, "notOnCellMap": 3, "repeatGuests": 0, "avgRating": 8.0 },
    "prior": { "…": "same keys" }
  },
  "cells": { "current": { "Red": 2, "Yellow": 2, "Blue": 1, "Green": 1, "N/A": 3 }, "prior": { "…": "same keys" } },
  "chart": [{ "date": "2026-11-15", "type": "Sunday 1st Service", "guests": 4 }],
  "dates": ["2026-11-15", "2026-11-10", "2026-11-08"]
}
```

**Prior period:**
- `service`: the previous service date on the same weekday (`null` if there is none).
- `mtd` / `ytd`: the same span last year.

**Chart:**
- `service`: the last 16 service dates up to `date`.
- `mtd`: this month's service dates.
- `ytd`: one row per month and service type, with `date` = the 1st of the month.

### `GET /welcome/guests?phone=&name=&date=&cell=&type=&member=` (API-W2)

At least one parameter is required.

| Parameter | Meaning |
|---|---|
| `phone` | Digits only; matches any part of the number. At least 3 digits |
| `name` | Every word must match the start of the first or last name, so "ruth mensah" and "mensah ruth" both work |
| `date` | Service date |
| `cell` | `Red` · `Yellow` · `Blue` · `Green` · `None` |
| `type` | Service type |
| `member` | `Yes` · `Undecided` · `No` |

200: `{ items, total, truncated }`, newest first, capped at 1,000. Each item has: `id`, `serviceDate`, `serviceType`, `firstName`, `lastName`, `phone`, `gender`, `ageBracket`, `city`, `zip`, `cellGroup`, `howHeard`, `membershipIntent`, `visitNumber`, `connectId`. Audited as `welcome.search`.

| Status | `code` | Message |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Type a phone number or a name, or pick a filter. |
| 400 | `VALIDATION_FAILED` | Type at least 3 digits of the phone number. |

### `GET /welcome/guests/{id}` (API-W3 · the guest record drawer)

200: `{ guest }`. That is the item above, plus `middleName`, `email`, `address`, `apt`, `state`, `maritalStatus`, `ageGroup`, `howHeardOther`, `invitedBy`, `invitingCellGroup`, `willComeAgain`, `bestTimeToVisit`, `comments`, `ratings`, `followUpNotes[{ by, text }]` (legacy, read-only) and `entriesWithPhone`.

**Never includes the prayer request** (BR-30). Audited as `welcome.view`.

### `GET /welcome/guests/{id}/entry` (API-W4 · View entry)

For roles that may use Guest lookup. 200: `{ entry }`, the welcome form exactly as submitted, with blanks as `null`.

- The `entry` fields are listed in `src/features/connect/types.ts` → `GuestEntry`. The response also has `membershipIntent` and `connectId`.
- **Ratings** use the keys `Music`, `Preaching`, `Comfort`, `Hospitality`, `ChurchEnvironment`, `ThePeople`, `Traffic` and `Parking`, each 0–10 or `null`.
- This is the **only** response that carries `prayerRequest`.
- If the person submitted twice that day, the latest entry is returned and `entriesThatDay` says how many there were.
- It never returns follow-up, author, IP or geolocation columns.
- Audited as `welcome.entry.view`.

### `POST /welcome/guests/{id}/export` (D8 · guest PDF export)

**New; not in TKP Connect,** where the button is disabled. The front end calls this **before** it prints the View entry pop-up, so every export is logged.

200: `{ "logged": true }`. Audited as `welcome.entry.export`.

| Status | `code` | Message |
|---|---|---|
| 403 | `FORBIDDEN` | Your role cannot export guest records. |
| 404 | `NOT_FOUND` | Guest not found. |

Which roles may export is still to be confirmed with the product owner. Until then: Tech Admin, Lead Pastor, Church Admin, Church Office Admin, Integration Admin and Welcome Lead.

---

## 5. LCM Metrics

Follows TKP Connect API-W5 (`itg.usp_WelcomeLcmMetrics`). This is the monthly Leadership Council Meeting report. It has **totals only**: no guest names or phones; the only names are inviters. For roles with LCM access (doc 02). The mock is `src/mocks/lcm-api.ts`, with its tests in `src/mocks/lcm-api.test.ts`.

### `GET /welcome/lcm?month=YYYY-MM&type=`

- `month` defaults to the **last full month** in church time.
- A month still in progress has `asOf` = today and is compared with the **same number of days** of the previous month.
- `type` filters by service type.

| Field | Content |
|---|---|
| `meta` | `{ month, priorMonth, year, asOf, inProgress, serviceType }` |
| `periods[]` | `Month over month`, `Year to date`, `Week over week` (7 days to `asOf` vs the 7 before) and `Year over year (month)`. Each is `{ comparison, currentStart, currentEnd, priorStart, priorEnd, current, prior, change, pctChange }`; `pctChange` is `null` when prior = 0 ("new") |
| `kpis` | `{ current, prior }` for the month and the prior month (same keys as Overview) |
| `monthly[]` | `{ year, month, guests }`, January to `month`, for this year and last year |
| `weekly[]` | `{ weekStart, weekEnd, guests }`, the 12 weeks ending `asOf` |
| `breakdowns` | For each of `Gender`, `AgeGroup`, `AgeBracket`, `MaritalStatus`, `ServiceType`, `City`, `CellGroup`, `HowHeard`, `MembershipIntent`, `WillComeAgain`, `Zip5`: `[{ value, month, priorMonth, ytd, priorYtd }]`. Blanks are `"Not given"` |
| `emergingZips[]` | Map 1: every Greater Houston ZIP with guests this year, cell ZIPs included: `{ zip, city, county, cellGroup ("N/A" if not a cell ZIP), isEmerging, hasOutline, lat, lon, ytd, priorYtd, last90, prior90, firstSeen, lastSeen, signal }` |
| `ratings[]` | `{ dimension, sort, month, prior, twelveMonth, monthLow }` for Music, Preaching, Comfort, Hospitality, Church environment, The people, Parking and Traffic. `monthLow` = how many rated it 0–5 |
| `ratingTrend[]` | `{ dimension, month: "YYYY-MM", avg, count }` over 12 months |
| `topInviters[]` | `{ name, guests }`, year to date, from "Who invited you" on referral rows |
| `howByMonth[]` | `{ month: "YYYY-MM", source, guests }` over 12 months |
| `serviceByDate[]` | `{ date, type, guests }` for the month's service dates |
| `otherAnswers[]` | `{ text, guests }`: the month's "Other" answers in the guests' own words |
| `visitorCities[]` | Map 2: `{ city, state, country, guests, lat, lon, zips[] }`. `lat`/`lon` are `null` without a US ZIP; the page places those guests on their country |

**Emerging ZIPs (BR-21).** An emerging ZIP is in Greater Houston (the 9-county metro plus every cell ZIP) but not on the cell list. It gets one signal:
- **Emerging**: YTD ≥ 10 and ≥ 3× the same period last year.
- **Growing**: the last 90 days beat the previous 90.
- **Watch**: otherwise.

`signal` is `null` for cell ZIPs.

Audited as `welcome.lcm.view`.

### `GET /welcome/zipgeo?all=1`

The Greater Houston ZIP outlines for Map 1: `{ features: [{ zip, state, county, cellGroup, lat, lon, geometry }], missing: [] }`. These are public U.S. Census ZCTA outlines (TKP Connect `itg.ZipGeo`).

The US state and world country outlines for Map 2 are static public files the front end ships in `public/geo/` (licences in `public/geo/README.md`). They need no API.

### `POST /welcome/lcm/export` (LCM export)

**New; not in TKP Connect,** where the button is disabled (FI-40). Turned on on 2026-11-19. The front end calls this **before** it prints the report, so every export is logged. The report has totals only, so everyone who can open LCM Metrics may export it.

Request: `{ "month": "2026-10", "type": null }`. 200: `{ "logged": true }`. Audited as `welcome.lcm.export`. 403 `FORBIDDEN` for roles without LCM access.

---

## 6. Planned Connect tabs (DRAFT)

TKP Connect lists four Connect tabs as **PLANNED** (doc 05 UI-C4…C7). Their designs and metric definitions are still open on TKP's side (doc 09 Q10–Q13). These endpoints are drafts built from what the repo agrees so far; each page says so. The mock server is `src/mocks/connect-plans.ts`, with its tests in `src/mocks/connect-plans.test.ts`.

**Phase board** needs no new endpoint. It uses `GET /connect/queue?team=&date=all` and groups the rows by `phase`. It is read-only: phases move only with the *Phase n Complete* ticks (BR-12).

### `GET /connect/guest-track` (UI-C4)

Shows guests before or between visits, with the Guest Track text that is due. The three texts are TKP's script library keys `gt-48h`, `gt-return2` and `gt-return3`.

200: `{ me, seesAll, rows[] }`. Each row has: `connectId`, `guestId`, `firstName`, `lastName`, `phone`, `serviceDate`, `serviceType`, `clockStartAt`, `daysSince`, `stage`, `returnVisitDate`, `coMemberId`, `coName`, `itMemberId`, `itName`.

Whole-team viewers see every Active guest; everyone else sees guests assigned to them in either team.

| `stage` | Rule (DRAFT, from each script's "when" note) |
|---|---|
| `48h` | Within 48 hours of the form, no return yet |
| `invite2` | Days 3–6 after the first visit, no return yet |
| `awaiting` | Days 7–27, no second visit confirmed |
| `invite3` | Up to 3 days after a confirmed return visit |

**Open:** who sends each text, and whether "sent" should be recorded.

### `GET /connect/journey/{connectId}` (UI-C5)

One guest's whole journey. Open to Connect roles, and to the Welcome Lead and Welcome Team as **view only** (doc 02 matrix). Audited as `connect.journey.view`.

200: `{ me, guest, visits[], department, howHeard, logs[], events[] }`.
- `guest`: the API-C3 guest fields.
- `visits[]`: every welcome-form entry of this person.
- `logs[]`: both teams, newest first.
- `events[]`: `{ at, kind, text, by }`, newest first. `kind` is one of `form`, `contact` (first contact, with hours after the form), `tick`, `phase` (Moved to Phase 2/3), `return`, `closed` and `completed`.

**Not available without new data:** a full assignment history. TKP Connect stores only the current assignee.

### `GET /connect/metrics?period=YYYY-MM|ytd` (UI-C7)

The cohort is the guests whose first visit falls in the period (the default is the last full month).

A ratio `{ done, due }` counts a guest as **due** once the metric's window has ended, and **done** if it happened within the window.

| Field | DRAFT definition (doc 01 §8.2) |
|---|---|
| `kpis[]` | Phase 1 checklist ticked by Q10's proposed deadlines: 48 Hr Welcome within 48 h of the form; Initial Welcome Call by day 3; Culture, Relationship and Phase 1 Complete by the end of week 2 |
| `funnel[]` | How many in the cohort have each Phase 1 step ticked at all |
| `contact48` · `medianHoursToFirstContact` | First saved log (either team) within 48 h of the form; the median hours to it (and the prior period's) |
| `return30` | *Returned for 2nd visit* with a return date within 30 days of the first visit |
| `cell60` | Life Group Outcome "Joined Cell Group" logged within 60 days |
| `integration90` | Membership Outcome "Interested" logged within 90 days |
| `lossByStage[]` | Closed journeys in the cohort: by the Church Office call, or by the phase they were in |
| `retention[]` | The last 6 first-visit months: guests, Active, Completed, Closed |
| `integrationByMonth[]` | **Live (FI-70):** by service month: total, Interested, Not interested (Integration, or Church Office "Not Interested in Becoming a Member"), Undecided, not yet asked |
| `workload[]` | For each member of the teams the caller can open: open guests; overdue (Integration = 48 h overdue, Church Office = not yet contacted); 48-hour rate over the last 90 days (Church Office = first contact; Integration = the 48 Hr Welcome tick); logs in the last 30 days |

**Who may see it (Q12, open):** every Connect role, as the doc 02 matrix shows until it is answered. Audited as `connect.metrics.view`.
