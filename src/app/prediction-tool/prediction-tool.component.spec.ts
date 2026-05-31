import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PredictionToolComponent } from './prediction-tool.component';
import { PredictionService, type ApiResponse } from '../services/prediction.service';

const MOCK_RESPONSE: ApiResponse = {
  predictions: [
    { month: '2024-12', predictedPrice: 420000 },
    { month: '2025-01', predictedPrice: 500000 }
  ]
};

// Each test can swap this to control how the mocked service resolves/rejects.
let mockFetch: (payload: unknown) => Promise<ApiResponse>;

describe('PredictionToolComponent', () => {
  let component: PredictionToolComponent;
  let fixture: ComponentFixture<PredictionToolComponent>;

  beforeEach(async () => {
    localStorage.clear();
    mockFetch = async () => MOCK_RESPONSE;

    await TestBed.configureTestingModule({
      imports: [PredictionToolComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        {
          provide: PredictionService,
          useValue: {
            fetchPrediction: (payload: unknown) => mockFetch(payload)
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PredictionToolComponent);
    component = fixture.componentInstance;
  });

  it('should create', async () => {
    await fixture.whenStable();
    expect(component).toBeTruthy();
  });

  it('should show the empty-results placeholder before a prediction is generated', async () => {
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.empty-heading')?.textContent)
      .toContain('Run a scenario');
    expect(compiled.querySelector('.price-value.awaiting')?.textContent)
      .toContain('Awaiting prediction');
  });

  it('should reset form interaction state when reset is clicked', async () => {
    await fixture.whenStable();
    const form = component['predictionForm'];

    form.markAllAsTouched();
    expect(form.touched).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('.btn-reset')?.click();
    await fixture.whenStable();

    expect(form.touched).toBe(false);
  });

  it('should display the resolved prediction after submitting', async () => {
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    await component['onSubmit']();

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(compiled.querySelector('.price-value.has-value')).toBeTruthy();
    });

    // The latest prediction (500000) drives the headline price; assert the
    // resolved-status path actually populated the results panel.
    expect(compiled.querySelector('.price-value.has-value')?.textContent)
      .toMatch(/500,?000/);
    expect(compiled.querySelector('.price-value.awaiting')).toBeNull();
  });

  it('should surface an error message when the request fails', async () => {
    mockFetch = async () => {
      throw new Error('prediction failed');
    };
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    await component['onSubmit']();

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(compiled.querySelector('.error-display')).toBeTruthy();
    });

    expect(compiled.querySelector('.error-display')?.textContent?.trim().length)
      .toBeGreaterThan(0);
    expect(compiled.querySelector('.price-value.has-value')).toBeNull();
  });
});
