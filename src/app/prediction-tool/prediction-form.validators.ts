import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function integerValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) ? null : { integer: true };
}

export function floorAreaValidators(
  min: number,
  max: number
): ValidatorFn[] {
  return [
    (control) => (control.value === null || control.value === '' ? { required: true } : null),
    (control) => {
      const numeric = Number(control.value);
      if (!Number.isFinite(numeric)) {
        return { required: true };
      }
      if (numeric < min) {
        return { min: { min, actual: numeric } };
      }
      if (numeric > max) {
        return { max: { max, actual: numeric } };
      }
      return integerValidator(control);
    }
  ];
}
