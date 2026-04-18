# Prediction Tool Angular

Angular derivative of the original React `prediction-tool` repo. This variant keeps feature parity with the upgraded source app while using Angular-native state, Angular Material form controls, `ng2-charts`, and local persistence for form values, theme, and language.

## Features

- bilingual UI (`en` / `zh`) with persisted language preference
- dark and light themes with persisted theme preference
- Angular Material form controls with client-side validation
- predicted resale price output with a 12-month trend chart
- summary cards and a proper empty state before the first prediction
- saved form state between visits

## Tech stack

- Angular 21
- TypeScript
- Angular Material
- Chart.js with `ng2-charts`
- Angular SSR support

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
npm run build
npm run watch
npm run test
```

To run the SSR server after a production build:

```bash
npm run build
npm run serve:ssr:prediction-tool-ng
```

## Project structure

```text
src/app/prediction-tool/                         # main prediction UI shell, form, and results view
src/app/services/i18n.resources.ts              # translation strings and option-label resources
src/app/services/translation.service.ts         # language signal and translation helpers
src/app/services/storage.service.ts             # localStorage persistence wrapper
src/app/lists.ts                                # prediction option lists
src/app/app.component.ts                        # root Angular shell
src/app/app.config.ts                           # application providers and hydration setup
server.ts                                       # Node/Express SSR entrypoint
```

## Prediction API

The form currently posts to:

```text
https://ee4802-g20-tool.shenghaoc.workers.dev/api/prices
```

If you want to point the Angular app at a different backend, update the `PREDICTION_API_URL` constant in `src/app/prediction-tool/prediction-tool.component.ts`.

## Testing

The repo currently uses Angular's default Karma + Jasmine setup:

- component smoke tests for the root shell and prediction page
- zoneless testing configuration in the Angular test bed

## Notes

- This repo currently keeps the prediction flow in a single feature component plus small supporting services.
- The app uses signals for local UI state and reactive forms for the prediction form.
- The current UI intentionally mirrors the upgraded React source app while staying Angular-native.
