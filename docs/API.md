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

### `GET /welcome/guests/{guestId}/entry` (API-W4 · View entry)

For roles that may use Guest lookup. 200: `{ entry }`, the welcome form exactly as submitted, with blanks as `null`.

- The `entry` fields are listed in `src/features/connect/types.ts` → `GuestEntry`.
- This is the **only** response that carries `prayerRequest`.
- If the person submitted twice that day, the latest entry is returned and `entriesThatDay` says how many there were.
- Audited as `welcome.entry.view`.
