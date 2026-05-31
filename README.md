# Prediction Tool Angular

Angular derivative of the original React `prediction-tool` repo. This variant keeps feature parity with the upgraded source app while using Angular-native state, custom accessible form controls, `ng2-charts`, and local persistence for form values, theme, and language.

## Features

- bilingual UI (`en` / `zh`) with persisted language preference
- dark and light themes with persisted theme preference
- custom accessible form controls (combobox + number field) with signal-based validation
- predicted resale price output with a 12-month trend chart
- summary cards and a proper empty state before the first prediction
- saved form state between visits

## Tech stack

- Angular 21 (zoneless, standalone, signals)
- TypeScript
- signal forms (`@angular/forms/signals`) with custom accessible form controls
- Chart.js with `ng2-charts`
- Cloudflare Workers + D1 for the prediction API and asset serving

## Chart Strategy

For the Angular variant, charts stay on `Chart.js` through the Angular wrapper `ng2-charts`.

This keeps the rendering model Angular-native (bindings + change detection) instead of managing Chart.js instances manually.

## Development

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm start
```

Useful scripts:

```bash
npm run build      # production build
npm run watch      # rebuild on change (development configuration)
npm run test       # run the unit/browser tests
```

## Deployment

The app is deployed to Cloudflare Workers via `wrangler`. The worker (`worker/index.ts`) serves the built browser assets and handles the `/api/prices` endpoint, backed by a Cloudflare D1 database.

```bash
npm run preview    # build, then run the worker locally with `wrangler dev`
npm run deploy     # build, then `wrangler deploy`
npm run cf-typegen # regenerate CloudflareEnv bindings (cloudflare-env.d.ts)
```

## Project structure

```text
src/app/prediction-tool/                          # main prediction UI shell, form, and results view
src/app/prediction-tool/combobox/                 # custom accessible combobox control
src/app/prediction-tool/number-field/             # custom accessible number field control
src/app/services/i18n.resources.ts                # translation strings and option-label resources
src/app/services/translation.service.ts           # language signal and translation helpers
src/app/services/storage.service.ts               # localStorage persistence wrapper
src/app/lists.ts                                   # prediction option lists
src/app/app.component.ts                           # root Angular shell
src/app/app.config.ts                              # application providers (zoneless CD, HttpClient, charts)
worker/index.ts                                    # Cloudflare Worker: /api/prices handler + asset serving
wrangler.jsonc                                     # Cloudflare Worker / D1 configuration
```

## Prediction API

The form currently posts to:

```text
https://ee4802-g20-tool-ng.shenghaoc.workers.dev/api/prices
```

This endpoint is served by the Cloudflare Worker in `worker/index.ts`, which computes predictions from the bound D1 database. If you want to point the Angular app at a different backend, update the `PREDICTION_API_URL` constant in `src/app/prediction-tool/prediction-tool.component.ts`.

## Testing

The repo uses Angular's `@angular/build:unit-test` builder with Vitest browser mode, running tests in Chromium via Playwright (configured in `angular.json`):

- component smoke tests for the root shell and prediction page
- a browser smoke test (`src/tests/smoke.browser.spec.ts`) that bootstraps the app and exercises the combobox and number field
- zoneless testing configuration in the Angular test bed

## Notes

- This repo currently keeps the prediction flow in a single feature component plus small supporting services.
- The app uses signals for local UI state and signal forms for the prediction form.
- The current UI intentionally mirrors the upgraded React source app while staying Angular-native.
