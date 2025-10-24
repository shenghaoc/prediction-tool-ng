import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import {MatToolbarModule} from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartEvent, ChartType } from 'chart.js';
import { isPlatformBrowser } from '@angular/common';
import { Inject, PLATFORM_ID } from '@angular/core';

import { ml_model_list } from '../lists';
import { town_list } from '../lists';
import { storey_range_list } from '../lists';
import { flat_model_list } from '../lists';

@Component({
    selector: 'app-prediction-tool',
    imports: [ReactiveFormsModule, MatFormFieldModule, MatToolbarModule, MatSelectModule, MatInputModule, MatDatepickerModule, MatNativeDateModule, MatButtonModule, NgChartsModule],
    templateUrl: './prediction-tool.component.html',
    styleUrl: './prediction-tool.component.css'
})
export class PredictionToolComponent {
  ml_models = ml_model_list;
  towns = town_list;
  storey_ranges = storey_range_list;
  flat_models = flat_model_list;

  minDate: Date;
  maxDate: Date;

  predictionForm = this.formBuilder.group({
    mlModel: 'Support Vector Regression',
    town: 'ANG MO KIO',
    storeyRange: '01 TO 03',
    flatModel: '2-room',
    floorAreaSqm: 1,
    leaseCommenceDate: new Date("2022-02-01"),
  });

  onSubmit() {
    // TODO: Use EventEmitter with form value
    console.warn(this.predictionForm.value);
  }


  isBrowser: boolean;
  constructor(private formBuilder: FormBuilder, @Inject(PLATFORM_ID) platformId: string) {
    this.minDate = new Date("1960-01-01");
    this.maxDate = new Date("2022-02-01");
    this.isBrowser = isPlatformBrowser(platformId);
  }

  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const
      },
      title: {
        display: false,
        text: 'Predicted Trends for Past 12 Months'
      }
    }
  };
  public barChartData: ChartData<'bar'> = {
    labels: ['2006', '2007', '2008', '2009', '2010', '2011', '2012'],
    datasets: [
      { data: [65, 59, 80, 81, 56, 55, 40], label: 'Series A' },
      { data: [28, 48, 40, 19, 86, 27, 90], label: 'Series B' },
    ],
  };
}
