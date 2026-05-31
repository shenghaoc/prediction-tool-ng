import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from '../app/app.component';
import { appConfig } from '../app/app.config';

describe('Prediction Tool - Browser Smoke Test', () => {
  beforeAll(async () => {
    if (!document.querySelector('app-root')) {
      const appRoot = document.createElement('app-root');
      document.body.appendChild(appRoot);
      await bootstrapApplication(AppComponent, appConfig);
    }
  });

  beforeEach(async () => {
    await expect.element(page.getByRole('main')).toBeVisible();
  });

  afterEach(async () => {
    const resetBtn = page.getByRole('button', { name: /reset/i });
    if ((await resetBtn.all()).length > 0) {
      await resetBtn.click();
    }
  });

  it('should render the form heading', async () => {
    const headings = page.getByRole('heading', { level: 2 });
    await expect.element(headings.first()).toBeVisible();
  });

  it('should open the ML Model select and choose an option', async () => {
    const mlModelSelect = page.getByRole('combobox', { name: /ml model/i });
    await expect.element(mlModelSelect).toBeVisible();
    await mlModelSelect.click();

    const ridgeOption = page.getByRole('option', { name: /ridge regression/i });
    await ridgeOption.click();

    await expect.element(mlModelSelect).toHaveTextContent(/ridge regression/i);
  });

  it('should type in the floor area field', async () => {
    const floorAreaInput = page.getByRole('spinbutton', { name: /floor area/i });
    await expect.element(floorAreaInput).toBeVisible();
    await floorAreaInput.fill('120');

    const input = floorAreaInput.element() as HTMLInputElement;
    expect(Number(input.value)).toBe(120);
  });

  it('should mark the floor area field as required', async () => {
    const floorAreaInput = page.getByRole('spinbutton', { name: /floor area/i });
    await expect.element(floorAreaInput).toHaveAttribute('required');
  });
});
