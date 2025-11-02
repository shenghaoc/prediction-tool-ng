import { ApplicationConfig, enableProdMode } from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';

// Enable production mode
enableProdMode();

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, 
      withPreloading(PreloadAllModules)  // Optional: preload modules in background
    ),
    provideClientHydration(),
    provideAnimations()
  ]
};
