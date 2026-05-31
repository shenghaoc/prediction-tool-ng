import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Temporal } from '@js-temporal/polyfill';
import { firstValueFrom } from 'rxjs';

import {
  flat_model_list,
  ml_model_list,
  month_list,
  storey_range_list,
  town_list
} from '../lists';

export type MlModel = (typeof ml_model_list)[number];
export type Town = (typeof town_list)[number];
export type StoreyRange = (typeof storey_range_list)[number];
export type FlatModel = (typeof flat_model_list)[number];

export type TrendPoint = {
  label: string;
  value: number;
};

export type ApiResponse = {
  predictions: Array<{
    month: string;
    predictedPrice: number;
  }>;
};

export type PredictionRequestPayload = {
  model: MlModel;
  monthStart: string;
  monthEnd: string;
  town: Town;
  storeyRange: StoreyRange;
  flatModel: FlatModel;
  floorAreaSqm: string;
  leaseCommenceYear: string;
};

export const PREDICTION_API_URL =
  'https://ee4802-g20-tool-ng.shenghaoc.workers.dev/api/prices';

export const MIN_YEAR = 1960;
export const MAX_YEAR = Temporal.PlainYearMonth.from(
  month_list[month_list.length - 1]
).year;
export const MIN_FLOOR_AREA = 20;
export const MAX_FLOOR_AREA = 300;
export const PREDICTION_MONTHS = [...month_list.slice(-13)];

@Injectable({
  providedIn: 'root'
})
export class PredictionService {
  private readonly http = inject(HttpClient);

  async fetchPrediction(payload: PredictionRequestPayload): Promise<ApiResponse> {
    const formData = createPredictionFormData(payload);
    const responseText = await firstValueFrom(
      this.http.post(PREDICTION_API_URL, formData, { responseType: 'text' })
    );
    return parsePredictionResponse(responseText, payload);
  }
}

export function normalizeTrendData(data: ApiResponse): TrendPoint[] {
  return data.predictions.map((entry) => ({
    label: entry.month,
    value: sanitizeCurrencyValue(entry.predictedPrice)
  }));
}

export function getPredictionWindow(): {
  monthStart: string;
  monthEnd: string;
} {
  return {
    monthStart: PREDICTION_MONTHS[0] ?? month_list[0],
    monthEnd:
      PREDICTION_MONTHS[PREDICTION_MONTHS.length - 1] ??
      month_list[month_list.length - 1]
  };
}

export function createDefaultTrendData(): TrendPoint[] {
  return PREDICTION_MONTHS.map((month) => ({
    label: month,
    value: 0
  }));
}

export function buildPredictionRequestPayload(formValue: {
  ml_model: MlModel;
  town: Town;
  storey_range: StoreyRange;
  flat_model: FlatModel;
  floor_area_sqm: number;
  lease_commence_year: number;
}): PredictionRequestPayload {
  const predictionWindow = getPredictionWindow();
  return {
    model: formValue.ml_model,
    monthStart: predictionWindow.monthStart,
    monthEnd: predictionWindow.monthEnd,
    town: formValue.town,
    storeyRange: formValue.storey_range,
    flatModel: formValue.flat_model,
    floorAreaSqm: formValue.floor_area_sqm.toString(),
    leaseCommenceYear: formValue.lease_commence_year.toString()
  };
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

export function sanitizeCurrencyValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function roundValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value);
}

export function coerceOption<T extends readonly string[]>(
  value: unknown,
  options: T
): T[number] {
  if (typeof value === 'string' && options.includes(value as T[number])) {
    return value as T[number];
  }

  return options[0];
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(n)));
}
