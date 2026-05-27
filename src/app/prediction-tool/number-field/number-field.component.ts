import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  computed,
  forwardRef,
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
  @Input() min = 0;
  @Input() max = 999;
  @Input() step = 1;
  @Input() placeholder = '';
  @Input() inputId = '';
  @Input() unit = '';
  @Input() ariaLabel = '';
  @Input() ariaDescribedby: string | null = null;
  @Input() decreaseLabel = 'Decrease value';
  @Input() increaseLabel = 'Increase value';

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
    return n !== null && n <= this.min;
  });

  protected readonly atMax = computed(() => {
    const n = this.numericValue();
    return n !== null && n >= this.max;
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
    const current = this.numericValue() ?? this.min;
    const next = Math.min(this.max, Math.round(current + this.step));
    this.setValue(next);
  }

  protected decrement(): void {
    const current = this.numericValue() ?? this.min;
    const next = Math.max(this.min, Math.round(current - this.step));
    this.setValue(next);
  }

  protected startHold(event: PointerEvent, dir: 'inc' | 'dec'): void {
    if (this.disabled()) return;
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
      return;
    }
    const n = parseFloat(raw);
    if (!Number.isNaN(n)) {
      this.rawValue.set(n);
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
        this.setValue(this.min);
        break;
      case 'End':
        event.preventDefault();
        this.setValue(this.max);
        break;
    }
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.onTouched();
    // Clamp on blur
    const n = this.numericValue();
    if (n !== null) {
      this.setValue(Math.min(this.max, Math.max(this.min, n)));
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
