import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  ViewChild,
  computed,
  forwardRef,
  signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface ComboboxOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-combobox',
  standalone: true,
  templateUrl: './combobox.component.html',
  styleUrl: './combobox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ComboboxComponent),
      multi: true
    }
  ]
})
export class ComboboxComponent implements ControlValueAccessor, OnDestroy {
  @Input() options: ComboboxOption[] = [];
  @Input() placeholder = '';
  @Input() inputId = '';
  @Input() ariaLabel = '';

  @ViewChild('inputEl') inputEl?: ElementRef<HTMLInputElement>;
  @ViewChild('listboxEl') listboxEl?: ElementRef<HTMLUListElement>;

  protected readonly value = signal<string>('');
  protected readonly query = signal<string>('');
  protected readonly isOpen = signal(false);
  protected readonly focused = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly disabled = signal(false);

  protected readonly listboxId = computed(() => `lb-${this.inputId}`);

  protected readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return this.options;
    return this.options.filter((opt) =>
      opt.label.toLowerCase().includes(q)
    );
  });

  protected readonly inputDisplayValue = computed(() => {
    if (this.isOpen()) {
      return this.query();
    }
    const selected = this.options.find((opt) => opt.value === this.value());
    return selected ? selected.label : '';
  });

  protected readonly activeOptionId = computed(() => {
    const idx = this.activeIndex();
    if (idx < 0) return null;
    return `opt-${this.inputId}-${idx}`;
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  // Close on click outside
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    const el = (event.target as HTMLElement);
    if (!this._elementRef.nativeElement.contains(el)) {
      this.close();
    }
  }

  constructor(private _elementRef: ElementRef) {}

  ngOnDestroy(): void {}

  writeValue(val: string): void {
    this.value.set(val ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onFocus(): void {
    this.focused.set(true);
    this.open();
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.onTouched();
    // Delay close to allow click events on options to fire first
    setTimeout(() => {
      if (!this._elementRef.nativeElement.contains(document.activeElement)) {
        this.close();
      }
    }, 150);
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.query.set(target.value);
    this.activeIndex.set(this.filtered().length > 0 ? 0 : -1);
    if (!this.isOpen()) {
      this.isOpen.set(true);
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const filtered = this.filtered();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) {
          this.open();
        } else {
          const next = Math.min(this.activeIndex() + 1, filtered.length - 1);
          this.activeIndex.set(next);
          this.scrollActiveIntoView();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.isOpen()) {
          const prev = Math.max(this.activeIndex() - 1, 0);
          this.activeIndex.set(prev);
          this.scrollActiveIntoView();
        }
        break;
      case 'Home':
        if (this.isOpen()) {
          event.preventDefault();
          this.activeIndex.set(0);
          this.scrollActiveIntoView();
        }
        break;
      case 'End':
        if (this.isOpen()) {
          event.preventDefault();
          this.activeIndex.set(filtered.length - 1);
          this.scrollActiveIntoView();
        }
        break;
      case 'Enter':
        if (this.isOpen() && this.activeIndex() >= 0) {
          event.preventDefault();
          const opt = filtered[this.activeIndex()];
          if (opt) {
            this.selectOption(opt.value);
          }
        }
        break;
      case 'Escape':
        event.preventDefault();
        if (this.isOpen()) {
          this.close();
        }
        break;
      case 'Tab':
        if (this.isOpen()) {
          const opt = filtered[this.activeIndex()];
          if (opt) {
            this.selectOption(opt.value);
          } else {
            this.close();
          }
        }
        break;
    }
  }

  protected toggleOpen(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
      this.inputEl?.nativeElement.focus();
    }
  }

  protected selectOption(val: string): void {
    this.value.set(val);
    this.onChange(val);
    this.query.set('');
    this.close();
  }

  private open(): void {
    this.isOpen.set(true);
    // Pre-select the active index to the current value
    const currentIdx = this.filtered().findIndex((opt) => opt.value === this.value());
    this.activeIndex.set(currentIdx >= 0 ? currentIdx : 0);
    // Scroll to active item after render
    setTimeout(() => this.scrollActiveIntoView(), 0);
  }

  private close(): void {
    this.isOpen.set(false);
    this.query.set('');
    this.activeIndex.set(-1);
  }

  private scrollActiveIntoView(): void {
    const idx = this.activeIndex();
    if (idx < 0 || !this.listboxEl) return;
    const listbox = this.listboxEl.nativeElement;
    const item = listbox.children[idx] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }
}
