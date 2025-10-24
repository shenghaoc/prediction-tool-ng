import { Component } from '@angular/core';

import { RouterOutlet } from '@angular/router';
import { PredictionToolComponent } from './prediction-tool/prediction-tool.component';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, PredictionToolComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'prediction-tool-ng';
}
