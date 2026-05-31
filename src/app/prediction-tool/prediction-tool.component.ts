import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import type { ChartConfiguration } from 'chart.js';
import { Temporal } from '@js-temporal/polyfill';
import { firstValueFrom } from 'rxjs';
import { Field, form, max, min, required, submit, validate } from '@angular/forms/signals';

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
import { ComboboxComponent } from './combobox/combobox.component';
import { NumberFieldComponent } from './number-field/number-field.component';

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
  // string because the combobox CVA always emits strings.
  leaseCommenceYear: string;
};

// leaseCommenceYear is stored as a number here (clamped from the string form
// value) so the template can render it directly without further conversion.
type SummaryValues = {
  mlModel: MlModel;
  town: Town;
  leaseCommenceYear: number;
};

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
  leaseCommenceYear: String(MAX_YEAR)
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
    Field,
    BaseChartDirective,
    ComboboxComponent,
    NumberFieldComponent
  ]
})
export class PredictionToolComponent implements OnInit {
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly storageService = inject(StorageService);
  private readonly http = inject(HttpClient);
  private readonly translationService = inject(TranslationService);

  protected readonly chart = viewChild(BaseChartDirective);
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
  protected readonly loading = signal(false);
  protected readonly darkMode = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly hasPrediction = signal(false);
  protected readonly liveMessage = signal('');
  protected readonly trendData = signal<TrendPoint[]>(
    createDefaultTrendData()
  );

  // Cached theme colors to avoid calling getComputedStyle in computed properties.
  // Only read by the chartData/chartOptions computed signals, never the template.
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

