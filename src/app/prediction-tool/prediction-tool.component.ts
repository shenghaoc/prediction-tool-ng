import {
  CurrencyPipe,
  DOCUMENT,
  formatCurrency,
  isPlatformBrowser
} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  resource,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration } from 'chart.js';

import {
  flat_model_list,
  ml_model_list,
  storey_range_list,
  town_list
} from '../lists';
import {
  MAX_FLOOR_AREA,
  MAX_YEAR,
  MIN_FLOOR_AREA,
  MIN_YEAR,
  PredictionService,
  buildPredictionRequestPayload,
  clampNumber,
  coerceOption,
  createDefaultTrendData,
  normalizeTrendData,
  sanitizeCurrencyValue,
  type ApiResponse,
  type FlatModel,
  type MlModel,
  type PredictionRequestPayload,
  type StoreyRange,
  type Town,
  type TrendPoint
} from '../services/prediction.service';
import { StorageService } from '../services/storage.service';
import {
  TranslationService
} from '../services/translation.service';
import type { OptionGroup } from '../services/translation.service';
import { integerValidator } from './prediction-form.validators';

type PredictionFormValue = {
  ml_model: MlModel;
  town: Town;
  storey_range: StoreyRange;
  flat_model: FlatModel;
  floor_area_sqm: number | null;
  lease_commence_year: number | null;
};

type StoredPredictionFormValue = {
  mlModel?: MlModel;
  town?: Town;
  storeyRange?: StoreyRange;
  flatModel?: FlatModel;
  floorAreaSqm?: number | null;
  leaseCommenceYear?: number | string | null;
};

type PredictionRequestTrigger = {
  seq: number;
  payload: PredictionRequestPayload;
};

const INITIAL_FORM_VALUE: PredictionFormValue = {
  ml_model: ml_model_list[0],
  town: town_list[0],
  storey_range: storey_range_list[0],
  flat_model: flat_model_list[0],
  floor_area_sqm: MIN_FLOOR_AREA,
  lease_commence_year: MAX_YEAR
};

@Component({
  selector: 'app-prediction-tool',
  templateUrl: './prediction-tool.component.html',
  styleUrl: './prediction-tool.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onDocumentKeyDown($event)'
  },
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    BaseChartDirective,
    CurrencyPipe
  ]
})
export class PredictionToolComponent implements OnInit {
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly storageService = inject(StorageService);
  private readonly predictionService = inject(PredictionService);
  private readonly translationService = inject(TranslationService);
  private readonly fb = inject(FormBuilder);

  protected readonly chart = viewChild<BaseChartDirective>('chart');
  protected readonly resultsAnchor = viewChild<ElementRef<HTMLElement>>('resultsAnchor');
  protected readonly resultsHeadingEl = viewChild<ElementRef<HTMLElement>>('resultsHeading');

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
  protected readonly darkMode = signal(false);
  protected readonly isMac = signal(false);
  protected readonly hasPrediction = signal(false);
  protected readonly liveMessage = signal('');
  protected readonly errorMessage = signal('');

  private readonly predictionRequest = signal<PredictionRequestTrigger | undefined>(
    undefined
  );
  private predictionRequestSeq = 0;
  private lastAnnouncedSeq = -1;

  protected readonly predictionResource = resource({
    params: () => this.predictionRequest(),
    loader: async ({ params: request, abortSignal }) => {
      if (!request) {
        return undefined;
      }
      return this.predictionService.fetchPrediction(request.payload, abortSignal);
    }
  });

  protected readonly loading = this.predictionResource.isLoading;

  protected readonly hasResult = computed(
    () =>
      this.hasPrediction() &&
      this.predictionResource.hasValue() &&
      !this.loading()
  );

  /** Keeps chart visible while a subsequent prediction is loading. */
  protected readonly showChart = computed(
    () => this.hasPrediction() && this.predictionResource.hasValue()
  );

  protected readonly trendData = computed<TrendPoint[]>(() => {
    const response = this.predictionResource.value();
    if (response) {
      return normalizeTrendData(response);
    }
    return createDefaultTrendData();
  });

  private readonly themeColors = signal({
    primary: '',
    chartFill: '',
    card: '',
    mutedForeground: '',
    popover: '',
    foreground: '',
    tooltipBorder: '',
    gridColor: '',
    dashedGridColor: ''
  });

  protected readonly mlModelOptions = computed(() =>
    this.mlModels.map((m) => ({
      value: m,
      label: this.translationService.translateOption('ml_models', m)
    }))
  );

