import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { page } from 'vitest/browser';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from '../app/app.component';
import { appConfig } from '../app/app.config';

describe('Prediction Tool - Browser Smoke Test', () => {
  // Mount the Angular application once before all tests
  beforeAll(async () => {
    // Create the root element Angular expects to bootstrap onto
    const appRoot = document.createElement('app-root');
    document.body.appendChild(appRoot);
    await bootstrapApplication(AppComponent, appConfig);
  });

  // Wait for the app to render before each test
  beforeEach(async () => {
    await expect.element(page.getByRole('main')).toBeVisible();
  });

  it('should render the form heading', async () => {
    const headings = page.getByRole('heading', { level: 2 });
    await expect.element(headings.first()).toBeVisible();
  });

  it('should open the ML Model combobox and select an option', async () => {
    // First combobox on the page (ML Model)
    const mlModelInput = page.getByRole('combobox').first();
    await expect.element(mlModelInput).toBeVisible();

    // Click the first toggle button (ML Model combobox's chevron)
    const toggleButton = page.getByRole('button', { name: /toggle/i }).first();
    await toggleButton.click();

    // Wait for the listbox to appear and select first option
    const listbox = page.getByRole('listbox');
    await expect.element(listbox).toBeVisible();
    const firstOption = listbox.getByRole('option').first();
    await firstOption.click();

    // Verify the combobox value was updated
    const el = (await mlModelInput.findElement()) as HTMLInputElement;
    expect(el.value).toBeTruthy();
  });

  it('should type in the number field and verify stepper works', async () => {
    // The number field uses role="spinbutton"
    const numberInput = page.getByRole('spinbutton');
    await expect.element(numberInput).toBeVisible();

    // Clear and type a value
    await numberInput.fill('120');

    // Click the increase stepper button
    const increaseButton = page.getByRole('button', { name: /increase/i });
    await increaseButton.click();

    // Value should have increased
    const input = (await numberInput.findElement()) as HTMLInputElement;
    expect(Number(input.value)).toBeGreaterThan(120);
  });

  it('should have aria-required on the number field', async () => {
    const numberInput = page.getByRole('spinbutton');
    const el = (await numberInput.findElement()) as HTMLInputElement;
    expect(el.getAttribute('aria-required')).toBe('true');
  });
});
