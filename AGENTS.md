# AI Agent Quickstart

Use this file as a **thin router** for agents working in `prediction-tool-ng`. Keep task execution focused; load deeper references only when relevant.

`CLAUDE.md` and `GEMINI.md` both point here.

## What this repo is

Angular 21 derivative of the React `prediction-tool` app. It keeps feature parity with the source app while using Angular-native patterns: zoneless change detection, standalone components, signals, signal forms, custom accessible controls, and Chart.js via `ng2-charts`.

## Read first

- [**README.md**](README.md) — features, scripts, deployment, project layout, testing.
- [**`.agents/skills/angular-developer/`**](.agents/skills/angular-developer/) — Angular 21 guidance (signals, signal forms, testing, CLI). Load `SKILL.md` when generating or reviewing Angular code.
- [**`.jules/`**](.jules/) — accumulated repo-specific learnings (`bolt.md`, `palette.md`, `sentinel.md`). Check when touching performance, UI polish, or security headers.

## Project layout

```text
src/app/prediction-tool/           # main UI: form, results, chart shell
src/app/prediction-tool/combobox/  # accessible combobox control
src/app/prediction-tool/number-field/
src/app/services/                  # prediction API client, i18n, localStorage
worker/index.ts                    # Cloudflare Worker: POST /api/prices + static assets
wrangler.jsonc                     # Worker + D1 binding config
```

## Useful commands

```bash
npm install          # Install dependencies (npm + package-lock.json only)
npm start            # ng serve — UI dev server
npm run build        # Production Angular build → dist/prediction-tool-ng/browser
npm run watch        # Dev build on file changes
npm run test         # Vitest browser mode (Chromium via Playwright)
npm run preview      # Build, then wrangler dev (Worker + D1 locally)
npm run deploy       # Build, then wrangler deploy
npm run cf-typegen   # Regenerate CloudflareEnv types (cloudflare-env.d.ts)
```

## Architecture

1. **Frontend** (`src/`): single prediction feature in `PredictionToolComponent` + `PredictionService`. Form state uses signals and reactive/signal forms; theme and language persist via `StorageService` (`localStorage`).
2. **API**: the app POSTs form data to `/api/prices`. Default URL is `PREDICTION_API_URL` in `src/app/services/prediction.service.ts` (points at the deployed Worker). Change it to target another backend.
3. **Worker** (`worker/index.ts`): handles `POST /api/prices` against the bound D1 database and serves the built SPA from `dist/prediction-tool-ng/browser` via the `ASSETS` binding configured in `wrangler.jsonc`.
4. **Charts**: Chart.js is registered in `PredictionChartComponent` and lazy-loaded with `@defer` so it stays out of the initial bundle.

## Code review policy

Applies to automated review agents (Claude via `.github/workflows/claude.yml`, Gemini, Codex, etc.).

### Process

1. Read **all** changed files in full — not diff excerpts alone.
2. Cross-reference existing bot reviews: note what is already fixed vs still open.
3. Trace consumers when refactoring signals, form models, or service return types.
4. Match CSS selectors to the real template hierarchy.
5. Remove dead code and flag missing tests for non-trivial logic.

### What to check

**Angular correctness**

- Signal/`computed`/`effect` semantics; avoid stale closures and redundant effects.
- Zoneless change detection: prefer signals and `OnPush`; avoid patterns that rely on Zone.js patching.
- Form validation aligned with `prediction-form.validators.ts` and accessible control state.
- `HttpClient` calls centralized in `PredictionService`; abort in-flight requests when inputs change.

**Performance**

- Do not call `getComputedStyle` inside hot `computed()` paths (see `.jules/bolt.md`); cache theme/chart colors on init or theme toggle.
- Keep Chart.js out of the eager bundle unless intentionally eager-loading.

**Security**

- Worker responses already set security headers in `worker/index.ts`; preserve them when editing the Worker.
- Validate/sanitize API responses in `PredictionService` before binding to the UI.
- Treat `localStorage` reads as untrusted; keep parsing defensive.

**Tests**

- Unit/smoke tests use `@angular/build:unit-test` with Vitest browser mode (`angular.json`).
- Browser smoke: `src/tests/smoke.browser.spec.ts`.
- Add or update specs when changing prediction math, API parsing, or form validation.

**Architecture (merge blockers)**

- Do not add runtime fetches to external data APIs from `src/` — predictions go through `/api/prices` on the Worker/D1 stack.
- Do not introduce alternate lockfiles (`yarn.lock`, `pnpm-lock.yaml`, `bun.lock`).
- Worker/D1 binding changes must stay consistent across `wrangler.jsonc`, `worker/index.ts`, and generated `cloudflare-env.d.ts` when applicable.

### Review output format

For PR summary comments (not every inline note):

- **Overview** — approach and whether it fits this codebase.
- **Automated review status** — resolved vs open bot findings.
- **Issues found** — severity, `file:line`, impact, concrete fix.
- **Positives** — what the PR does well.
- **Summary** — short verdict on correctness and risk.

### Platform tooling

- **Claude**: `@claude` in PR/issue comments (see `.github/workflows/claude.yml`).
- **Gemini / Codex**: via their usual PR comment triggers when enabled on the repo.

## Cursor / cloud agent notes

- Use **npm** only; `package-lock.json` is the lockfile.
- **UI-only**: `npm start` (Angular dev server).
- **Full stack locally**: `npm run preview` after `npm run build` — runs `wrangler dev` with the D1 binding from `wrangler.jsonc`.
- **Deploy**: `npm run deploy` builds then deploys the Worker + assets.
- Tests install Chromium through the Vitest/Playwright browser provider configured in `angular.json`; no separate WebKit E2E suite in this repo.
