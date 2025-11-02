import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./prediction-tool/prediction-tool.module')
      .then(m => m.PredictionToolModule)
  }
];