  protected readonly townOptions = computed(() =>
    this.towns.map((town) => ({
      value: town,
      label: this.translationService.translateOption('towns', town)
    }))
  );

  protected readonly storeyRangeOptions = computed(() =>
    this.storeyRanges.map((s) => ({
      value: s,
      label: this.translationService.translateOption('storey_ranges', s)
    }))
  );

  protected readonly flatModelOptions = computed(() =>
    this.flatModels.map((f) => ({
      value: f,
      label: this.translationService.translateOption('flat_models', f)
    }))
  );

  protected readonly stats = computed(() => [
    { labelKey: 'models_count', value: this.mlModels.length, icon: 'model' },
    { labelKey: 'towns_count', value: this.towns.length, icon: 'town' },
    { labelKey: 'flat_types_count', value: this.flatModels.length, icon: 'flat' }
  ]);

  protected readonly priceLocale = computed(() =>
    this.lang() === 'zh' ? 'zh-SG' : 'en-SG'
  );

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
    if (!this.isBrowser) {
      return { labels: [], datasets: [] };
    }
    const colors = this.themeColors();
    return {
      labels: this.trendData().map((point) => point.label),
      datasets: [
        {
          data: this.trendData().map((point) => point.value),
          label: this.t('predicted_price'),
          borderColor: colors.primary,
          backgroundColor: colors.chartFill,
          pointBackgroundColor: colors.primary,
          pointHoverBackgroundColor: colors.primary,
          pointHoverBorderColor: colors.card,
          fill: true,
          tension: 0.35,
          borderWidth: 3
        }
      ]
    };
  });

  private readonly chartColors = { c1: '', c2: '', glow: '' };

  protected readonly chartPlugins = [
    {
      id: 'gradientLine',
      beforeDatasetDraw: (chart: any) => {
        const { ctx, chartArea, data } = chart;
        if (!chartArea || !data.datasets[0]) return;
        const c1 = this.chartColors.c1;
        const c2 = this.chartColors.c2;
        if (!c1 || !c2) return;
        const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
        gradient.addColorStop(0, c1);
        gradient.addColorStop(1, c2);
        data.datasets[0].borderColor = gradient;
      }
    },
    {
      id: 'latestGlow',
      afterDatasetsDraw: (chart: any) => {
        const { ctx } = chart;
        if (!this.chartColors.glow) return;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || meta.data.length === 0) return;
        const last = meta.data[meta.data.length - 1];
        if (!last) return;
        const { x, y } = last.getCenterPoint();
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = this.chartColors.glow;
        ctx.fill();
        ctx.restore();
      }
    }
  ];

  protected readonly chartOptions = computed<
    ChartConfiguration<'line'>['options']
  >(() => {
    if (!this.isBrowser) return {};
    const colors = this.themeColors();

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
          backgroundColor: colors.popover,
          titleColor: colors.foreground,
          bodyColor: colors.foreground,
          borderColor: colors.tooltipBorder,
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const value = Number(context.raw ?? 0);
              return this.formatChartCurrency(value);
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
            color: colors.mutedForeground,
            maxRotation: 0,
            autoSkip: true
          }
        },
        y: {
          grace: '15%',
          grid: {
            color: (context: any) =>
              context.index === 0 ? colors.gridColor : colors.dashedGridColor,
            lineWidth: 1,
            borderDash: ((context: any) => (context.index === 0 ? [] : [3, 4])) as any
          },
          border: {
            display: false
          },
          ticks: {
            color: colors.mutedForeground,
            callback: (value) => formatCompactCurrency(Number(value))
          }
        }
      }
    };
  });

  protected readonly predictionForm = this.fb.group({
    ml_model: this.fb.nonNullable.control<MlModel>(INITIAL_FORM_VALUE.ml_model, {
      validators: Validators.required
    }),
    town: this.fb.nonNullable.control<Town>(INITIAL_FORM_VALUE.town, {
      validators: Validators.required
    }),
    storey_range: this.fb.nonNullable.control<StoreyRange>(
      INITIAL_FORM_VALUE.storey_range,
      { validators: Validators.required }
    ),
    flat_model: this.fb.nonNullable.control<FlatModel>(
      INITIAL_FORM_VALUE.flat_model,
      { validators: Validators.required }
    ),
    floor_area_sqm: this.fb.control<number | null>(
      INITIAL_FORM_VALUE.floor_area_sqm,
      {
        validators: [
          Validators.required,
          Validators.min(MIN_FLOOR_AREA),
          Validators.max(MAX_FLOOR_AREA),
          integerValidator
        ]
      }
    ),
    lease_commence_year: this.fb.control<number | null>(
      INITIAL_FORM_VALUE.lease_commence_year,
      {
        validators: [
          Validators.required,
          Validators.min(MIN_YEAR),
          Validators.max(MAX_YEAR)
        ]
      }
    )
  });

  protected readonly summaryValues = computed<SummaryValues>(() => {
    const value = this.predictionForm.getRawValue();
    return {
      mlModel: coerceOption(value.ml_model, ml_model_list),
      town: coerceOption(value.town, town_list),
      leaseCommenceYear: clampNumber(
        value.lease_commence_year,
        MIN_YEAR,
        MAX_YEAR,
        MAX_YEAR
      )
    };
  });

  protected readonly leaseYearRangeMessage = computed(() =>
    this.t('lease_year_range')
      .replace('{min}', String(MIN_YEAR))
      .replace('{max}', String(MAX_YEAR))
  );

  constructor() {
    this.predictionForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.isBrowser) {
        this.persistFormState();
      }
    });

    effect(() => {
      const request = this.predictionRequest();
      const status = this.predictionResource.status();

      if (!request) {
        return;
      }

      if (
        status === 'resolved' &&
        this.predictionResource.hasValue() &&
        request.seq === this.predictionRequest()?.seq
      ) {
        this.hasPrediction.set(true);
        this.errorMessage.set('');
        this.chart()?.update();

        if (request.seq !== this.lastAnnouncedSeq) {
          this.lastAnnouncedSeq = request.seq;
          this.announcePredictionComplete(this.predictionResource.value()!);
        }
        return;
      }

      if (status === 'error') {
        const error = this.predictionResource.error();
        console.error('Prediction request failed', { error, request: request.payload });
        this.errorMessage.set(this.t('error_fetch'));
      }
    }, { allowSignalWrites: true });
  }

  protected onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    const isCtrlOrCmd = event.ctrlKey || event.metaKey;

    if (isCtrlOrCmd && event.key === 'Enter') {
      event.preventDefault();
      void this.onSubmit();
      return;
    }

    if (event.key === 'Escape' && !this.loading()) {
      const active = this.document.activeElement as HTMLElement | null;
      if (active && active.closest('form')) {
        this.resetForm();
      }
    }
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      this.restoreTheme();
      this.restoreFormState();
      this.syncDocumentState();
      this.updateChartColorsCache();
      this.isMac.set(this.detectMac());
    }

    this.mounted.set(true);

    if (this.isBrowser) {
      this.document.body.classList.add('theme-ready');
    }
  }

  protected async onSubmit(): Promise<void> {
    if (!this.isBrowser || this.loading()) {
      return;
    }

    this.predictionForm.markAllAsTouched();

    if (this.predictionForm.invalid) {
      return;
    }

    const raw = this.predictionForm.getRawValue();
    this.errorMessage.set('');
    const payload = buildPredictionRequestPayload({
      ml_model: raw.ml_model,
      town: raw.town,
      storey_range: raw.storey_range,
      flat_model: raw.flat_model,
      floor_area_sqm: raw.floor_area_sqm!,
      lease_commence_year: raw.lease_commence_year!
    });

    const seq = ++this.predictionRequestSeq;
    this.predictionRequest.set({ seq, payload });
  }

  protected resetForm(): void {
    this.predictionForm.reset({ ...INITIAL_FORM_VALUE });
    this.predictionRequest.set(undefined);
    this.predictionResource.set(undefined);
    this.hasPrediction.set(false);
    this.errorMessage.set('');
    this.lastAnnouncedSeq = -1;
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
    this.updateChartColorsCache();
    this.chart()?.update();
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

  protected formatChartCurrency(value: number): string {
    return formatCurrency(
      sanitizeCurrencyValue(value),
      this.priceLocale(),
      '$',
      'SGD',
      '1.0-0'
    );
  }

  protected formatCurrencyRange(lowValue: number, peakValue: number): string {
    return `${this.formatChartCurrency(lowValue)} - ${this.formatChartCurrency(peakValue)}`;
  }

  protected formatDeltaCurrency(value: number): string {
    const formatted = this.formatChartCurrency(Math.abs(value));
    const sign = value >= 0 ? '+' : '-';
    return `${sign}${formatted}`;
  }

  protected showFloorAreaRequiredError(): boolean {
    const control = this.predictionForm.controls.floor_area_sqm;
    return control.touched && control.hasError('required');
  }

  protected showFloorAreaRangeError(): boolean {
    const control = this.predictionForm.controls.floor_area_sqm;
    return (
      control.touched &&
      (control.hasError('min') ||
        control.hasError('max') ||
        control.hasError('integer'))
    );
  }

  protected showLeaseYearRangeError(): boolean {
    const control = this.predictionForm.controls.lease_commence_year;
    return (
      control.touched &&
      (control.hasError('min') || control.hasError('max') || control.hasError('required'))
    );
  }

  private announcePredictionComplete(response: ApiResponse): void {
    const normalizedData = normalizeTrendData(response);
    const latestValue = normalizedData.at(-1)?.value ?? 0;
    const priceStr = this.formatChartCurrency(latestValue);
    const announcement = this.t('prediction_complete').replace('{price}', priceStr);
    this.liveMessage.set('');
    requestAnimationFrame(() => {
      this.liveMessage.set(announcement);
      this.resultsAnchor()?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
      const heading = this.resultsHeadingEl()?.nativeElement;
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
        heading.addEventListener(
          'blur',
          () => heading.removeAttribute('tabindex'),
          { once: true }
        );
      }
    });
  }

  private updateChartColorsCache(): void {
    if (!this.isBrowser) return;
    const doc = this.document;

    const probe = doc.createElement('span');
    probe.style.display = 'none';
    doc.body.appendChild(probe);
    const resolveVar = (name: string) => {
      probe.style.color = `var(${name})`;
      return getComputedStyle(probe).color;
    };

    let primary: string;
    let foreground: string;
    let chart1: string;
    let chart2: string;
    let chartFill: string;
    let card: string;
    let mutedForeground: string;
    let popover: string;
    try {
      primary = resolveVar('--primary');
      foreground = resolveVar('--foreground');
      chart1 = resolveVar('--chart-1');
      chart2 = resolveVar('--chart-2');
      chartFill = resolveVar('--chart-fill');
      card = resolveVar('--card');
      mutedForeground = resolveVar('--muted-foreground');
      popover = resolveVar('--popover');
    } finally {
      doc.body.removeChild(probe);
    }

    this.chartColors.c1 = chart1;
    this.chartColors.c2 = chart2;
    this.chartColors.glow = colorWithAlpha(primary, 0.15);

    this.themeColors.set({
      primary,
      chartFill,
      card,
      mutedForeground,
      popover,
      foreground,
      tooltipBorder: colorWithAlpha(primary, 0.16),
      gridColor: colorWithAlpha(foreground, 0.08),
      dashedGridColor: colorWithAlpha(foreground, 0.06)
    });
  }

  private restoreTheme(): void {
    const savedTheme =
      this.storageService.getItem<'light' | 'dark'>('predictionTheme');
    this.darkMode.set(savedTheme === 'dark');
  }

  private restoreFormState(): void {
    const savedForm =
      this.storageService.getItem<StoredPredictionFormValue>(
        'predictionFormData'
      );

    if (!savedForm) {
      return;
    }

    this.predictionForm.patchValue({
      ml_model: coerceOption(savedForm.mlModel, ml_model_list),
      town: coerceOption(savedForm.town, town_list),
      storey_range: coerceOption(savedForm.storeyRange, storey_range_list),
      flat_model: coerceOption(savedForm.flatModel, flat_model_list),
      floor_area_sqm: clampNumber(
        savedForm.floorAreaSqm,
        MIN_FLOOR_AREA,
        MAX_FLOOR_AREA,
        MIN_FLOOR_AREA
      ),
      lease_commence_year: clampNumber(
        savedForm.leaseCommenceYear,
        MIN_YEAR,
        MAX_YEAR,
        MAX_YEAR
      )
    });
  }

  private persistFormState(): void {
    const value = this.predictionForm.getRawValue();
    this.storageService.setItem('predictionFormData', {
      mlModel: value.ml_model,
      town: value.town,
      storeyRange: value.storey_range,
      flatModel: value.flat_model,
      floorAreaSqm: value.floor_area_sqm,
      leaseCommenceYear: value.lease_commence_year
    });
  }

  private syncDocumentState(): void {
    if (!this.isBrowser) {
      return;
    }

    const currentLanguage = this.translationService.lang();
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

  private detectMac(): boolean {
    const uaData = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData;
    if (uaData?.platform) {
      return uaData.platform === 'macOS';
    }
    return navigator.userAgent.includes('Macintosh');
  }
}

type SummaryValues = {
  mlModel: MlModel;
  town: Town;
  leaseCommenceYear: number;
};

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
    const full =
      hex.length === 3
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
