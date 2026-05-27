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
  // options is backed by a signal so computed signals (filtered, inputDisplayValue)
  // react when the parent passes a new array (e.g. after a language switch).
  protected readonly optionsSignal = signal<ComboboxOption[]>([]);
  @Input() set options(val: ComboboxOption[]) { this.optionsSignal.set(val ?? []); }
  get options(): ComboboxOption[] { return this.optionsSignal(); }

  @Input() placeholder = '';
  @Input() inputId = '';
  @Input() ariaLabel = '';
  @Input() noMatchesLabel = 'No matches';
  @Input() required = false;

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
    const opts = this.optionsSignal();
    const q = this.query().toLowerCase().trim();
    if (!q) return opts;
    return opts.filter((opt) => opt.label.toLowerCase().includes(q));
  });

  protected readonly inputDisplayValue = computed(() => {
    if (this.isOpen()) {
      return this.query();
    }
    const selected = this.optionsSignal().find((opt) => opt.value === this.value());
    return selected ? selected.label : '';
  });

  protected readonly activeOptionId = computed(() => {
    const idx = this.activeIndex();
    if (idx < 0) return null;
    return `opt-${this.inputId}-${idx}`;
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  // Timeout ID for the post-open scroll; tracked so it can be cancelled on destroy.
  private scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // Blur close is delayed so touch-taps on options (where mousedown can't
  // prevent blur) still have time for the click to fire and select the option.
  private blurTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // Set when the user dismisses the dropdown with Escape; prevents focus
  // alone (e.g. tabbing back in) from re-opening it until an explicit action.
  private escapeDismissed = false;

  // Close on click outside — skip the containment check when already closed.
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.isOpen()) return;
    const el = (event.target as HTMLElement);
    if (!this._elementRef.nativeElement.contains(el)) {
      this.close();
    }
  }

  constructor(private _elementRef: ElementRef) {}

  ngOnDestroy(): void {
    if (this.scrollTimeoutId !== null) {
      clearTimeout(this.scrollTimeoutId);
    }
    if (this.blurTimeoutId !== null) {
      clearTimeout(this.blurTimeoutId);
    }
  }

  writeValue(val: string): void {
    this.value.set(val ?? '');
    // Reset dismiss flag so the dropdown behaves normally after a form reset.
    this.escapeDismissed = false;
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
    // Cancel any pending blur-close timer so a rapid tab-out + tab-back
    // within the 150 ms window doesn't close a freshly re-opened dropdown.
    if (this.blurTimeoutId !== null) {
      clearTimeout(this.blurTimeoutId);
      this.blurTimeoutId = null;
    }
    this.focused.set(true);
    // Don't re-open on focus if the user dismissed the dropdown with Escape.
    if (!this.escapeDismissed) {
      this.open();
    }
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.onTouched();
    // On desktop, mousedown.preventDefault() on the listbox/chevron prevents
    // blur from firing when clicking an option. On mobile touch there is no
    // mousedown, so blur can fire before the tap's click event; the 150 ms
    // delay ensures the click fires first and selects the option.
    if (this.blurTimeoutId !== null) clearTimeout(this.blurTimeoutId);
    this.blurTimeoutId = setTimeout(() => {
      this.blurTimeoutId = null;
      this.close();
    }, 150);
  }

  protected onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.query.set(target.value);
    this.activeIndex.set(this.filtered().length > 0 ? 0 : -1);
    // Typing is an explicit intent to open.
    this.escapeDismissed = false;
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
          this.escapeDismissed = true;
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
    this.escapeDismissed = false;
    // Pre-select the active index to the current value
    const currentIdx = this.filtered().findIndex((opt) => opt.value === this.value());
    this.activeIndex.set(currentIdx >= 0 ? currentIdx : 0);
    // Scroll to active item after render; cancel any previous pending scroll.
    if (this.scrollTimeoutId !== null) {
      clearTimeout(this.scrollTimeoutId);
    }
    this.scrollTimeoutId = setTimeout(() => {
      this.scrollTimeoutId = null;
      this.scrollActiveIntoView();
    }, 0);
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
