import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  BaseChartDirective,
  NgChartsModule
} from 'ng2-charts';
import type { ChartConfiguration } from 'chart.js';

import {
  flat_model_list,
  ml_model_list,
  month_list,
  storey_range_list,
  town_list
} from '../lists';
import { StorageService } from '../services/storage.service';
import {
  TranslationService
} from '../services/translation.service';
import type { OptionGroup } from '../services/translation.service';

type MlModel = (typeof ml_model_list)[number];
type Town = (typeof town_list)[number];
type StoreyRange = (typeof storey_range_list)[number];
type FlatModel = (typeof flat_model_list)[number];

type PredictionFormValue = {
  mlModel: MlModel;
  town: Town;
  storeyRange: StoreyRange;
  flatModel: FlatModel;
  floorAreaSqm: number;
  leaseCommenceYear: number;
};

type SummaryValues = Pick<
  PredictionFormValue,
  'mlModel' | 'town' | 'leaseCommenceYear'
>;

type TrendPoint = {
  label: string;
  value: number;
};

type ApiResponse = {
  predictions: Array<{
    month: string;
    predictedPrice: number;
  }>;
};

type PredictionRequestPayload = {
  model: MlModel;
  monthStart: string;
  monthEnd: string;
  town: Town;
  storeyRange: StoreyRange;
  flatModel: FlatModel;
  floorAreaSqm: string;
  leaseCommenceYear: string;
};

const MIN_YEAR = 1960;
const MAX_YEAR = new Date().getUTCFullYear();
const MIN_FLOOR_AREA = 20;
const MAX_FLOOR_AREA = 300;
const PREDICTION_API_URL =
  'https://ee4802-g20-tool.shenghaoc.workers.dev/api/prices';
const PREDICTION_MONTHS = [...month_list.slice(-13)];

const INITIAL_FORM_VALUE: PredictionFormValue = {
  mlModel: ml_model_list[0],
  town: town_list[0],
  storeyRange: storey_range_list[0],
  flatModel: flat_model_list[0],
  floorAreaSqm: MIN_FLOOR_AREA,
  leaseCommenceYear: MAX_YEAR
};

