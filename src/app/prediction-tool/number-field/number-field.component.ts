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
    // rawValue is signal<number | string> — null/undefined can never be stored,
    // so only the empty-string sentinel needs a null-return guard.
    if (v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isNaN(n) ? null : n;
  });

  protected readonly displayValue = computed(() => {
    const v = this.rawValue();
    if (v === '' || v === null) return '';
    const str = String(v);
    // rawValue is number | string; NaN is a valid number but String(NaN) === "NaN",
    // which would render as visible text. Guard against it here.
    return str === 'NaN' ? '' : str;
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

  writeValue(val: unknown): void {
    // The CVA interface accepts any; null/undefined mean "no value" and must
    // clear the field.  Guard them before Number() because Number(null) === 0.
    if (val === null || val === undefined) {
      this.rawValue.set('');
      return;
    }
    const n = typeof val === 'number' ? val : Number(val);
    this.rawValue.set(
      typeof n === 'number' && Number.isFinite(n) && !Number.isNaN(n) ? n : ''
    );
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
    const step = this.step();
    // Defensive: non-positive step would make the stepper a no-op or reverse
    // direction, breaking spinbutton semantics.
    if (step <= 0 || !Number.isFinite(step)) return;
    // Round the raw sum first (eliminates float drift), then clamp — so the
    // clamp always wins at the boundary even when max is a repeating decimal.
    const snapped = Number((current + step).toFixed(12));
    const next = Math.min(this.max(), snapped);
    this.setValue(next);
    // When the boundary is reached the button becomes [disabled], which stops
    // the browser from dispatching further pointer events on it — so pointerup/
    // pointerleave can never cancel the hold.  Stop it here explicitly.
    if (next >= this.max()) {
      this.stopHold();
    }
  }

  protected decrement(): void {
    const current = this.numericValue() ?? this.min();
    const step = this.step();
    if (step <= 0 || !Number.isFinite(step)) return;
    // Same pattern: round first, clamp second.
    const snapped = Number((current - step).toFixed(12));
    const next = Math.max(this.min(), snapped);
    this.setValue(next);
    // Same boundary-reached stop as increment (min side).
    if (next <= this.min()) {
      this.stopHold();
    }
  }

  protected startHold(event: PointerEvent, dir: 'inc' | 'dec'): void {
    if (this.disabled() || event.button !== 0) return;
    event.preventDefault();
    // Cancel any existing hold (e.g. two-finger touch fires two pointerdown
    // events) so we never leak an orphaned timer or interval.
    this.stopHold();

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
    // Treat whitespace-only input as empty: Number(" ") === 0 in JS, which
    // would silently parse a space as zero rather than treating it as blank.
    if (!raw.trim()) {
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
      // Store the raw string so a trailing decimal point ("25.") is preserved
      // while the user is mid-entry; Angular's [value] binding won't strip it.
      this.rawValue.set(raw);
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
        if (this.numericValue() !== null) {
          // If the DOM shows invalid text (e.g. "abc") the stepper would
          // silently operate on the old rawValue while the user sees garbage.
          // Restore the DOM to the last valid display value first, then step.
          this.restoreDisplayIfDirty();
          this.increment();
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (this.numericValue() !== null) {
          this.restoreDisplayIfDirty();
          this.decrement();
        }
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
      // Defensive guard: division by zero or negative step would produce
      // NaN/erratic values in the snap-to-step calculation below.
      if (step <= 0 || !Number.isFinite(step)) {
        this.setValue(clamped);
      } else {
        // Apply toFixed(12) to prevent float drift (same guard as
        // increment/decrement), then re-clamp in case toFixed rounds a
        // repeating-decimal boundary upward.
        const stepped = Number(
          (min + Math.round((clamped - min) / step) * step).toFixed(12)
        );
        this.setValue(Math.min(max, stepped));
      }
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

  /** If the DOM input shows invalid text, restore it to the last valid display value. */
  private restoreDisplayIfDirty(): void {
    if (!this.inputEl) return;
    const current = this.inputEl.nativeElement.value;
    const display = this.displayValue();
    if (current !== display) {
      this.inputEl.nativeElement.value = display;
    }
  }
}
