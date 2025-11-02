import { ApplicationConfig, enableProdMode, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';

import { routes } from './app.routes';

// Enable production mode
enableProdMode();

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, 
      withPreloading(PreloadAllModules)  // Optional: preload modules in background
    ),
    provideClientHydration(),
  ]
};
