# TKP Hub · Admin web

The web admin console for **The King's Palace (RCCG), Katy TX**. Front end only: React + TypeScript. It runs on an in-browser mock API until the backend is ready.

- Part 1 replicates **TKP Connect** (`integration-app`): sign-in, Welcome, Connect, Scripts and LCM, with the same behaviour and a new look.
- Part 2 adds the remaining modules from the TKP Hub PRD.
- The plan is in [docs/PLAN.md](docs/PLAN.md) and the API contract is in [docs/API.md](docs/API.md).

## Run it

```bash
npm install
cp .env.example .env   # mocks on by default
npm run dev            # http://localhost:5173
```

In mock mode the sign-in page has a **Demo accounts** list with one fictional person per role. Every demo account uses the password `Welcome1!`. *New Volunteer* has a temporary password, so it shows the forced "Choose your own password" step. Mock data resets when the page reloads, and that includes any password you change. The sidebar also links to a **UI kit** page.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Vitest (access matrix, API errors, church time, …) |

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | Base URL of the API |
| `VITE_USE_MOCKS` | `true` | `true` = the MSW mock API answers in the browser; `false` = call the real backend |
| `VITE_SHOW_UI_KIT` | `false` | `true` = show the developer UI kit (`/dev/ui`) in the sidebar. Ignored when mocks are off |

`VITE_*` values are baked in at **build** time. Set them before building, and rebuild after changing them.

## Layout

```
src/
  app/          router, providers, shell (sidebar, drawer), route guards
  lib/          api.ts (the only fetch), permissions.ts (roles → keys), nav, time (church time), motion
  components/   ui/ kit · three/ the sign-in crown (lazy-loaded)
  features/     auth · welcome · connect · … one folder per module
  mocks/        MSW handlers mirroring docs/API.md, and fictional seed data
docs/           PLAN.md · API.md · HANDOFF-ADMIN.md
```

## Rules of the road

- **Mock data only.** Never real guest data, `.env` files or secrets from TKP's systems.
- All network calls go through `src/lib/api.ts`.
- Access checks use permission keys from `src/lib/permissions.ts`, never role names in components.
- Exact wording from TKP Connect (Access Denied, the confidentiality chip, scripts, checklist and outcome labels) is copied, never paraphrased.
- Motion is 150–300 ms and respects reduced motion. 3D only on the sign-in screen.
- Every clickable element shows `cursor: pointer`. Tailwind classes are written in canonical form.
