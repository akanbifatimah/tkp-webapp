# Handoff: TKP Admin Web App

Read this first. It carries over the context from the TKP New Members Connect form project, so a new session can start on the admin app without re-deriving decisions.

_Written 2026-11-18. Source project: `TKP-NEW-MEMBERS-CONNECT-FORM` (sibling folder)._

---

## 1. What we're building

A **redesign of The King's Palace (TKP) church's existing admin web app**, covering their own modules plus modules for other departments.

- **The client's workflow is the source of truth.** Their current admin app works and holds live data. The client rejected an earlier admin build because it didn't match how they work. We change the **look and experience**, not the process: mirror their flows, roles, modules and data fields first, and **ask before departing from their workflow**.
- **Multiple user roles.** Derive them from the client's repo, not from assumptions.
- **Modules for other departments** come from a PRD the user will share, to be placed in `docs/`.
- **Mock data only.** Never connect to or copy their live data, `.env` files or secrets.

## 2. Stack (decided)

**Harris Consult stack: React + TypeScript.**

- Before scaffolding, inspect the client's repo and match their conventions where sensible (routing, state, folder structure, API style). That makes handover to their backend developer easier.
- Animation: **Motion** (`motion/react`), the same library used on the public form. Use GSAP only if something needs scroll-linked timelines.
- Charts: pick one that animates (e.g. Recharts or visx).
- 3D, optional: **Three.js** via React Three Fiber + drei, the same as the form's hero crown. Use it only on the login screen or the dashboard header, never on work screens.

## 3. Design

- **Figma file:** `tftEO6O0fcSeIWzEZzHcv6`. The "TKP Hub" admin dashboard design is at node `125:4815`. **This is the design to follow.** Read it through the Figma MCP (`create_session`, then load the `/figma-design-to-code` skill before `get_design_context`).
- **Brand palette** (from the Figma frame; the same tokens are in the form's `src/app/globals.css`):

| Token | Hex |
|---|---|
| Maroon (primary) | `#6E0D12` (gradient `#680D11` → `#2F0D0B`) |
| Maroon 600 | `#8C1A20` |
| Near-black / ink | `#210E0A` |
| Cream | `#FAF7EF` / `#FBF2E8` |
| Gold (accent) | `#D4AF37` (light `#ECD690`) |
| Navy (headings) | `#022448` |

- **Fonts on the public form:** Fraunces (display) and Nunito (body).
- **Logo:** `public/tkp-logo.png` in the form project. Original: https://i0.wp.com/rccgthekingspalace.com/wp-content/uploads/2024/08/tkp_favion.png
- **Church:** The King's Palace (RCCG), 5371 East Fifth Street, Katy, TX 77493.

## 4. Animation and interactivity

The project manager wants **more animation and interactivity**. Staff use this app all day, so motion must feel **fast and purposeful and never block work**:

- Page and tab transitions; panels and dialogs that slide in.
- Lists and table rows animating in; skeleton loading placeholders instead of spinners.
- Dashboard numbers that count up; charts that draw in.
- Drag-and-drop where it matches their workflow (e.g. assigning newcomers to cell groups or follow-up stages).
- Micro-interactions: hover states, success animations, undo toasts.
- Keep durations short (about 150–300 ms for UI).
- Always respect `prefers-reduced-motion`.

## 5. Data and API approach (same as the form project)

- **All network calls go through one client API module** (e.g. `src/lib/api.ts`). Nothing else in the UI calls `fetch`. Its base URL comes from an env var, so swapping mocks for the real backend is a one-line change.
- **Mock layer** with realistic seed data, shaped so the backend developer can read off the endpoints directly.
- Document every endpoint in **`docs/API.md`** with request/response JSON, an error envelope and status codes.
- Error shape used on the form, kept consistent across both apps:
  ```json
  { "error": { "code": "VALIDATION_FAILED", "message": "Friendly text", "fields": { "contact.phone": ["Too short"] } } }
  ```
- **New-member submissions** from the public form have a defined shape: see the form project's `docs/API.md` (`POST /new-members`, `GET /new-members` for admin) and `src/lib/schema.ts` → `toSubmissionPayload`. The admin app's newcomer module should consume **this same shape**. It also maps to the original WPForms field ids (`WP_FIELD_MAP` in `src/lib/form-config.ts`) for migrating existing data.
- Validation: Zod schemas shared between forms and the API layer, as on the form project.

## 6. Standing preferences (apply without being asked)

- **`cursor: pointer` on every clickable element** (buttons, links, selects, clickable labels/radios/checkboxes, `[role=button]`), and `not-allowed` when disabled. In Tailwind v4, add it as an `@layer base` rule in the global CSS.
- **Tailwind v4 canonical classes**: `h-150`, not `h-[600px]`; `bg-white/4`, not `bg-white/[0.04]`; `rounded-xs`, not `rounded-[2px]`. Use arbitrary values only when no exact canonical class exists. Check with Tailwind's `canonicalizeCandidates([cls], { rem: 16 })`.
- Responsive from the start: check at phone (360–430 px), tablet (768 px) and desktop widths.
- Accessible: visible focus rings, labelled controls, good contrast. The PM flagged contrast on a translucent button, so prefer solid backgrounds for controls placed over imagery.

## 7. Lessons from the form project

- **Duplicate React keys:** the countries list pinned common countries at the top *and* listed them alphabetically. Dedupe lists before mapping them to elements.
- **Cross-field validation with react-hook-form:** when one error covers several inputs (e.g. date of birth across month/day/year), register the other inputs with `deps: ["<field holding the error>"]`, or the error won't clear.
- **R3F camera:** the default camera calls `lookAt(0,0,0)`, so screen centre is world y=0, not the camera's y.
- **Verify the UI with real screenshots.** Headless Chrome's minimum window width is about 500px, so use CDP `Emulation.setDeviceMetricsOverride` for phone sizes. Software-rendered 3D needs a long wait before the scene settles.
- **Deployment (PipeOps):** `NEXT_PUBLIC_*` / `VITE_*` variables are baked in at **build** time, so set them before building and redeploy after changes. In-memory mock stores reset on every restart; run a single instance.

## 8. Workspace setup (planned)

```
c:\webworks\WORK\HarrisConsult\TKP\
├── TKP-NEW-MEMBERS-CONNECT-FORM\   ← public form (done, deployed on PipeOps)
├── <new admin repo>\               ← our admin app (new git repo)
└── <client's repo>\                ← cloned for reference only; do not commit to it
```

- Start Claude in the new admin folder, then `/add-dir` the client's repo so it can be read side by side.
- The new repo has two remotes, `origin` (the Harris-Consult org) and `personal`, as on the form project. When asked to push, push `main` to both.

## 9. First task for the new session

**Don't write app code yet.** First:

1. Study the client's repo: stack, roles and permissions, modules, data models and fields, existing API endpoints, and their workflow per role.
2. Read the PRD in `docs/` for the other departments' modules.
3. Review the Figma "TKP Hub" design (node `125:4815`) and list its screens and components.
4. Propose a plan for the user to approve: role matrix, module list with build order, how each Figma screen maps to their workflow, where animation adds value, mock data shape, and project structure.
