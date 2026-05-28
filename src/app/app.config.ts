import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { provideCharts } from 'ng2-charts';
import {
  CategoryScale,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideClientHydration(),
    provideHttpClient(withFetch()),
    provideCharts({
      registerables: [
        LineController,
        LinearScale,
        CategoryScale,
        PointElement,
        LineElement,
        Filler,
        Tooltip,
      ]
    }),
  ]
};
