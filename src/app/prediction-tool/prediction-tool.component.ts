import { Component, OnInit, inject, PLATFORM_ID, ViewChild } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { NgChartsModule, BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { isPlatformBrowser, CommonModule, DecimalPipe } from '@angular/common';

import { ml_model_list } from '../lists';
import { town_list } from '../lists';
import { storey_range_list } from '../lists';
import { flat_model_list } from '../lists';
import { StorageService } from '../services/storage.service';
import { TranslationService } from '../services/translation.service';

@Component({
    selector: 'app-prediction-tool',
    templateUrl: './prediction-tool.component.html',
    styleUrl: './prediction-tool.component.css',
    imports: [
        ReactiveFormsModule,
        MatFormFieldModule,
        MatToolbarModule,
        MatSelectModule,
        MatInputModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatButtonModule,
    NgChartsModule,
    CommonModule,
    DecimalPipe
    ]
})
export class PredictionToolComponent implements OnInit {
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly storageService = inject(StorageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly translationService: TranslationService = inject(TranslationService);

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

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

  // UI state
  loading = false;
  predictedPrice = 0;

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
    if (!this.predictionForm.valid || !this.isBrowser) return;
    this.loading = true;
    this.predictedPrice = 0;

    (async () => {
      try {
        const values: any = this.predictionForm.value;

        const monthEnd = formatYYYYMM(values.leaseCommenceDate);
        const monthStart = formatYYYYMM(subtractMonths(values.leaseCommenceDate, 12));

        const fd = new FormData();
        fd.append('ml_model', values.mlModel);
        fd.append('month_start', monthStart);
        fd.append('month_end', monthEnd);
        fd.append('town', values.town);
        fd.append('storey_range', values.storeyRange);
        fd.append('flat_model', values.flatModel);
        fd.append('floor_area_sqm', (values.floorAreaSqm ?? '').toString());
        fd.append('lease_commence_date', (new Date(values.leaseCommenceDate)).getFullYear().toString());

        const response = await fetch('https://ee4802-g20-tool.shenghaoc.workers.dev/api/prices', {
          method: 'POST',
          body: fd
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`API request failed: ${text}`);
        }

        const server_data: Array<{ labels: string; data: number }> = await response.json();

        // Update chart labels and data
        this.chartData.labels = server_data.map(x => x.labels);
        this.chartData.datasets[0].data = server_data.map(x => x.data);
        this.predictedPrice = server_data[server_data.length - 1]?.data ?? 0;

        // Refresh chart
        this.chart?.update();
      } catch (err: any) {
        console.error(err);
        alert(err?.message || 'Failed to fetch prediction.');
      } finally {
        this.loading = false;
      }
    })();
  }

  private updateChart(newData: number[]) {
    if (this.chart && this.chart.chart) {
      this.chart.chart.data.datasets[0].data = newData;
      this.chart.chart.update();
    }
  }

  protected readonly chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      title: {
        display: true,
        text: 'Predicted Housing Prices'
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: 'Price (SGD)'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Month'
        }
      }
    },
    animation: {
      duration: this.isBrowser ? 400 : 0
    }
  };

  protected chartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [{
      data: [],
      label: 'Predicted Price',
      borderColor: 'rgb(25, 118, 210)',
      backgroundColor: 'rgba(25, 118, 210, 0.2)',
      tension: 0.3,
      fill: true
    }]
  };

  // Helper wrapper for template translations
  t(key: string): string {
    return this.translationService.translate(key);
  }

  toggleLanguage() {
    this.translationService.toggleLanguage();
  }
}

function formatYYYYMM(dateLike: any) {
  const d = new Date(dateLike);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${m.toString().padStart(2, '0')}`;
}

function subtractMonths(dateLike: any, months: number) {
  const d = new Date(dateLike);
  d.setMonth(d.getMonth() - months);
  return d;
}
