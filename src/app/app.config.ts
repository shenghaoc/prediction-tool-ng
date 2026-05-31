import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()), // v22: withFetch() is deprecated; Fetch becomes the default — drop this argument when upgrading
    // chart.js is registered at the component level in PredictionChartComponent so
    // it stays out of the eager bundle and ships in the lazy @defer chunk instead.
  ]
};
