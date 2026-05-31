import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
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
    provideHttpClient(withFetch()), // v22: withFetch() is deprecated; Fetch becomes the default — drop this argument when upgrading
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