@Component({
  selector: 'app-prediction-tool',
  templateUrl: './prediction-tool.component.html',
  styleUrl: './prediction-tool.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    NgChartsModule
  ]
})
export class PredictionToolComponent implements OnInit {
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly storageService = inject(StorageService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly translationService = inject(TranslationService);

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  protected readonly lang = this.translationService.lang;
  protected readonly mlModels = ml_model_list;
  protected readonly towns = town_list;
  protected readonly storeyRanges = storey_range_list;
  protected readonly flatModels = flat_model_list;
  protected readonly leaseYears = Array.from(
    { length: MAX_YEAR - MIN_YEAR + 1 },
    (_, index) => MAX_YEAR - index
  );

  protected readonly loading = signal(false);
  protected readonly darkMode = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly hasPrediction = signal(false);
  protected readonly trendData = signal<TrendPoint[]>(
    createDefaultTrendData()
  );
  protected readonly summaryValues = signal<SummaryValues>({
    mlModel: INITIAL_FORM_VALUE.mlModel,
    town: INITIAL_FORM_VALUE.town,
    leaseCommenceYear: INITIAL_FORM_VALUE.leaseCommenceYear
  });

  protected readonly predictedPrice = computed(() => {
    const latestPoint = this.trendData().at(-1);
    return sanitizeCurrencyValue(latestPoint?.value ?? 0);
  });

  protected readonly chartMetrics = computed(() => {
    const points = this.trendData();
    const values = points.map((point) => sanitizeCurrencyValue(point.value));
    const latestValue = values.at(-1) ?? 0;
    const firstValue = values[0] ?? 0;
    const lowValue = values.length ? Math.min(...values) : 0;
    const peakValue = values.length ? Math.max(...values) : 0;

    return {
      latestValue,
      lowValue,
      peakValue,
      deltaValue: latestValue - firstValue
    };
  });

  protected readonly chartData = computed<
    ChartConfiguration<'line'>['data']
  >(() => ({
    labels: this.trendData().map((point) => point.label),
    datasets: [
      {
        data: this.trendData().map((point) => point.value),
        label: this.t('predicted_price'),
        borderColor: this.darkMode() ? '#cf8b60' : '#af6542',
        backgroundColor: this.darkMode()
          ? 'rgba(207, 139, 96, 0.26)'
          : 'rgba(175, 101, 66, 0.18)',
        pointBackgroundColor: this.darkMode() ? '#cf8b60' : '#af6542',
        pointHoverBackgroundColor: this.darkMode() ? '#cf8b60' : '#af6542',
        pointHoverBorderColor: this.darkMode() ? '#0f1821' : '#fffaf4',
        fill: true,
        tension: 0.35,
        borderWidth: 3
      }
    ]
  }));

  protected readonly chartOptions = computed<
    ChartConfiguration<'line'>['options']
  >(() => {
    const darkMode = this.darkMode();
    const labelColor = darkMode ? '#9e998f' : '#74685b';
    const panelColor = darkMode ? '#13202b' : '#fffaf4';
    const tooltipBorder = darkMode
      ? 'rgba(141, 174, 193, 0.16)'
      : 'rgba(116, 92, 68, 0.14)';
    const gridColor = darkMode
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(31, 35, 40, 0.08)';

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: this.isBrowser ? 450 : 0
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          displayColors: false,
          backgroundColor: panelColor,
          titleColor: darkMode ? '#f2ede6' : '#1f2328',
          bodyColor: darkMode ? '#f2ede6' : '#1f2328',
          borderColor: tooltipBorder,
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const value = Number(context.raw ?? 0);
              return formatCurrency(value);
            }
          }
        }
      },
      elements: {
        point: {
          radius: 0,
          hoverRadius: 6,
          hitRadius: 18
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: labelColor,
            maxRotation: 0,
            autoSkip: true
          }
        },
        y: {
          grid: {
            color: gridColor,
            drawBorder: false
          },
          ticks: {
            color: labelColor,
            callback: (value) => formatCompactCurrency(Number(value))
          }
        }
      }
    };
  });

  protected readonly predictionForm = this.formBuilder.nonNullable.group({
    mlModel: [INITIAL_FORM_VALUE.mlModel, Validators.required],
    town: [INITIAL_FORM_VALUE.town, Validators.required],
    storeyRange: [INITIAL_FORM_VALUE.storeyRange, Validators.required],
    flatModel: [INITIAL_FORM_VALUE.flatModel, Validators.required],
    floorAreaSqm: [
      INITIAL_FORM_VALUE.floorAreaSqm,
      [
        Validators.required,
        Validators.min(MIN_FLOOR_AREA),
        Validators.max(MAX_FLOOR_AREA)
      ]
    ],
    leaseCommenceYear: [
      INITIAL_FORM_VALUE.leaseCommenceYear,
      [
        Validators.required,
        Validators.min(MIN_YEAR),
        Validators.max(MAX_YEAR)
      ]
    ]
  });

  ngOnInit(): void {
    if (this.isBrowser) {
      this.restoreTheme();
      this.restoreFormState();
    }

    this.syncSummaryWithForm();
    this.syncDocumentState();

    this.predictionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((partialValue) => {
        const nextValue = {
          ...this.predictionForm.getRawValue(),
          ...partialValue
        };

        this.syncSummaryWithForm(nextValue);

        if (!this.hasPrediction()) {
          this.trendData.set(
            createDefaultTrendData()
          );
        }

        if (this.isBrowser) {
          this.storageService.setItem('predictionFormData', nextValue);
        }
      });
  }

  protected async onSubmit(): Promise<void> {
    if (this.predictionForm.invalid || !this.isBrowser) {
      this.predictionForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const formValue = this.predictionForm.getRawValue();
    const clampedFloorArea = clampNumber(
      formValue.floorAreaSqm,
      MIN_FLOOR_AREA,
      MAX_FLOOR_AREA,
      MIN_FLOOR_AREA
    );
    const predictionWindow = getPredictionWindow();

    if (clampedFloorArea !== formValue.floorAreaSqm) {
      this.predictionForm.controls.floorAreaSqm.setValue(clampedFloorArea, {
        emitEvent: false
      });
    }

    const requestPayload: PredictionRequestPayload = {
      model: formValue.mlModel,
      monthStart: predictionWindow.monthStart,
      monthEnd: predictionWindow.monthEnd,
      town: formValue.town,
      storeyRange: formValue.storeyRange,
      flatModel: formValue.flatModel,
      floorAreaSqm: clampedFloorArea.toString(),
      leaseCommenceYear: formValue.leaseCommenceYear.toString()
    };
    const formData = createPredictionFormData(requestPayload);

    try {
      const response = await fetch(PREDICTION_API_URL, {
        method: 'POST',
        body: formData
      });
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          formatPredictionError(
            `API request failed with ${response.status} ${response.statusText}`,
            responseText,
            requestPayload
          )
        );
      }

      const serverData = parsePredictionResponse(responseText, requestPayload);

      this.hasPrediction.set(true);
      this.trendData.set(normalizeTrendData(serverData));
      this.chart?.update();
    } catch (error: unknown) {
      console.error('Prediction request failed', {
        error,
        requestPayload
      });
      this.errorMessage.set(this.t('error_fetch'));
    } finally {
      this.loading.set(false);
    }
  }

  protected resetForm(): void {
    this.predictionForm.reset(INITIAL_FORM_VALUE);
    this.hasPrediction.set(false);
    this.errorMessage.set('');
    this.trendData.set(
      createDefaultTrendData()
    );
    this.syncSummaryWithForm(INITIAL_FORM_VALUE);

    if (this.isBrowser) {
      this.storageService.removeItem('predictionFormData');
    }
  }

  protected toggleTheme(): void {
    const nextThemeIsDark = !this.darkMode();
    this.darkMode.set(nextThemeIsDark);

    if (this.isBrowser) {
      this.storageService.setItem(
        'predictionTheme',
        nextThemeIsDark ? 'dark' : 'light'
      );
    }

    this.syncDocumentState();
  }

  protected toggleLanguage(): void {
    this.translationService.toggleLanguage();
    this.syncDocumentState();
  }

  protected t(key: string): string {
    return this.translationService.translate(key);
  }

  protected tOption(group: OptionGroup, value: string): string {
    return this.translationService.translateOption(group, value);
  }

  protected formatCurrency(value: number): string {
    return formatCurrency(value);
  }

  protected formatCurrencyRange(lowValue: number, peakValue: number): string {
    return `${formatCurrency(lowValue)} - ${formatCurrency(peakValue)}`;
  }

  protected formatDeltaCurrency(value: number): string {
    const roundedValue = Math.abs(roundValue(value)).toLocaleString();
    const sign = value >= 0 ? '+' : '-';
    return `${sign}$${roundedValue}`;
  }

  private restoreTheme(): void {
    const savedTheme =
      this.storageService.getItem<'light' | 'dark'>('predictionTheme');
    this.darkMode.set(savedTheme === 'dark');
  }

  private restoreFormState(): void {
    const savedForm =
      this.storageService.getItem<Partial<PredictionFormValue>>(
        'predictionFormData'
      );

    if (!savedForm) {
      this.trendData.set(
        createDefaultTrendData()
      );
      return;
    }

    const restoredFormValue: PredictionFormValue = {
      mlModel: coerceOption(savedForm.mlModel, ml_model_list),
      town: coerceOption(savedForm.town, town_list),
      storeyRange: coerceOption(savedForm.storeyRange, storey_range_list),
      flatModel: coerceOption(savedForm.flatModel, flat_model_list),
      floorAreaSqm: clampNumber(
        savedForm.floorAreaSqm,
        MIN_FLOOR_AREA,
        MAX_FLOOR_AREA,
        MIN_FLOOR_AREA
      ),
      leaseCommenceYear: clampNumber(
        savedForm.leaseCommenceYear,
        MIN_YEAR,
        MAX_YEAR,
        MAX_YEAR
      )
    };

    this.predictionForm.setValue(restoredFormValue, {
      emitEvent: false
    });
    this.trendData.set(
      createDefaultTrendData()
    );
    this.syncSummaryWithForm(restoredFormValue);
  }

  private syncSummaryWithForm(
    value: Partial<PredictionFormValue> = this.predictionForm.getRawValue()
  ): void {
    this.summaryValues.set({
      mlModel: coerceOption(value.mlModel, ml_model_list),
      town: coerceOption(value.town, town_list),
      leaseCommenceYear: clampNumber(
        value.leaseCommenceYear,
        MIN_YEAR,
        MAX_YEAR,
        INITIAL_FORM_VALUE.leaseCommenceYear
      )
    });
  }

  private syncDocumentState(): void {
    if (!this.isBrowser) {
      return;
    }

    const currentLanguage = this.translationService.currentLang();
    this.document.documentElement.lang = currentLanguage;
    this.document.documentElement.setAttribute(
      'data-lang',
      currentLanguage
    );
    this.document.body.setAttribute(
      'data-theme',
      this.darkMode() ? 'dark' : 'light'
    );
  }
}

