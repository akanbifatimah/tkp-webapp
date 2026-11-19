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
