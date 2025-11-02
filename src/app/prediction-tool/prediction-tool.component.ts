import { Component, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartEvent, ChartType } from 'chart.js';
import { isPlatformBrowser } from '@angular/common';

import { ml_model_list } from '../lists';
import { town_list } from '../lists';
import { storey_range_list } from '../lists';
import { flat_model_list } from '../lists';
import { StorageService } from '../services/storage.service';

@Component({
    selector: 'app-prediction-tool',
    imports: [ReactiveFormsModule, MatFormFieldModule, MatToolbarModule, MatSelectModule, MatInputModule, MatDatepickerModule, MatNativeDateModule, MatButtonModule, NgChartsModule],
    templateUrl: './prediction-tool.component.html',
    styleUrl: './prediction-tool.component.css'
})
export class PredictionToolComponent implements OnInit {
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly storageService = inject(StorageService);
  private readonly formBuilder = inject(FormBuilder);

  ml_models = ml_model_list;
  towns = town_list;
  storey_ranges = storey_range_list;
  flat_models = flat_model_list;

  minDate = new Date("1960-01-01");
  maxDate = new Date("2022-02-01");

  predictionForm = this.formBuilder.group({
    mlModel: 'Support Vector Regression',
    town: 'ANG MO KIO',
    storeyRange: '01 TO 03',
    flatModel: '2-room',
    floorAreaSqm: 1,
    leaseCommenceDate: new Date("2022-02-01"),
  });

  ngOnInit() {
    if (this.isBrowser) {
      // Load saved form data if available (only in browser)
      const savedForm = this.storageService.getItem<any>('predictionFormData');
      if (savedForm) {
        // Convert the date string back to a Date object
        savedForm.leaseCommenceDate = new Date(savedForm.leaseCommenceDate);
        this.predictionForm.patchValue(savedForm);
      }

      // Subscribe to form changes to save them
      this.predictionForm.valueChanges.subscribe(value => {
        this.storageService.setItem('predictionFormData', value);
      });
    }
  }

  onSubmit() {
    if (this.predictionForm.valid) {
      const formData = this.predictionForm.value;
      console.log('Form submitted:', formData);
      // Handle form submission logic here
    }
  }

  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        display: true
      },
      title: {
        display: true,
        text: 'Predicted Trends'
      }
    },
    // Ensure animations are disabled during SSR
    animation: {
      duration: this.isBrowser ? 400 : 0
    }
  };

  public barChartData: ChartData<'bar'> = {
    labels: ['2006', '2007', '2008', '2009', '2010', '2011', '2012'],
    datasets: [
      { 
        data: [65, 59, 80, 81, 56, 55, 40], 
        label: 'Predicted Price',
        backgroundColor: 'rgba(25, 118, 210, 0.5)',
        borderColor: 'rgb(25, 118, 210)',
        borderWidth: 1
      }
    ],
  };
}