function normalizeTrendData(data: ApiResponse): TrendPoint[] {
  return data.predictions.map((entry) => ({
    label: entry.month,
    value: sanitizeCurrencyValue(entry.predictedPrice)
  }));
}

function createPredictionFormData(
  payload: PredictionRequestPayload
): FormData {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    formData.append(key, value);
  });

  return formData;
}

function parsePredictionResponse(
  responseText: string,
  requestPayload: PredictionRequestPayload
): ApiResponse {
  let parsedResponse: unknown;

  try {
    parsedResponse = JSON.parse(responseText) as unknown;
  } catch {
    throw new Error(
      formatPredictionError(
        'API returned invalid JSON',
        responseText,
        requestPayload
      )
    );
  }

  if (
    !parsedResponse ||
    typeof parsedResponse !== 'object' ||
    !('predictions' in parsedResponse) ||
    !Array.isArray(parsedResponse.predictions) ||
    parsedResponse.predictions.length === 0
  ) {
    throw new Error(
      formatPredictionError(
        'API returned an unexpected payload',
        responseText,
        requestPayload
      )
    );
  }

  return parsedResponse as ApiResponse;
}

function formatPredictionError(
  summary: string,
  responseText: string,
  requestPayload: PredictionRequestPayload
): string {
  const responsePreview = formatDebugValue(responseText);
  const requestPreview = JSON.stringify(requestPayload);
  return `${summary}. Response: ${responsePreview}. Request: ${requestPreview}`;
}

