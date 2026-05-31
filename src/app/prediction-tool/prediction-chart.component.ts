import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import {
  CategoryScale,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip
} from 'chart.js';
import type { ChartConfiguration, Plugin } from 'chart.js';

/**
 * Renders the prediction line chart.
 *
 * Kept as its own standalone component so the heavy `chart.js` dependency —
 * registered here via the component-level `provideCharts` — is only pulled into
 * a lazy chunk when the parent's `@defer` block loads this component. The parent
 * deals only in chart.js *types* (erased at build time), so nothing chart.js
 * touches the eager/main bundle.
 */
@Component({
  selector: 'app-prediction-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Block host so the frame fills the column width, matching the previous layout
  // where `.chart-frame` was a direct block-level child of the chart shell.
  styles: ':host { display: block; }',
  imports: [BaseChartDirective],
  providers: [
    provideCharts({
      registerables: [
        LineController,
        LinearScale,
        CategoryScale,
        PointElement,
        LineElement,
        Filler,
        Tooltip
      ]
    })
  ],
  template: `
    <div class="chart-frame">
      <canvas
        baseChart
        [type]="'line'"
        [data]="data()"
        [options]="options()"
        [plugins]="plugins()"
      ></canvas>
    </div>
  `
})
export class PredictionChartComponent {
  readonly data = input.required<ChartConfiguration<'line'>['data']>();
  readonly options = input.required<ChartConfiguration<'line'>['options']>();
  readonly plugins = input.required<Plugin<'line'>[]>();
}
