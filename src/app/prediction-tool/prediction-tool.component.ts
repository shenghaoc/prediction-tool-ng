import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BaseChartDirective, NgChartsModule } from 'ng2-charts';
import type { ChartConfiguration } from 'chart.js';
import { Temporal } from '@js-temporal/polyfill';

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
const MAX_YEAR = Temporal.PlainYearMonth.from(month_list[month_list.length - 1]).year;
const MIN_FLOOR_AREA = 20;
const MAX_FLOOR_AREA = 300;
const PREDICTION_API_URL =
  'https://ee4802-g20-tool-ng.shenghaoc.workers.dev/api/prices';
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
  @ViewChild('resultsAnchor') resultsAnchor?: ElementRef<HTMLElement>;

  protected readonly lang = this.translationService.lang;
  protected readonly mlModels = ml_model_list;
  protected readonly towns = town_list;
  protected readonly storeyRanges = storey_range_list;
  protected readonly flatModels = flat_model_list;
  protected readonly leaseYears = Array.from(
    { length: MAX_YEAR - MIN_YEAR + 1 },
    (_, index) => MAX_YEAR - index
  );

  protected readonly mounted = signal(false);
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
  >(() => {
    void this.darkMode();
    return {
      labels: this.trendData().map((point) => point.label),
      datasets: [
        {
          data: this.trendData().map((point) => point.value),
          label: this.t('predicted_price'),
          borderColor: readCssVar('--primary', this.document),
          backgroundColor: readCssVar('--chart-fill', this.document),
          pointBackgroundColor: readCssVar('--primary', this.document),
          pointHoverBackgroundColor: readCssVar('--primary', this.document),
          pointHoverBorderColor: readCssVar('--card', this.document),
          fill: true,
          tension: 0.35,
          borderWidth: 3
        }
      ]
    };
  });

  protected readonly chartOptions = computed<
    ChartConfiguration<'line'>['options']
  >(() => {
    void this.darkMode();
    const labelColor = readCssVar('--muted-foreground', this.document);
    const panelColor = readCssVar('--popover', this.document);
    const tooltipBorder = colorWithAlpha(readCssVar('--primary', this.document), 0.16);
    const gridColor = colorWithAlpha(readCssVar('--foreground', this.document), 0.08);

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
          titleColor: readCssVar('--foreground', this.document),
          bodyColor: readCssVar('--foreground', this.document),
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

    this.mounted.set(true);

    if (this.isBrowser) {
      this.document.body.classList.add('theme-ready');
    }

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

      if (this.isBrowser) {
        requestAnimationFrame(() => {
          this.resultsAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
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
    this.chart?.update();
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

function readCssVar(name: string, doc: Document): string {
  return getComputedStyle(doc.body).getPropertyValue(name).trim();
}

function colorWithAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('rgb')) {
    const match = trimmed.match(/\d+/g);
    if (!match || match.length < 3) return '';
    const [r, g, b] = match.map(Number);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '';
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    const full = hex.length === 3
      ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
      : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '';
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return '';
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