function formatDebugValue(value: string, maxLength = 280): string {
  const compactValue = value.replace(/\s+/g, ' ').trim();

  if (!compactValue) {
    return '(empty response body)';
  }

  if (compactValue.length <= maxLength) {
    return compactValue;
  }

  return `${compactValue.slice(0, maxLength)}...`;
}

function createDefaultTrendData(): TrendPoint[] {
  return PREDICTION_MONTHS.map((month) => ({
    label: month,
    value: 0
  }));
}

function getPredictionWindow(): {
  monthStart: string;
  monthEnd: string;
} {
  return {
    monthStart: PREDICTION_MONTHS[0] ?? month_list[0],
    monthEnd: PREDICTION_MONTHS[PREDICTION_MONTHS.length - 1] ?? month_list[month_list.length - 1]
  };
}

function coerceOption<T extends readonly string[]>(
  value: unknown,
  options: T
): T[number] {
  if (typeof value === 'string' && options.includes(value as T[number])) {
    return value as T[number];
  }

  return options[0];
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function sanitizeCurrencyValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function roundValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value);
}

function formatCurrency(value: number): string {
  return `$${sanitizeCurrencyValue(value).toLocaleString()}`;
}

function formatCompactCurrency(value: number): string {
  const roundedValue = sanitizeCurrencyValue(value);

  if (roundedValue >= 1_000_000) {
    return `$${(roundedValue / 1_000_000).toFixed(1)}M`;
  }

  if (roundedValue >= 1_000) {
    return `$${Math.round(roundedValue / 1_000)}k`;
  }

  return `$${roundedValue}`;
}
