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

**Staff get a second step (M6, PRD §2 rule 6 and A-2: MFA mandatory for staff).** When the password is right and the person holds any role other than `tkp_member`, the server does **not** start a session. It emails a 6-digit code and answers 200:

```json
{ "mfa": { "ticket": "<opaque, single-use>", "method": "email", "sentTo": "g•••@example.com", "expiresAt": "2026-11-20T15:10:00Z", "resendAt": "2026-11-20T15:00:30Z" } }
```

Audit `mfa.code_sent`. `sign_in` is written only when the code is accepted. TKP Members get the session straight away, as before. The method (email code) is to be confirmed with TKP; an authenticator app would keep the same `ticket` + `code` contract.

### `POST /auth/mfa/verify`

Request: `{ "ticket": "…", "code": "123456" }`. 200: the same as a sign-in with a session (`token`, `expiresAt`, `member`); audit `sign_in`; `lastSignInAt` is stamped.

| Status | `code` | `message` | Notes |
|---|---|---|---|
| 401 | `MFA_INVALID` | That code is not right. Check the latest email and try again. | `fields.code: ["4 tries left"]`; audit `mfa.failed` |
| 401 | `MFA_LOCKED` | Too many wrong codes. Sign in again to get a new code. | After 5 wrong codes the ticket is dead |
| 401 | `MFA_EXPIRED` | That code has expired. Sign in again to get a new one. | Code older than 10 minutes, unknown or used ticket, or the person was deactivated meanwhile |

The front end does **not** treat these 401s as "session ended" (there is no session yet).

### `POST /auth/mfa/resend`

Request: `{ "ticket": "…" }`. 200: a new `mfa` object (same ticket, new code; the old code stops working and the try counter restarts).

| Status | `code` | Notes |
|---|---|---|
| 429 | `TOO_SOON` | Less than 30 seconds since the last code |
| 429 | `TOO_MANY_CODES` | At most 3 codes per sign-in, so resending cannot buy unlimited guesses |
| 401 | `MFA_EXPIRED` | As above |

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

200: `{ "resetContact": "Grace Adeyemi", "resetRelay": "Joy Ibekwe", "idleMinutes": 30 }` (`resetRelay` may be `null`). Only these public fields; the rest of Settings needs `GET /admin/settings`.

`idleMinutes` drives the idle sign-out (PRD 4.3 "short idle timeout"): after that long without activity the front end warns for one minute, then calls `POST /auth/sign-out` and shows Sign in with "You were signed out after N minutes without activity", returning to the same page afterwards. The backend should also expire idle sessions on its side.

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
| `outcomes[]` | Follow-up and growth: nine measures in a fixed order, described below |

**Emerging ZIPs (BR-21).** An emerging ZIP is in Greater Houston (the 9-county metro plus every cell ZIP) but not on the cell list. It gets one signal:
- **Emerging**: YTD ≥ 10 and ≥ 3× the same period last year.
- **Growing**: the last 90 days beat the previous 90.
- **Watch**: otherwise.

`signal` is `null` for cell ZIPs.

Audited as `welcome.lcm.view`.

### Follow-up and growth (`outcomes[]`)

**New; not in TKP Connect,** which listed these as "Suggested metrics to add" with no numbers. Added on 2026-11-24. The mock is `src/mocks/lcm-outcomes.ts`. Totals only.

Each item:

```json
{
  "key": "return30", "label": "Came back within 30 days",
  "measures": "First-time guests confirmed back at a service within 30 days.",
  "source": "A later welcome form, or Connect “Returned for 2nd visit”",
  "unit": "%", "higherIsBetter": true,
  "cohort": "2026-09",
  "current": { "count": 4, "of": 29, "value": 13.8 },
  "prior": { "count": 2, "of": 26, "value": 7.7, "cohort": "2026-08" },
  "open": 0,
  "breakdown": [{ "label": "Phone", "count": 34, "of": 36, "note": null }]
}
```

- **The cohort.** Most measures look at **first-time guests** (`visitNumber` = 1) and count what happened to them inside a fixed window.
  - When the window needs time to close, the cohort is an earlier month (`cohort` ≠ `meta.month`), so the leadership meeting sees a settled number.
  - `prior` is the cohort one month earlier.
  - Measures with lag 0 use the same-days rule as the rest of the report.
- **Counting.** Events are counted up to the end of the window, not up to `asOf`.
- **`open`** is the number of cohort guests whose window has not closed yet (measured against now) and who have not been counted. A number with `open` > 0 can still go up.
- **`value`** is `count / of × 100`, rounded to 1 decimal. It is `null` when `of` = 0.
- **The `type` filter** applies to the cohort. A guest who comes back to a *different* service still counts as back.

