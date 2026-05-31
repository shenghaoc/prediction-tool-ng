import { describe, it, expect, beforeEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PredictionToolComponent } from './prediction-tool.component';

describe('PredictionToolComponent', () => {
  let component: PredictionToolComponent;
  let fixture: ComponentFixture<PredictionToolComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PredictionToolComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClient()]
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
});
