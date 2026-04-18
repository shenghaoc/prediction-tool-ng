import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PredictionToolComponent } from './prediction-tool.component';

describe('PredictionToolComponent', () => {
  let component: PredictionToolComponent;
  let fixture: ComponentFixture<PredictionToolComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PredictionToolComponent],
      providers: [provideZonelessChangeDetection()]
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

    expect(compiled.querySelector('.chart-placeholder-title')?.textContent)
      .toContain('Run a scenario');
    expect(compiled.querySelector('.price-value-placeholder')?.textContent)
      .toContain('Awaiting prediction');
  });
});
