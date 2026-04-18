import { ChangeDetectionStrategy, Component } from '@angular/core';

import { PredictionToolComponent } from './prediction-tool/prediction-tool.component';

@Component({
  selector: 'app-root',
  imports: [PredictionToolComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}