| `key` | Lag | Cohort (`of`) | Counted (`count`) | Window |
|---|---|---|---|---|
| `contact48h` | 0 | First-time guests | Earliest of: any Connect log `savedAt`, checklist `CoWelcomeCall`, checklist `P1Welcome48h`, within 48 h of `submittedAt` | 48 h from the form |
| `return30` | 1 | First-time guests | A later form entry from the same person (`visitNumber` > 1), or `returnVisitDate`, within 30 days of the service date | 30 days |
| `return90` | 3 | First-time guests | Same, within 90 days | 90 days |
| `cellPlacement` | 1 | First-time guests | The first log with Life Group = "Joined Cell Group" (else the Phase 1 sign-off when the guest's Life Group is "Joined Cell Group"), within 28 days | 28 days |
| `conversion` | 3 | First-time guests | Journey `status` = Completed (all three integration phases) | 12 weeks |
| `undecided` | 1 | First-time guests whose form said "Undecided" (or "Maybe") about membership | Connect later recorded wants membership "Yes", or Integration membership "Interested" | none |
| `per100` | 0 | Total headcount of the month's services (to `asOf`, by `type`) | First-time guests in the month. `unit` = "per 100" | none |
| `completeness` | 0 | Every form in the month, repeat visits included | Phone, ZIP and age bracket all filled in. `breakdown` gives each field | none |
| `lowRatings` | 0 | Forms in the month that rated at least one area | Rated any area **5 or below** out of 10. `higherIsBetter` = false. `breakdown` gives each area with guests rated ≤ 5, out of those who rated it, with `note` = the department the alert goes to | none |

**New data the backend needs:**
- **Service headcounts:** a small new table `{ date, serviceType, headcount }`, one row per service held. TKP does not collect headcounts today; the mock seeds placeholder numbers. Who enters them (ushers after each service?) and where is open.
- **Low-rating owners:** area → department. The mock uses placeholders (Music → Choir / Music Ministry, Preaching → Lead Pastor's office, Comfort, Parking and Traffic → Ushering / Protocol, Hospitality and The people → Welcome Team, Church environment → Facilities).
- **Low-rating alerts.** The PRD routes each low rating to the department head. Sending the alert (email or in-app, when the form arrives) is a backend job. The report only counts the low ratings.

**Open questions:**
- **Conversion.** Connect has no member database, so `conversion` counts finished integration journeys. When the member database (or orientation attendance) is available, count "became a member or attended orientation" instead and update `source`.
- **Headcounts.** Who records them, and from which date?
- **Owners.** Confirm the department for each rating area, and the 5-out-of-10 threshold.

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

---

## 7. Admin (M6)

PRD SA-1, SA-3, CA-3, F-5, F-12. Permission keys (`src/lib/permissions.ts`):

| Key | Who | Opens |
|---|---|---|
| `dashboard.view` | Tech Admin, Church Admin | `GET /dashboard` (their home page) |
| `admin.users` | Tech Admin | Users, Roles, every `/admin/users` call |
| `admin.audit` | Tech Admin, Tech Team | `GET /admin/audit` |
| `admin.settings` | Tech Admin | `GET` / `PUT /admin/settings` |

Anyone else gets `403 FORBIDDEN`. Every change below is audited **with old and new values** in `meta: { before, after }` (only the fields that changed).

### `GET /dashboard`

The Figma dashboard (node `125:4815`) filled with TKP Connect data. Sections follow permissions, so each role gets its own dashboard.

```json
{
  "asOf": "2026-11-20T15:00:00Z",
  "latestServiceDate": "2026-11-17",
  "tiles": {
    "guestsOnRecord": 488, "firstSeen": "2024-06-02",
    "newThisMonth": 21, "newSameMonthLastYear": 22,
    "contacted48": { "done": 27, "of": 29 },
    "overdue48": 10
  },
  "trend": [{ "month": "2025-12", "firstVisits": 19, "returnVisits": 3 }],
  "cells": [{ "cell": "Red", "guests": 49, "active": 16 }],
  "attention": [{ "connectId": 123, "name": "Caleb Taylor", "serviceDate": "2026-08-23", "serviceType": "Sunday 1st Service", "hoursSince": 2110, "coName": "New Volunteer", "itName": null }],
  "attentionTotal": 10,
  "accounts": { "active": 15, "temporary": 1, "deactivated": 1, "signedInThisWeek": 13 },
  "activity": []
}
```

| Field | Definition (to confirm with TKP) |
|---|---|
| `guestsOnRecord` | Connect journeys, one per person (everyone who has filled in the form) |
| `newThisMonth` | Form entries with visit number 1 in the current church-time month; `newSameMonthLastYear` is the same month a year earlier |
| `contacted48` | Guests whose 48 hours ended in the last 30 days (`of`), and those with a saved log from either team **or** the 48 Hr Welcome tick before the 48 hours ran out (`done`) |
| `overdue48` / `attention` | TKP Connect BR-13, unchanged; `attention` holds the 6 oldest |
| `trend` | The last 12 months of form entries: visit 1 vs visit 2 or later |
| `cells` | This year's form entries by home cell (ZIP map; `N/A` = not on the cell map), and Active journeys per cell |
| `accounts` | `null` unless the caller has `admin.users` |
| `activity` | The latest 6 audit entries (same shape as `GET /admin/audit` items); `null` unless the caller has `admin.audit` |

### `GET /admin/users?q=&role=&status=&page=&pageSize=`

`status`: `active`, `temporary` (must change their password), `deactivated`, or `all`. Sorted by name. Never returns passwords.

200: `{ "items": [AdminUser], "page", "pageSize", "total", "counts": { "active": 15, "temporary": 1, "deactivated": 1 } }`

`AdminUser`: `{ id, fullName, email, phone, roles[], connectTeam, status, createdAt, lastSignInAt, rowVer }`

### `POST /admin/users`

Accounts are created only here: there is no self sign-up. Request: `{ fullName, email, phone|null, roles[], connectTeam|null }`.

201: `{ "user": AdminUser, "temporaryPassword": "Meadow-5006$k" }`. The temporary password passes the password rules, is returned **once** and is never readable again. The person must replace it at first sign-in (API-A7). Audit `user.create`; the password is never written to the audit log.

| Status | `code` | When |
|---|---|---|
| 409 | `EMAIL_TAKEN` | `fields.email`: Someone already uses this email address |
| 422 | `VALIDATION_FAILED` | `fields.fullName` (2–120 characters), `fields.email`, `fields.roles` (at least one; TKP Member cannot be combined with staff roles), `fields.connectTeam` |

### `PUT /admin/users/{id}`

Request: the same fields plus `rowVer`. 200: `{ "user": AdminUser }`. Audit `user.update` with the changed fields. Role changes take effect at the person's next request (API-A3 re-reads them).

| Status | `code` | When |
|---|---|---|
| 409 | `CONFLICT` | Stale `rowVer` |
| 409 | `SELF_DEMOTE` | Removing your own Tech Admin role |
| 409 | `LAST_TECH_ADMIN` | It would leave no active Tech Admin |
| 409 / 422 | as for create | |

**Sensitive-grant guard (PRD SA-1):** the front end asks for a second confirmation before giving anyone Tech Admin.

### `POST /admin/users/{id}/deactivate` · `POST /admin/users/{id}/reactivate`

200: `{ "user": AdminUser }`. Deactivating stamps the sessions-revoked time, so the person is signed out at their next request and cannot sign in (API-A1, A3). Their logs and Connect assignments stay. Audits `user.deactivate` / `user.reactivate`. 409 `SELF_DEACTIVATE`, 409 `LAST_TECH_ADMIN`. The front end confirms first.

### `POST /admin/users/{id}/reset-password`

UI-S1: no self-service reset. 200: `{ "user", "temporaryPassword" }` (shown once). The old password stops working, every session ends and `mustChangePassword` is set. Audit `user.password.reset`. 409 `SELF_RESET` (use Change password), 409 `DEACTIVATED`.

### `POST /admin/users/{id}/sign-out-everywhere`

PRD A-5, done for someone else (a lost phone, a shared computer). 200: `{ "user" }`. The password is unchanged. Audit `user.sessions.revoke`.

### `GET /admin/audit?q=&actorId=&category=&from=&to=&page=&pageSize=`

Read-only and immutable: there is no edit or delete endpoint. Newest first. `from` / `to` are church-time dates (`YYYY-MM-DD`, inclusive). `q` matches the action, the person and the target.

| `category` | Actions |
|---|---|
| `sign-in` | `sign_in`, `sign_in_failed`, `sign_out`, `password.*`, `mfa.*` |
| `welcome` | `welcome.*` except exports |
| `connect` | `connect.*` |
| `exports` | `*.export` |
| `users` | `user.*` |
| `settings` | `settings.*` |

200: `{ "items": [AuditEntry], "page", "pageSize", "total", "actors": [{ "id", "fullName" }], "retentionDays": 730 }`

`AuditEntry`: `{ id, at, actorId, actorName, action, target, targetLabel, meta }`. `targetLabel` is the server's readable name for the target (a person's name, "Guest #5446", "Connect #480", "Settings"), so the front end never looks targets up itself. `actorName` is `null` for failed sign-ins.

### `GET /admin/settings` · `PUT /admin/settings`

```json
{
  "settings": {
    "resetContact": "Grace Adeyemi", "resetRelay": "Joy Ibekwe",
    "idleMinutes": 30, "forcePasswordChange": true, "auditRetentionDays": 730,
    "mfaForStaff": true, "timeZone": "America/Chicago",
    "rowVer": 1, "updatedAt": null, "updatedBy": null
  }
}
```

`PUT` takes `{ resetContact, resetRelay|null, idleMinutes, forcePasswordChange, auditRetentionDays, rowVer }` and returns the same shape. `mfaForStaff` and `timeZone` are read-only: MFA for staff is a PRD rule, not a switch. `forcePasswordChange` is the API-A7 rule in §2. Audit `settings.update`.

| Status | `code` | When |
|---|---|---|
| 409 | `CONFLICT` | Stale `rowVer` (another admin saved first) |
| 422 | `VALIDATION_FAILED` | `resetContact` 2–80 characters; `resetRelay` up to 80; `idleMinutes` 15, 30 or 60; `auditRetentionDays` 365, 730, 1825 or 2555 |

---

## 8. Cells and ZIPs, Services (M7)

PRD W-12, W-13, W-2, W-11, IL-5, CA-2, G-4. Permission keys:

| Key | Who | Opens |
|---|---|---|
| `config.cells` | Tech Admin, Church Admin, Integration Admin | Admin › Cells and ZIPs, every `/welcome/cell-map` call |
| `config.services` | Tech Admin, Church Admin | Admin › Services, every change to `/welcome/services` |

Every change is audited with old and new values (audit category `welcome`). Anyone else gets `403 FORBIDDEN`.

### `GET /welcome/cell-map`

```json
{
  "cells": [{ "cell": "Red", "entries": 88, "thisYear": 49,
              "zips": [{ "zip": "77450", "city": "Katy", "county": "Harris", "entries": 23, "thisYear": 12, "lastSeen": "2026-10-18" }] }],
  "unmapped": [{ "zip": "77082", "city": "Houston", "county": "Harris", "entries": 21, "thisYear": 15, "lastSeen": "2026-11-15" }],
  "outOfArea": 15, "noZip": 13,
  "rowVer": 3, "updatedAt": "2026-11-20T15:02:00Z", "updatedBy": "Esther Coleman"
}
```

`cells` is always Red, Yellow, Blue, Green (the four cells are fixed; adding a fifth is an open question). `unmapped` lists Greater Houston ZIPs (on the ZipGeo list, or 77xxx) that guests gave but no cell covers, busiest this year first (PRD W-11). `outOfArea` and `noZip` count entries that stay N/A. `city` / `county` come from ZipGeo, else the city most guests wrote. The whole map has one `rowVer`.

### `PUT /welcome/cell-map/zips/{zip}` · `DELETE /welcome/cell-map/zips/{zip}?rowVer=`

`PUT` body: `{ "cell": "Green", "rowVer": 3 }`. Adds the ZIP to a cell or moves it from another. `DELETE` takes it off the map. 200 for both:

```json
{ "zip": "77082", "cell": "Green", "from": null, "recalculated": 21, "rowVer": 4 }
```

**W-12: a changed mapping recalculates the cell group of every form entry with that ZIP, past months included** (`recalculated` = entries changed), so Welcome, LCM Metrics (including `/welcome/zipgeo`'s `cellGroup`), Connect and the dashboard follow at once. Audits `welcome.cellmap.set` / `welcome.cellmap.remove` with `before: { cell }`, `after: { cell, recalculated }` (`"N/A"` = no cell). An unchanged mapping changes nothing and is not audited. The front end confirms a removal first.

| Status | `code` | When |
|---|---|---|
| 409 | `CONFLICT` | Stale `rowVer` (someone changed the map) |
| 404 | `NOT_FOUND` | `DELETE` of a ZIP that is not on the map |
| 422 | `VALIDATION_FAILED` | `fields.zip` (5 digits), `fields.cell` (Red, Yellow, Blue or Green) |

### `GET /welcome/services`

Readable by `config.services` and by anyone who filters Welcome by service (`welcome.overview.view`, `welcome.lookup.view`, `welcome.lcm.view`); the guest form reads the same list (PRD G-4). Active services first, in form order, then retired ones.

```json
{
  "items": [{
    "id": "svc-1", "name": "Sunday 1st Service", "shortName": "1st service",
    "kind": "weekly", "day": 0, "time": "09:30", "startsOn": null, "endsOn": null,
    "shortForm": false, "active": true, "sortOrder": 1,
    "entries": 221, "lastUsed": "2026-11-15", "onForm": true,
    "rowVer": 1, "updatedAt": null
  }],
  "formToday": ["Sunday 1st Service", "Sunday 2nd Service", "Tuesday Bible Study", "Power Night", "Other"]
}
```

| Field | Meaning |
|---|---|
| `kind` | `weekly` (needs `day` 0 = Sunday … 6 and `time` `HH:MM`, church time) or `special` |
| `startsOn` / `endsOn` | Special events: the dates the form offers it, inclusive. Both `null` = on the form until retired |
| `shortForm` | Uses the short guest form (PRD W-2) |
| `onForm` | Active, and weekly or inside its dates (church date) |
| `entries` / `lastUsed` | Form entries naming this service |
| `formToday` | What the form lists today, in order; it always ends with `Other` |

### `POST /welcome/services` · `PUT /welcome/services/{id}`

Body: `{ name, shortName, kind, day, time, startsOn, endsOn, shortForm }` (`PUT` adds `rowVer`). `shortName` defaults to the first 20 characters of `name`. `POST` → 201 `{ "service" }`, added at the end of the active list. `PUT` → 200 `{ "service", "renamedEntries" }`.

**A new name applies to past entries too**: an entry points at its service, so its name follows (`renamedEntries` = entries now showing the new name). Audits `welcome.service.create` / `welcome.service.update` (changed fields only, plus `renamedEntries`).

| Status | `code` | When |
|---|---|---|
| 409 | `NAME_TAKEN` | `fields.name`: another service (active or retired) has this name, ignoring case |
| 409 | `CONFLICT` | Stale `rowVer` |
| 422 | `VALIDATION_FAILED` | `fields.name` (2–60, not "Other"), `fields.shortName` (up to 20), `fields.kind`, `fields.day`, `fields.time`, `fields.startsOn` / `fields.endsOn` (valid dates, both or neither, last ≥ first) |

### `POST /welcome/services/{id}/retire` · `POST /welcome/services/{id}/restore`

200 `{ "service" }`. Retired services leave the form; their entries stay and still count in every report. A restored service goes to the end of the active list. Audits `welcome.service.retire` / `welcome.service.restore`. 409 `LAST_SERVICE`: the form must keep at least one active service. The front end confirms a retire first.

### `DELETE /welcome/services/{id}`

200 `{ "deleted": true }`. Only for a service no entry names (a typo); anything else is retired. Audit `welcome.service.delete` with `before: { name }`. 409 `IN_USE` (has entries: retire it instead), 409 `LAST_SERVICE`. The front end confirms first.

### `PUT /welcome/services/order`

Body: `{ "ids": ["svc-2", "svc-1", …] }`, every active service exactly once (else 422 `VALIDATION_FAILED`, `fields.ids`). 200: the same shape as `GET /welcome/services`. Audit `welcome.service.reorder` with the old and new order (only when it changed).

## 9. QR codes (M7)

PRD 5.8 (QR-1 to QR-10), 6.14 (Q-1 to Q-8), 8.3 "QR code edge cases". Screen: Welcome › QR codes (`/welcome/qr`) and its print screen (`/welcome/qr/print`). Permission keys:

| Key | Who | Opens |
|---|---|---|
| `qr.view` | Tech Admin, Church Admin, Integration Admin, Welcome Lead, Welcome Team, Lead Pastor, Tech Team | The list, the detail and the scan counts |
| `qr.print` | Tech Admin, Church Admin, Integration Admin, Welcome Lead, Welcome Team | The print screen and `POST /welcome/qr-codes/print` |
| `qr.manage` | Tech Admin, Church Admin, Integration Admin | Every change, and `POST /welcome/qr-codes/check` |

The PRD says "church_admin and integration_lead create and edit; welcome_team can view and print; pastor_exec sees scan counts only". Here Integration Admin stands for the integration lead and Lead Pastor for pastor_exec. Tech Admin manages everything and Tech Team reads, as everywhere. Anyone else gets `403 FORBIDDEN`.

**Times.** `activeFrom` and `expiresAt` are UTC instants (ISO 8601). Screens show and enter them in church time (America/Chicago), and daylight saving is handled. `timeZone` is returned for clarity.

**Status (QR-1, QR-10).** The stored `state` is `draft`, `live` or `paused`. `status` is worked out on every read and every scan, so a code never stays Active past its expiry and no scheduled job is needed:

| `status` | When |
|---|---|
| `draft` | `state = draft` (saved, not turned on) |
| `paused` | `state = paused` |
| `scheduled` | live, and now < `activeFrom` |
| `expired` | live, and `expiresAt` ≤ now |
| `active` | live otherwise |

### The short address (QR-2, QR-3), backend only

Each new code gets a permanent `slug` (6 characters, without 0, O, 1 or I) and prints `https://go.tkp.example/{slug}`. **The domain is a placeholder** until TKP confirms it. The address never changes, so staff can change the destination or dates without reprinting.

`GET https://go.tkp.example/{slug}` is public (no sign-in). It:
- Reads the code and its dates **at request time**. Send `Cache-Control: no-store`, or a `max-age` of 60 or less, so a date change always takes effect.
- Returns `302` to the destination URL when the code is `active`.
- Returns `200` with the **inactive code page** (portal, PRD Q-8) when the code is `scheduled`, `paused`, `expired`, `draft`, deleted or unknown. The page shows a short message ("not active yet, starts …", "this code has ended" or "not active") and links to the guest form and Plan a Visit. It is never a blank error.
- Counts the scan (QR-6) with **no personal data**: one counter per code, church date, service running at the time, and outcome (`inactive` true or false). It stores no IP address, device, cookie or location. Rate-limit per IP in memory only.
- Takes "service at scan time" to be, in order:
  1. an active special event whose dates include today;
  2. a weekly service on today's weekday, from 60 minutes before its start to 2½ hours after;
  3. none ("Outside service times").

Legacy codes (QR-7) have no slug. Their printed address is today the church website form. At cutover it must redirect to the TKP Hub guest form (PRD transition plan, step 4). The backend or web host does that redirect, and counts it like any other scan.

**Mock only:** `GET /public/qr/{slug}` backs the "Try a scan" demo button, which exists only in mock mode. It returns `{ "outcome": "redirect", "url" }` or `{ "outcome": "inactive", "reason", "startsAt", "links": [{ "label", "url" }] }`, where `reason` is `not_started`, `expired`, `paused`, `draft` or `unknown`. The real backend does not need it.

**Destinations.** The portal base is a placeholder too.

| `destination` | Opens |
|---|---|
| `guest_form` | `/welcome`, plus `?service={id}` when a service is linked |
| `short_form` | `/welcome?form=short` |
| `plan_visit` | `/plan-a-visit` |
| `event` | `/events/{serviceId}` (a special event from §8) |
| `course` | `/learn/courses/{courseId}` (a placeholder list until Grow, M8) |
| `prayer_wall` | `/prayer` |

### `GET /welcome/qr-codes`

```json
{
  "items": [{
    "id": "qr-2", "name": "Welcome desk table card",
    "slug": "HELLO7", "shortUrl": "https://go.tkp.example/HELLO7", "legacy": false,
    "destination": "guest_form", "targetId": null,
    "destinationLabel": "Guest form", "destinationUrl": "https://hub.tkp.example/welcome",
    "serviceId": null, "serviceName": null,
    "activeFrom": "2026-10-04T13:00:00.000Z", "expiresAt": null, "timeZone": "America/Chicago",
    "state": "live", "status": "active",
    "note": "Two cards on each welcome desk.", "caption": "New here? Scan to say hello",
    "createdAt": "…", "createdBy": "Esther Coleman", "updatedAt": "…", "updatedBy": null, "rowVer": 1,
    "scans": { "total": 412, "last30": 35, "lastAt": "2026-11-22" }
  }],
  "counts": { "active": 2, "scheduled": 2, "paused": 1, "draft": 1, "expired": 1 },
  "targets": { "event": [{ "id": "svc-5", "name": "168 Hours of Praise", "hint": "2027-01-03 to 2027-01-09" }],
               "course": [{ "id": "crs-1", "name": "Foundation Class", "hint": "4 weeks" }] },
  "services": [{ "id": "svc-1", "name": "Sunday 1st Service" }],
  "can": { "manage": true, "print": true }
}
```

- Items are sorted Active, Scheduled, Paused, Draft, Expired, then by name.
- `scans` counts active scans only.
- `can` tells the screen which buttons to show.
- The front end refetches every minute, so a status change shows on screen.

**QR-8: errors, not warnings (TKP, 2026-11-25).** TKP asked for no warning labels: a problem either blocks saving until it is fixed, or isn't flagged at all. This changes PRD QR-8 and 8.3 ("warn, do not block"):
- **The code stops before its service** blocks saving, as `422 VALIDATION_FAILED` with `fields.expiresAt`. It is checked on create, full edit and the quick date edit (`PUT …/dates`). The service is the linked one; for an `event` code, the event counts as the service.
  - Weekly service: the code expires before the end of the next occurrence after max(now, `activeFrom`). A service counts as 2 hours long. The message reads "It would stop before the next … (date). Move the expiry after that service, or choose no particular service." or "It would stop during …".
  - Special event with dates: the code expires before 23:59 church time on the event's last day.
  - No expiry, or an expiry already in the past (an expired code), is never a problem.
- **Two codes for the same place** (the old `overlap` warning) is no longer flagged. Several printed codes opening the guest form (table cards, posters, the printed code) is normal.
- Codes no longer carry a `warnings` field.

### `GET /welcome/qr-codes/{id}`

Feeds the detail screen (QR-6):

```json
{
  "code": { "…": "as in the list" },
  "byDay": [{ "date": "2026-09-25", "scans": 0, "inactive": 0 }],
  "byService": [{ "service": "Sunday 1st Service", "scans": 260 }, { "service": "Outside service times", "scans": 9 }],
  "inactiveTotal": 3
}
```

| Field | Meaning |
|---|---|
| `byDay` | The last 60 church days, oldest first, including days with no scans |
| `byService` | All time, busiest first |
| `inactiveTotal` | Scans that reached the inactive page |

404 `NOT_FOUND` when the code does not exist.

### `POST /welcome/qr-codes` · `PUT /welcome/qr-codes/{id}`

Body: `{ name, destination, targetId, serviceId, activeFrom, expiresAt, caption, note }`. `PUT` adds `rowVer`. `POST` also takes:
- `draft`: true saves without turning the code on.
- `legacyUrl`: the link a code that is **already printed** opens (QR-7). The screen has one "Add a QR code" form that asks "Is this code already printed?" (TKP, 2026-11-25). "Yes" shows this field and requires it; "No" leaves it out, and the code gets a new short link. A legacy code is never a draft, and its link can't be changed later.

- `POST` returns 201 `{ "code" }` with a new slug (legacy codes get none). A live code with no `activeFrom` starts now; a draft keeps it null.
- `PUT` returns 200 `{ "code" }`. The slug never changes, so printed copies keep working (PRD 8.3). If nothing changed, nothing is audited.
- `caption` is printed with the code. It defaults by destination, for example "New here? Scan to say hello".

Audit actions:
- `welcome.qr.create` and `welcome.qr.legacy`: `after` holds the name, destination, dates, state and `legacyUrl`.
- `welcome.qr.update`: only the fields that changed (name, destination, service, activeFrom, expiresAt, note, caption).
- `welcome.qr.renew`: an edit that moves an expired code's dates so it works again. QR-4 allows reactivating, and requires it to be logged.

| Status | `code` | When |
|---|---|---|
| 409 | `NAME_TAKEN` | `fields.name`: another code already has this name, ignoring case |
| 409 | `CONFLICT` | Stale `rowVer` |
| 422 | `VALIDATION_FAILED` | Any of the field rules below |

Field rules behind `VALIDATION_FAILED`:
- `fields.name`: 2 to 60 characters.
- `fields.destination`: one of the six destinations.
- `fields.targetId`: an active special event, or a course.
- `fields.serviceId`: a service that exists.
- `fields.activeFrom`, `fields.expiresAt`: ISO instants, and **the expiry must come after the start**.
- `fields.expiresAt`: the code must keep working until its service or event is over (QR-8, above).
- `fields.caption`: up to 60 characters.
- `fields.note`: up to 500 characters.
- `fields.legacyUrl`: an http or https URL that is not already registered.

### `POST /welcome/qr-codes/check`

Needs `qr.manage`. The body is the form so far, plus `id` when editing. Returns 200 `{ "fields": { "expiresAt": "It would stop before the next Sunday 1st Service (…)" } }`, or `{ "fields": {} }` when all is well. The form calls it 400 ms after people stop typing, shows the message under Expires, and keeps Save off until it is fixed. The save checks again on the server.

### `PUT /welcome/qr-codes/{id}/dates`

The quick edit from the list (QR-4). It also backs the Extend buttons (+1 day, +1 week, +30 days), for a code that would expire during a live service (PRD 8.3).

- Body: `{ "activeFrom", "expiresAt", "rowVer" }`. Returns 200 `{ "code" }`.
- Audits `welcome.qr.dates` with the old and new dates, or `welcome.qr.renew` when an expired code works again.
- Errors: 409 `CONFLICT`; 422 `VALIDATION_FAILED` (`fields.expiresAt`: "The expiry must be after the start").

### `POST /welcome/qr-codes/{id}/publish` · `/pause` · `/resume`

Body: `{ "rowVer" }`. Returns 200 `{ "code" }`.

| Action | Effect | Audit |
|---|---|---|
| `publish` | Turns a draft on; the start is now if none was set | `welcome.qr.publish` |
| `pause` | Stops a live code at once; scans see the inactive page. The screen offers Undo. | `welcome.qr.pause` |
| `resume` | Switches a paused code back on | `welcome.qr.resume` |

Each audit records `before: { state }` and `after: { state }`. Errors: 409 `CONFLICT`; 409 `NOT_LIVE` when pausing a draft.

### `DELETE /welcome/qr-codes/{id}`

Returns 200 `{ "deleted": true }`.
- The address then shows the inactive page, and the scan counters are deleted with the code.
- Audit `welcome.qr.delete`, with `before` holding the name, destination, dates and state.
- 409 `LEGACY_CODE`: the code printed around the church today cannot be deleted, only paused.
- The front end asks for confirmation first, in plain words.

### `POST /welcome/qr-codes/print`

Needs `qr.print`. Body: `{ "ids": ["qr-1", "qr-2"], "layout": "table_card", "copies": 2 }`, where `layout` is `poster`, `table_card`, `bulletin`, `sticker` or `plain`. Returns 200 `{ "logged": true }` and audits `welcome.qr.print` (category `exports`). 422 `VALIDATION_FAILED` for `fields.ids` or `fields.layout`.

The sheets themselves (QR-5) are drawn by the front end as vector SVG on US Letter:
- Each code uses error correction level H, with the logo, caption and short address.
- The browser's print dialog saves a print-quality PDF.

| Layout | Per page | Printed code size |
|---|---|---|
| Poster | 1 | 5.5 in |
| Table card | 2 | 3 in |
| Bulletin insert | 4 | 2 in |
| Sticker | 12 | 1.5 in |
| Plain | as many as fit | 0.75–4 in, chosen on screen |

The screen warns when one square of a code would print smaller than 0.75 mm, and when a chosen code is not active. A server-side PDF generator (PRD Q-4, batch jobs) can replace this later without changing the screen.

**Open questions:**
- The domains for the short address and the portal.
- The address on today's printed code (seeded as a placeholder).
- Whether Tech Team should see QR codes.
- The course list, which comes with Grow (M8).

---

## 10. Duplicate guests (M7)

PRD W-14 (duplicate detection by verified phone or email, never the name alone, with a review and merge screen), A-1 (one Person ID per person), WT-4 and WT-7, and 8.1 ("same phone or email submitted twice: link as a duplicate candidate; never auto-merge on name alone"). Screen: Welcome › Duplicates (`/welcome/duplicates`). The mock is `src/mocks/duplicates-api.ts`, with its tests in `src/mocks/duplicates-api.test.ts`.

| Key | Who | Opens |
|---|---|---|
| `welcome.duplicates.view` | Tech Admin, Church Admin, Integration Admin, Welcome Lead, Tech Team | The list and the merge history |
| `welcome.duplicates.merge` | Tech Admin, Church Admin, Integration Admin, Welcome Lead (TKP, 2026-11-25) | Merge, undo a merge, "not the same person", put back |

Anyone else gets `403 FORBIDDEN`.

**A record** is one person's Connect journey (`connectId`, TKP Connect `itg.Connect`), with all their form entries (`vw_WelcomeGuest`) and follow-up logs (`itg.ConnectLog`).

### How records are matched (A-1)

**Decided by TKP (2026-11-25):** match on the phone and email as typed, once normalised; the welcome form does not verify them. When guests verify a phone or email (portal sign-in), prefer the verified value.

Two records are a **candidate pair** when any phone or email on any of their form entries is the same once normalised:
- **Phone:** digits only. 10 digits becomes `+1` and the digits; 11 digits starting with 1 becomes `+` and the digits; anything else with 8 or more digits becomes `+` and the digits. Fewer than 8 digits is ignored. So `(832) 555-0167`, `+1 832-555-0167` and `832.555.0167` match.
- **Email:** trimmed and lower-cased.
- **Names never link records,** alone or together with anything else. A differing name sets `namesDiffer` so the screen can warn.

Groups are the connected sets of candidate pairs (three records can be one group), leaving out pairs marked "not the same person". The real backend should check new form entries against this as they arrive and **never merge on its own** (PRD 8.1).

### `GET /welcome/duplicates`

```json
{
  "groups": [{
    "id": "135-588",
    "reasons": [{ "kind": "phone", "value": "(832) 555-0167" }, { "kind": "email", "value": "funmi.okoro@example.com" }],
    "namesDiffer": true,
    "people": [{
      "connectId": 135, "name": "Funmilayo Okoro",
      "fields": { "firstName": "Funmilayo", "lastName": "Okoro", "phone": "(832) 555-0167", "email": "funmi.okoro@example.com", "address": "…", "city": "Katy", "zip": "77494" },
      "firstVisit": "2026-10-25", "lastVisit": "2026-10-25", "visits": 1, "serviceTypes": ["Sunday 1st Service"],
      "journey": { "status": "Active", "closedReason": null, "phase": 3, "churchOffice": "Lydia Fashola", "integration": "Tobi Martins", "steps": 12 },
      "logs": 3, "rowVer": 1
    }],
    "suggestedJourney": 135,
    "newest": "2026-11-08"
  }],
  "dismissed": [{ "key": "146-589", "ids": [146, 589], "names": ["Kunle Durojaiye", "Bisi Durojaiye"], "reasons": [], "by": "Esther Coleman", "at": "…", "note": "Husband and wife share the home phone." }],
  "merges": [{ "id": "…", "at": "…", "by": "Esther Coleman", "keptId": 124, "keptName": "Marcus Adeleke",
               "merged": [{ "connectId": 587, "name": "Marcus Adeleke" }], "undoneAt": null, "undoneBy": null, "blocked": null }],
  "can": { "merge": true }
}
```

- `people` are sorted by first visit, oldest first.
- `visits` counts different service dates.
- `steps` counts the ticked checklist items.
- `logs` counts follow-up notes.
- `suggestedJourney` is the journey furthest along: Completed, then Active, then Closed; then by phase, steps and notes.
- Groups are sorted with the newest first visit first.
- `merges` is every merge, newest first. `blocked` says why one cannot be undone now (see undo below).
- Audited as `welcome.duplicates.view`.

### `POST /welcome/duplicates/merge`

```json
{ "keepId": 135, "mergeIds": [588], "journeyFrom": 588,
  "fields": { "firstName": 135, "phone": 588 },
  "rowVers": { "135": 1, "588": 1 } }
```

| Field | Meaning |
|---|---|
| `keepId` | The record that stays. Its `connectId` survives |
| `mergeIds` | The records merged into it |
| `journeyFrom` | Whose follow-up journey carries on |
| `fields` | For each of `firstName`, `lastName`, `phone`, `email`, `address`, `city` and `zip`, the record whose value to keep. Address brings its apartment; city brings its state. A field left out keeps the kept record's value |

Effect, in one transaction:
1. The chosen journey (status, phase, assignees, attempts, checklist, outcomes) is copied onto the kept record.
2. Every form entry and every follow-up log of the merged records moves to the kept record. The logs show the kept name.
3. Visit numbers are recounted by service date. The first visit becomes the earliest one. If there is more than one date, the person is marked as returned, with the second date as `returnVisitDate`. That feeds LCM "Came back within 30 / 90 days".
4. The merged records leave every list and count: Connect queues, metrics, Welcome and LCM. They are kept as `status = Closed`, `closedReason = "Merged"`, with `mergedInto`, `mergedAt` and `mergedById`, for the audit trail.
5. `rowVer` of the kept record goes up by 1.

Returns 200 `{ "mergeId": "…", "kept": { …person }, "merged": [588] }`. The backend stores, with the merge, what undo needs: every record as it was, the owner and visit number of each form entry, the owner and guest name of each log, and the kept record's `rowVer` right after the merge. Audited as `welcome.duplicates.merge`:
- `before.records` lists every record (name, contact fields, visits, journey status and phase);
- `after` holds the kept id, merged ids, `journeyFrom`, the chosen values and the visit count.

| Status | `code` | When |
|---|---|---|
| 404 | `NOT_FOUND` | A record no longer exists (merged already) |
| 409 | `CONFLICT` | A `rowVers` entry is stale |
| 409 | `NOT_DUPLICATE` | The records no longer share a phone or email (someone edited them, or marked the pair). Merging is only allowed inside one current group |
| 422 | `VALIDATION_FAILED` | No `mergeIds`; `journeyFrom` or a `fields` value is not one of these records |

The screen asks for confirmation first, naming every record and the consequence. The success toast offers Undo.

### `POST /welcome/duplicates/merges/{mergeId}/undo`

Undo a merge (TKP asked for it, 2026-11-25). No body. Effect:
1. The merged records come back to every list, as they were, with `rowVer` + 1.
2. Every form entry and log that existed at the merge goes back to its owner, with its visit number and guest name.
3. Logs and entries added to the kept record **after** the merge stay with the kept record.
4. The kept record gets back its own details and journey, **unless follow-up was saved on it since** (its `rowVer` moved on from the merge). Then it keeps its current journey, gets back its details only, and the response says `journeyKept: true`.

Returns 200 `{ "restored": [588], "journeyKept": false }`. Audited as `welcome.duplicates.unmerge`.

| Status | `code` | When |
|---|---|---|
| 404 | `NOT_FOUND` | No such merge |
| 409 | `ALREADY_UNDONE` | Undone already |
| 409 | `MERGED_AGAIN` | The kept record was merged into another one since (undo that one first), or a merged record is back already |

The screen asks first (not red: nothing is lost) and lists merges under **Merged**.

### `POST /welcome/duplicates/dismiss`

"Not the same person", for example a couple sharing the home phone. Body: `{ "ids": [146, 589], "note": "Husband and wife share the home phone." }`, where `note` is optional (up to 300 characters).
- Every pair in `ids` is remembered and never suggested again.
- Returns 200 `{ "dismissed": ["146-589"] }`.
- Audited as `welcome.duplicates.dismiss`.
- Errors: 422 `VALIDATION_FAILED` for fewer than 2 records, or records that don't exist.

### `DELETE /welcome/duplicates/dismissed/{key}`

Puts a pair back in the review list (the screen's "Put back for review" and the toast's Undo). `key` is the two `connectId`s, sorted, joined with `-`. Returns 200 `{ "restored": true }`, audited as `welcome.duplicates.restore`. Errors: 404 `NOT_FOUND`.

**Decided (TKP, 2026-11-25):** match on typed values until guests verify them; the Welcome Lead merges too; merges can be undone.

---

## 11. Import (M7)

PRD W-16 ("import wizard for past guest entries and follow-up tracker records with column matching, preview and error report"), WT-5, WT-7, 4.4 "Spreadsheet parsing". It is built as the **shared import engine** that the programme import (EV-23 to EV-29) and positions upload (P-4) reuse, so it follows their rules:
- the steps: start, columns and settings, preview and fix, confirm;
- file safety;
- partial import;
- undo;
- "importing the same file again creates no duplicates".

Screens: Welcome › Import (`/welcome/import`) and the wizard (`/welcome/import/{id}`). The mock is `src/mocks/import-api.ts` (rules) and `src/mocks/import-parse.ts` (reading files), with tests in `src/mocks/import-api.test.ts`.

| Key | Who |
|---|---|
| `welcome.import` | Tech Admin, Church Admin, Integration Admin, Welcome Lead (TKP, 2026-11-25): past guest entries |
| `welcome.import.followups` | Tech Admin, Church Admin, Integration Admin: follow-up tracker records (Connect notes) too |

Everyone else gets `403 FORBIDDEN`. Someone without `welcome.import.followups` gets 403 when uploading follow-up records, never sees those imports in the list, and can't open or undo them. `can.followups` in the list tells the screen whether to offer them. **Imports never send anything** to guests or staff, and never publish anything.

### Files (PRD EV-26, 4.4)

- **Formats:** `.xlsx` and `.csv` only.
  - `.xlsm`, `.xls` and `.xlsb` are refused with 415 `UNSUPPORTED_FILE`. The message says to save the file as .xlsx.
- **Limits:** up to 10 MB (413 `FILE_TOO_LARGE`) and 5,000 rows per sheet (422 `TOO_MANY_ROWS`). An empty file is 422 `EMPTY_FILE`; one that can't be read is 422 `UNREADABLE_FILE`.
- **Parsing.** The backend parses in a sandboxed background job, with memory and time limits.
  - It reads cached cell values only and **never evaluates a formula**.
  - It rejects macros, embedded objects and external links, and virus-scans the file.
  - Excel dates arrive as dates.
- **CSV:** UTF-8 with or without a byte order mark. The delimiter (`,` `;` or tab) is detected. Quoted cells may contain the delimiter, `""` and line breaks.
- **Storage.** The uploaded file goes to private storage. It is deleted after the retention period (default 30 days, a Setting).
- **Drafts.** A staged draft is **private to whoever uploaded it** and expires after 24 hours.

### What a row becomes

**Past guest entries** (`kind: "guests"`). One row is one visit (one welcome-form entry).

| Field | Notes |
|---|---|
| `serviceDate` (required) | A date in any common form: `2025-03-02`, `3/2/2025` (the `dateOrder` setting says month or day first), `Mar 2, 2025`, `2 March 2025`, or an Excel serial number such as `45601` (as Excel writes it into CSV). A future date is an error |
| `serviceType` | Must name a service from §8 (any letter case), else the `defaultService` setting. Otherwise an error that can be fixed in place |
| `firstName`, `lastName`, `phone`, `email`, `gender`, `maritalStatus`, `ageBracket`, `address`, `city`, `state`, `zip`, `country`, `howHeard`, `whoInvitedYou`, `willComeAgain`, `likeToBecomeMember`, `prayerRequest`, `comments` | Phones are normalised as in §10, then shown as `(832) 555-0901`. Choices take common short forms (`F`, `M`, `Y`, `N`). A value that isn't recognised is left out with a **warning**; it never blocks the row |
| `rating.Music` … `rating.Traffic` | Whole numbers from 0 to 10; anything else is left out with a warning |

- **Matching (A-1).** A row is matched to an existing guest **by phone or email, never by name**. If the name differs, the row gets a warning.
  - When the phone or email belongs to two records (a duplicate not merged yet), the row links to the oldest and warns.
- **One person, several rows.** Rows in the same file with the same phone or email are one new guest ("Same new guest as row 3").
- **Row key.** A row's key is the person and the service date (BR-02).
  - The same key twice in one file is an error on the later row.
  - A key that already exists is `unchanged` when every filled-in value matches, else `update`, with the list of `changes`.
  - **A blank cell never clears a value.**
- **Errors:** no service date, an unknown service, or no name, phone or email at all. A row with a name but no phone or email gets a warning: it can't be matched or followed up.
- **New guests.**
  - With `followUp: "history"` (the default), a person is created with their journey closed as `Imported history`, so no follow-up clock starts.
  - With `"start"`, people whose visit was in the last 14 days get an active, unassigned journey; older ones are still history.
- **Visit numbers** are recounted for every person touched. A second date marks the person as returned, which feeds LCM "Came back within 30 / 90 days".

**Follow-up tracker records** (`kind: "followups"`). One row is one contact: a Connect log (§3).

| Field | Notes |
|---|---|
| `date` (required) | A date with an optional time (`6:30 PM`, `18:30`) in church time; no time means noon. Stored as a UTC instant |
| `phone` / `email` | Finds the guest. **One of them is required**, and the guest must already exist: "Import their guest entry first" |
| `guestName` | Shown, and compared for a warning; **never used to match** |
| `team` | `Church office` (also `CO`) or `Integration` (also `IT`), else the `defaultTeam` setting |
| `caller` | Matched to a TKP Hub user by full name. Otherwise saved **by name only**, with a warning |
| `method`, `callOutcome`, `wantsMembership`, `lifeGroup`, `note` | `method` defaults to Phone Call |

- **Row key:** guest, the minute of `date`, and team.
- **What it adds:** logs only (marked "Imported from the follow-up tracker"). The guest's journey, checklist and assignees don't change.

**Columns that match nothing.** They go into `comments` / `note` as `Header: value` (`unmapped: "notes"`, the default), or are left out (`"ignore"`).

### `GET /welcome/imports`

Returns `{ items: ImportSummary[], can: { import } }`, newest first: committed and undone imports, plus **your own** drafts.

```json
{ "id": "…", "kind": "guests", "fileName": "Welcome cards 2025.xlsx", "fileSize": 3394, "status": "committed",
  "createdAt": "…", "createdBy": "Esther Coleman", "counts": { "total": 10, "new": 7, "update": 0, "unchanged": 0, "error": 3, "warnings": 2 },
  "result": { "added": 7, "updated": 0, "unchanged": 0, "failed": 3, "newGuests": 5 },
  "committedAt": "…", "committedBy": "Esther Coleman", "undoneAt": null, "undoneBy": null, "undoUntil": "…", "expiresAt": "…" }
```

`status` is `draft`, `committed`, `undone` or `discarded`.

### `POST /welcome/imports` (upload and analyse)

Multipart, with `kind` (`guests` or `followups`) and `file`. Returns 201 with the job (below):
- the first sheet with rows is chosen;
- the header row is found (the first of the first 10 rows with two or more text cells);
- columns are matched;
- the preview is built.

Audited as `welcome.import.upload`. The real backend may answer 202 and finish the analysis in the background; the screen then polls `GET /welcome/imports/{id}`.

### `GET /welcome/imports/{id}` · `PATCH /welcome/imports/{id}`

The job: the summary above, plus:

| Field | Content |
|---|---|
| `sheets[]` | `{ name, rows }`; `sheet` is the chosen one |
| `columns[]` | `{ index, header, samples (up to 3), field, confidence }`, where `confidence` is 1 for a known header name, 0.6 for a partial match (shown as "Check this"), 0 for none |
| `fileHeaders[]` | The header cells, kept after commit for the error file |
| `settings` | `{ headerRow, dateOrder: "MDY" \| "DMY", unmapped: "notes" \| "ignore", mode: "add" \| "update", defaultService, followUp: "history" \| "start", defaultTeam: "church_office" \| "integration" }` |
| `rows[]` | `{ rowNo (as Excel numbers it), status: new \| update \| unchanged \| error, values, cells (as in the file), errors: [{ field, message }], warnings[], match, changes: [{ field, from, to }], fixed[] }` |
| `services[]` | Service names, for the settings and fixes |
| `mine` | Whether you uploaded it |

`PATCH` takes any of the following and returns the new job:

| Key | Effect |
|---|---|
| `sheet` | Re-detects the header row and the columns, and clears fixes |
| `mapping` | `{ "<column index>": "<field>" \| null }`. One column per field: choosing a field takes it off any other column |
| `settings` | Partial. A new `headerRow` re-matches the columns |
| `fixes` | `[{ rowNo, field, value }]`: fix in place; the row is checked again |

Errors:
- 404 `NOT_FOUND` for someone else's draft, or a discarded or expired one;
- 409 `NOT_DRAFT` once it has been imported;
- 422 `VALIDATION_FAILED`.

The real backend should page `rows` (`?status=&page=`) for big files.

### `POST /welcome/imports/{id}/commit`

Body `{ "mode": "add" | "update", "idempotencyKey": "…" }`, also sent as the `Idempotency-Key` header.
- **Partial import:** `new` rows go in. `update` rows go in only with `mode: "update"`. `error` rows don't, and are listed in the error file.
- **Idempotent:** the same key again returns the first result. A different key on a committed job is 409 `NOT_DRAFT`.
- Returns the summary with `result`.
- Audited as `welcome.import.commit`, with `after` holding added, updated, failed and new guests.
- The job keeps, for undo: what it created, what it changed (before and after), and the `rowVer` of each record it touched.

**Error file.** The front end builds it from `rows` with `status = error`: the original cells, then "Row in the file" and "What to fix". It is saved as CSV, and **any cell that starts with `=`, `+`, `-` or `@` gets a leading `'`** so a spreadsheet never runs it (formula injection, EV-31).

### `POST /welcome/imports/{id}/undo`

Body `{ "force": false }`. Allowed for 30 days after commit (else 409 `UNDO_EXPIRED`). Undo:
- removes the entries, logs and new guests it added, and the logs on those new guests;
- puts back the entries it changed;
- restores visit numbers and the returned flag on guests it touched, unless they changed since.

If something it added was worked on since (follow-up saved on a new guest, a changed visit changed again, a new guest merged away), the answer is 409 `CHANGED_SINCE`, with `fields.changed` listing each item in plain words. The screen shows the list and asks again; `force: true` then undoes anyway (EV-28: "undo it only with a warning and a list").

Other errors: 409 `ALREADY_UNDONE`, 409 `NOT_COMMITTED`. Audited as `welcome.import.undo`.

### `DELETE /welcome/imports/{id}`

Discards a draft: the staged file and fixes are deleted. Audited as `welcome.import.discard`. 409 `NOT_DRAFT` once imported (undo instead). The screen asks first.

**Templates and samples.** The start screen offers a CSV template per kind: field names as headers and one fictional example row, so every column matches on upload. In mock mode it also links two **fictional** sample files in `public/samples/`:
- `tkp-guests-sample.xlsx`: two sheets, a title row, messy headers, every kind of error;
- `tkp-followups-sample.csv`: rows for the seeded duplicate guests, plus an unknown phone and an unknown caller.

### The TKP Hub standard layout (adopted, 2026-11-25)

The old follow-up tracker's export is not available, so TKP adopted the template's columns as **the** layout for any file brought in: the tracker export, old guest lists, and the welcome-desk spreadsheets. Files in this layout match every column with no checking. Other layouts still work through column matching.

- **Past guest entries:** Service date, Service, First name, Last name, Phone, Email, Gender, Marital status, Age range, Address, City, State, ZIP, Country, How they heard about us, Who invited them, Will come again, Would like to become a member, Prayer request, Comments, Rating: Music, Rating: Preaching, Rating: Comfort, Rating: Hospitality, Rating: Church environment, Rating: The people, Rating: Parking, Rating: Traffic.
- **Follow-up tracker records:** Date and time, Guest phone, Guest email, Guest name, Team, Caller, Method, Outcome, Wants membership, Life group, Note.

Only the date (and, for follow-up records, a phone or email) is required; the rest may be left out or empty. The templates on the start screen are this layout, with one fictional example row. A test checks that every template column matches its field.

**Defaults confirmed by TKP (2026-11-25):** dates are read month first (US), and new guests from a file are added as history (no follow-up starts). Both can still be changed per import.

---

## 12. Reports hub (M7)

PRD PL-2 to PL-5, W-9 ("scheduled share to teams"), W-10, W-11, 8.3 ("reports hub, share a report, leadership monthly pack preview, executive snapshot"), and 8.2 ("rebuild the Power BI pages … replace manual PDF/CSV forwarding with scheduled report sharing"). Screens: Reports › Library (`/reports`), one report (`/reports/{id}`) and Reports › Schedules (`/reports/schedules`). The mock is `src/mocks/reports-api.ts`, with its tests in `src/mocks/reports-api.test.ts`.

| Key | Who |
|---|---|
| `reports.view` | Everyone who sees LCM Metrics: Tech Admin, Tech Team, Lead Pastor, Church Admin, Church Office Admin, Integration Admin, Welcome Lead |
| `reports.share` | Tech Admin, Church Admin, Integration Admin, Welcome Lead, Lead Pastor: share now, and create, change, pause, send and delete schedules |

Each report also has its own key (below). The library lists only the reports the person may open.

**Totals only, and groups under five are never shown alone (PL-1):**
- cities with fewer than 5 guests (this year and last) fold into one row, `"Fewer than 5 each (N places)"`, with `grouped: N`;
- a retention month with fewer than 5 first-time guests is `hidden: true`, with its numbers zeroed;
- inviters with only one guest are left out, as in LCM.

### The library

| `id` | Report | Key | Where | Periods | Share as |
|---|---|---|---|---|---|
| `lcm-pack` | Leadership monthly pack | `welcome.lcm.view` | `/welcome/lcm` (§5) | last full month, this month so far | link, PDF |
| `ratings-referrals` | Ratings and referrals (W-10) | `reports.view` | hub | last full month, last 3 / 6 full months, year to date | link, PDF, CSV |
| `ytd-service-location` | Year to date by service and location (W-11, PL-2) | `reports.view` | hub | year to date | link, PDF, CSV |
| `retention` | Retention (PL-3, C-13) | `reports.view` | hub | last 3 / 6 full months, year to date | link, PDF, CSV |
| `team-metrics` | Follow-up team metrics | `connect.metrics.view` | `/connect/metrics` | n/a | not shared |
| `executive` | Executive snapshot | `dashboard.view` | `/dashboard` | n/a | not shared |

**Periods** are resolved in church time when the report runs:

| Period | Months |
|---|---|
| `last_full_month` | Last month |
| `month_to_date` | This month to today |
| `last_3_months`, `last_6_months` | The full months before this one |
| `year_to_date` | January to today |

The answer carries `range: { from, to, label, inProgress }`, for example `"Aug – Oct 2026"`.

### `GET /reports`

Returns `{ reports: [ReportDef + { schedules, lastShared }], can: { share } }`.

### `GET /reports/{id}?period=&type=`

`type` filters by service. It must be a service from §8, else 422. A missing or wrong `period` falls back to the report's first period. Returns `{ id, data }`. Audited as `reports.view`.

- **`ratings-referrals`:**
  - `guests`, and `rated` (guests who rated at least one area).
  - `ratings[]`: `{ area, average (0–10, a blank is no answer), rated, low (5 or below), owner }`, where `owner` is the department its low-rating alert goes to (§5).
  - `howHeard[]`, `cities[]` (small places grouped) and `cells[]`, each `{ label, guests, share, grouped? }`.
  - `inviters[]`: `{ name, guests }`, two or more guests, top 10.
- **`ytd-service-location`:** first-time guests (`visitNumber = 1`) from 1 January to today, against the same days last year.
  - `thisYear`, `lastYear`, and `byMonth[]` as `{ month, thisYear, lastYear }`.
  - `byService[]`, `byCell[]` and `byCity[]` (small places grouped), each `{ label, guests, prior, grouped? }`.
- **`retention`:** for each first-visit month in the period, first-time guests confirmed back within 30 days of their first visit.
  - Each cohort is `{ month, firstTime, back, rate, viaForm, viaConnect, viaBoth, open, hidden }`, with `total: { firstTime, back, rate }`.
  - **Signals:** `viaForm` means a later form entry from the same person; `viaConnect` means Connect "Returned for 2nd visit" with a return date in the window; `viaBoth` means both.
  - `open`: guests whose 30 days aren't over and who aren't back yet.

### `POST /reports/{id}/export`

Body `{ "format": "pdf" | "csv", "period", "type" }`. The screen calls it **before** it prints or downloads, so every export is logged. Returns `{ "logged": true }`. Audited as `reports.export` (category exports).
- The CSV is built by the front end from the same data, with the period on top. Cells starting with `= + - @` are prefixed with `'`.
- The PDF uses the browser's print (the LCM print path).

### Share now: `GET /reports/{id}/recipients` · `POST /reports/{id}/share`

`recipients` lists active staff (not member-only accounts) as `{ id, name, roles, eligible, reason }`. **Only people who may open the report themselves are eligible**: a share never widens access.

`share` takes `{ period, serviceType, format: "link" | "pdf" | "csv", recipients: [ids], message }` and returns 201 with the run. Audited as `reports.share` (category exports).

**Errors:**
- 422 `VALIDATION_FAILED`: `fields.recipients` lists, for example, "Naomi Bello can't open this report". Also returned for a period or format the report doesn't offer.
- 422 `NOT_SHAREABLE`: team metrics and the executive snapshot.
- 403 without `reports.share`.

**Delivery (backend).** Email to each recipient's staff address:
- `link`: a link to the report in TKP Hub; they sign in to see it. This is the default for anything personal.
- `pdf` / `csv`: the file is attached, generated by the background job (PRD 4.4 "report exports", 8.2 "very large exports: background jobs, streaming, size caps").
- Never sent to anyone outside the staff list.

### Schedules: `/reports/schedules`

| Call | Body or effect | Audit |
|---|---|---|
| `GET` | `{ items: Schedule[], runs: ReportRun[] (newest 30), can: { share } }`, limited to reports the person may open | |
| `POST` | `{ reportId, name (2–80, unique), period, serviceType, frequency: "monthly" \| "weekly", day (monthly 1–28; weekly 0 = Sunday … 6), time ("HH:MM" church time), format, recipients, message }` → 201 | `reports.schedule.create` |
| `PUT /{id}` | The same plus `rowVer`. 409 `CONFLICT` if stale | `reports.schedule.update` (changed fields only) |
| `POST /{id}/pause` · `/resume` | `{ rowVer }` | `.pause` / `.resume` |
| `POST /{id}/run` | Send now (the job does the same at `nextRunAt`) | `reports.schedule.run` (category exports) |
| `DELETE /{id}` | The screen asks first. Runs already sent stay in the history | `reports.schedule.delete` |

- **`Schedule`:** `{ id, reportId, reportTitle, name, period, serviceType, frequency, day, time, format, recipients: [{ id, name }], message, active, nextRunAt (null when paused), lastRun, createdBy, createdAt, rowVer }`.
- **`ReportRun`:** `{ id, at, reportId, reportTitle, scheduleId, scheduleName, period (the resolved label), format, sentTo: [names], by ("Schedule" or a person), status: "sent" | "skipped", note }`.
- **Days** stop at 28 so every month has one.
- **Next run.** `nextRunAt` is the next church-time occurrence after now; daylight saving is handled.
- **Recipients checked at send time.** Each run, and each send now, checks the recipients again. Anyone who can no longer open the report is skipped and named in `note`. If no one is left, the run is `skipped`.

**Mock data:** two schedules ("LCM pack for the leadership council", monthly on the 2nd at 08:00, PDF to four people; and a paused weekly one), plus past runs. Separately, to give retention its follow-up signal, about one guest in nine has "Returned for 2nd visit" set, within four weeks of their first visit.

**Open questions:**
- **Sender** and reply-to address for report emails.
- **PDF attachments.** Should they be allowed, or links only? Links keep the numbers behind sign-in.
- **Reconciliation.** The Power BI figures each hub report must match before Power BI is turned off (8.2).
