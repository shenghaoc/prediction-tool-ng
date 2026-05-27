import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  forwardRef,
  input,
  signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-number-field',
  standalone: true,
  templateUrl: './number-field.component.html',
  styleUrl: './number-field.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NumberFieldComponent),
      multi: true
    }
  ]
})
export class NumberFieldComponent implements ControlValueAccessor, OnDestroy {
  readonly min = input(0);
  readonly max = input(999);
  readonly step = input(1);
  readonly placeholder = input('');
  readonly inputId = input('');
  readonly unit = input('');
  readonly ariaLabel = input('');
  readonly ariaDescribedby = input<string | null>(null);
  readonly decreaseLabel = input('Decrease value');
  readonly increaseLabel = input('Increase value');

  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;

  protected readonly rawValue = signal<number | string>('');
  protected readonly focused = signal(false);
  protected readonly disabled = signal(false);

  protected readonly numericValue = computed(() => {
    const v = this.rawValue();
    if (v === '' || v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isNaN(n) ? null : n;
  });

  protected readonly displayValue = computed(() => {
    const v = this.rawValue();
    return v === '' ? '' : String(v);
  });

  protected readonly atMin = computed(() => {
    const n = this.numericValue();
    return n !== null && n <= this.min();
  });

  protected readonly atMax = computed(() => {
    const n = this.numericValue();
    return n !== null && n >= this.max();
  });

  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  private holdTimerId: ReturnType<typeof setTimeout> | null = null;
  private holdIntervalId: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.stopHold();
  }

  writeValue(val: number): void {
    this.rawValue.set(val ?? '');
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected increment(): void {
    const current = this.numericValue() ?? this.min();
    // Round the raw sum first (eliminates float drift), then clamp — so the
    // clamp always wins at the boundary even when max is a repeating decimal.
    const snapped = Number((current + this.step()).toFixed(12));
    this.setValue(Math.min(this.max(), snapped));
  }

  protected decrement(): void {
    const current = this.numericValue() ?? this.min();
    // Same pattern: round first, clamp second.
    const snapped = Number((current - this.step()).toFixed(12));
    this.setValue(Math.max(this.min(), snapped));
  }

  protected startHold(event: PointerEvent, dir: 'inc' | 'dec'): void {
    if (this.disabled() || event.button !== 0) return;
    event.preventDefault();

    const fn = dir === 'inc' ? () => this.increment() : () => this.decrement();
    fn(); // fire once immediately

    let count = 0;
    this.holdTimerId = setTimeout(() => {
      this.holdIntervalId = setInterval(() => {
        count++;
        fn();
        // Accelerate after 5 repeats
        if (count === 5) {
          this.stopHold();
          this.holdIntervalId = setInterval(fn, 80);
        }
      }, 200);
    }, 200);
  }

  protected stopHold(): void {
    if (this.holdTimerId !== null) {
      clearTimeout(this.holdTimerId);
      this.holdTimerId = null;
    }
    if (this.holdIntervalId !== null) {
      clearInterval(this.holdIntervalId);
      this.holdIntervalId = null;
    }
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const raw = target.value;
    if (raw === '') {
      this.rawValue.set('');
      // Notify the form control so validation (e.g. required) reacts immediately.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.onChange(null as any);
      return;
    }
    // Use Number() (strict) rather than parseFloat (permissive) so that partial
    // strings like "25abc" are rejected rather than silently parsed as 25.
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      this.rawValue.set(n);
      this.onChange(n);
    } else {
      // Invalid characters typed: immediately notify the form control so
      // validation fires and Ctrl+Enter cannot submit the stale previous value.
      // Do NOT update rawValue — blur will restore the DOM to the last valid value.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.onChange(null as any);
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        this.increment();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.decrement();
        break;
      case 'Home':
        event.preventDefault();
        this.setValue(this.min());
        break;
      case 'End':
        event.preventDefault();
        this.setValue(this.max());
        break;
    }
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.onTouched();
    // Clamp and snap to the nearest step multiple on blur.
    const n = this.numericValue();
    if (n !== null) {
      const min = this.min(), max = this.max(), step = this.step();
      const clamped = Math.min(max, Math.max(min, n));
      // Apply toFixed(12) to prevent float drift (same guard as increment/decrement),
      // then re-clamp in case toFixed rounds a repeating-decimal boundary upward.
      const stepped = Number((min + Math.round((clamped - min) / step) * step).toFixed(12));
      this.setValue(Math.min(max, stepped));
    }
    // Explicitly sync the DOM value so invalid non-numeric text (e.g. "25a") is
    // cleared even when rawValue didn't change and Angular's binding won't re-fire.
    if (this.inputEl) {
      this.inputEl.nativeElement.value = this.displayValue();
    }
  }

  private setValue(n: number): void {
    this.rawValue.set(n);
    this.onChange(n);
  }
}