  protected readonly leaseYearOptions = computed(() =>
    this.leaseYears.map((y) => ({ value: String(y), label: String(y) }))
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

  // Chart plugin color cache: updated once in ngOnInit and on every theme toggle.
  // The plugin array is stable (never recreated), so Chart.js doesn't re-register
  // plugins on each theme change.
  private readonly chartColors = { c1: '', c2: '', glow: '' };

  protected readonly chartPlugins = [
    {
      id: 'gradientLine',
      beforeDatasetDraw: (chart: any) => {
        const { ctx, chartArea, data } = chart;
        if (!chartArea || !data.datasets[0]) return;
        const c1 = this.chartColors.c1;
        const c2 = this.chartColors.c2;
        // Guard: colors are empty strings until updateChartColorsCache() runs;
        // addColorStop throws a DOMException with an empty/invalid color value.
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
        // Guard: glow is '' until updateChartColorsCache() runs.
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
            color: colors.mutedForeground,
            maxRotation: 0,
            autoSkip: true
          }
        },
        y: {
          // grace adds padding above/below the data range so the line is
          // never squashed against the top or bottom of the chart area.
          grace: '15%',
          grid: {
            color: (context: any) =>
              context.index === 0 ? colors.gridColor : colors.dashedGridColor,
            lineWidth: 1,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            borderDash: ((context: any) => context.index === 0 ? [] : [3, 4]) as any,
            drawBorder: false
          },
          ticks: {
            color: colors.mutedForeground,
            callback: (value) => formatCompactCurrency(Number(value))
          }
        }
      }
    };
  });

  private readonly predictionModel = signal<PredictionFormValue>({ ...INITIAL_FORM_VALUE });

  protected readonly predictionForm = form(this.predictionModel, (s) => {
    required(s.mlModel);
    required(s.town);
    required(s.storeyRange);
    required(s.flatModel);
    required(s.floorAreaSqm);
    min(s.floorAreaSqm, MIN_FLOOR_AREA);
    max(s.floorAreaSqm, MAX_FLOOR_AREA);
    validate(s.leaseCommenceYear, ({ value }) => {
      const n = Number(value());
      if (!Number.isFinite(n) || n < MIN_YEAR || n > MAX_YEAR) {
        return { kind: 'range' };
      }
      return undefined;
    });
  });

  protected readonly summaryValues = computed<SummaryValues>(() => {
    const value = this.predictionModel();
    return {
      mlModel: coerceOption(value.mlModel, ml_model_list),
      town: coerceOption(value.town, town_list),
      leaseCommenceYear: clampNumber(value.leaseCommenceYear, MIN_YEAR, MAX_YEAR, MAX_YEAR)
    };
  });

  protected readonly floorAreaErrorId = computed(() => {
    const state = this.predictionForm.floorAreaSqm();
    return state.touched() && state.errors().length > 0 ? 'floor-area-error' : null;
  });

  protected readonly floorAreaRequiredError = computed(() => {
    const state = this.predictionForm.floorAreaSqm();
    return state.touched() && state.errors().some(e => e.kind === 'required');
  });

  protected readonly floorAreaRangeError = computed(() => {
    const state = this.predictionForm.floorAreaSqm();
    return state.touched() && state.errors().some(e => e.kind === 'min' || e.kind === 'max');
  });

  protected readonly leaseYearErrorId = computed(() => {
    const state = this.predictionForm.leaseCommenceYear();
    return state.touched() && state.errors().length > 0 ? 'lease-year-error' : null;
  });

  protected readonly leaseYearRangeError = computed(() => {
    const state = this.predictionForm.leaseCommenceYear();
    return state.touched() && state.errors().some(e => e.kind === 'range');
  });

  constructor() {
    // Persist form state to localStorage whenever the model changes.
    // Writing to localStorage is a valid effect use case (imperative side effect).
    effect(() => {
      if (this.isBrowser) {
        this.storageService.setItem('predictionFormData', this.predictionModel());
      }
    });
  }

  protected onDocumentKeyDown(event: KeyboardEvent): void {
    // Ignore events already handled by child components (e.g. Escape inside Combobox).
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
      // Only reset if focus is within the form area (not a combobox dropdown, etc.)
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
    }

    this.mounted.set(true);

    if (this.isBrowser) {
      this.document.body.classList.add('theme-ready');
    }
  }

  protected async onSubmit(): Promise<void> {
    if (!this.isBrowser || this.loading()) return;

    await submit(this.predictionForm, async () => {
      this.loading.set(true);
      this.errorMessage.set('');

      const formValue = this.predictionModel();
      const clampedFloorArea = clampNumber(
        formValue.floorAreaSqm,
        MIN_FLOOR_AREA,
        MAX_FLOOR_AREA,
        MIN_FLOOR_AREA
      );

      if (clampedFloorArea !== formValue.floorAreaSqm) {
        this.predictionModel.update(v => ({ ...v, floorAreaSqm: clampedFloorArea }));
      }

      const predictionWindow = getPredictionWindow();
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
        const responseText = await firstValueFrom(
          this.http.post(PREDICTION_API_URL, formData, { responseType: 'text' })
        );
        const serverData = parsePredictionResponse(responseText, requestPayload);
        const normalizedData = normalizeTrendData(serverData);

        this.hasPrediction.set(true);
        this.trendData.set(normalizedData);
        this.chart()?.update();

        const latestValue = normalizedData.at(-1)?.value ?? 0;
        const priceStr = formatCurrency(sanitizeCurrencyValue(latestValue));
        const announcement = this.t('prediction_complete').replace('{price}', priceStr);
        // Clear the live region first so identical consecutive announcements
        // are still re-read by assistive technology.
        this.liveMessage.set('');
        requestAnimationFrame(() => {
          this.liveMessage.set(announcement);
          this.resultsAnchor()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          // Focus the results heading for keyboard users, then drop the
          // temporary tabindex once focus leaves so it isn't left interactive.
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
      } catch (error: unknown) {
        if (error instanceof HttpErrorResponse) {
          console.error('Prediction request failed', {
            summary: formatPredictionError(
              `API request failed with ${error.status} ${error.statusText}`,
              typeof error.error === 'string' ? error.error : '',
              requestPayload
            )
          });
        } else {
          console.error('Prediction request failed', { error, requestPayload });
        }
        this.errorMessage.set(this.t('error_fetch'));
      } finally {
        this.loading.set(false);
      }
    });
  }

  protected resetForm(): void {
    this.predictionModel.set({ ...INITIAL_FORM_VALUE });
    // Signal Forms API: call the field tree for FieldState, then reset interaction
    // flags on the form and all descendants (documented as form().reset()).
    this.predictionForm().reset();
    this.hasPrediction.set(false);
    this.errorMessage.set('');
    this.trendData.set(createDefaultTrendData());
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

  protected readonly leaseYearRangeMessage = computed(() =>
    this.t('lease_year_range')
      .replace('{min}', String(MIN_YEAR))
      .replace('{max}', String(MAX_YEAR))
  );

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

  private updateChartColorsCache(): void {
    if (!this.isBrowser) return;
    const doc = this.document;

    // The theme tokens in styles.css are defined with light-dark(), which
    // getComputedStyle().getPropertyValue() returns *unresolved* (the literal
    // "light-dark(...)" string) for unregistered custom properties. Chart.js
    // and colorWithAlpha() can't parse that, so resolve each var to a concrete
    // rgb() value by letting the browser compute it on a throwaway element.
    // Reads are batched here (init + theme toggle only), not in computed
    // signals, so this still avoids per-recompute layout thrashing.
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
      this.storageService.getItem<Partial<PredictionFormValue>>(
        'predictionFormData'
      );

    if (!savedForm) {
      return;
    }

    this.predictionModel.set({
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
      leaseCommenceYear: String(clampNumber(
        savedForm.leaseCommenceYear,
        MIN_YEAR,
        MAX_YEAR,
        MAX_YEAR
      ))
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
  const n = typeof value === 'number' ? value
          : typeof value === 'string' ? Number(value)
          : NaN;
  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(n)));
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
