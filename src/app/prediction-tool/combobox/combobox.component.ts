import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

export interface ComboboxOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-combobox',
  templateUrl: './combobox.component.html',
  styleUrl: './combobox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)'
  }
})
export class ComboboxComponent implements FormValueControl<string>, OnDestroy {
  // Signal Forms control contract: the [formField] directive keeps `value` in
  // sync with the bound field, and auto-binds `disabled`/`required`/`touched`
  // from the field's state and validators.
  readonly value = model<string>('');
  readonly disabled = input(false);
  readonly touched = model(false);
  readonly options = input<ComboboxOption[]>([]);
  readonly placeholder = input('');
  readonly inputId = input('');
  readonly ariaLabel = input('');
  readonly noMatchesLabel = input('No matches');
  readonly required = input(false);
  readonly ariaDescribedby = input<string | null>(null);
  readonly toggleLabel = input('Toggle options');

  protected readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('inputEl');
  protected readonly listboxEl = viewChild<ElementRef<HTMLUListElement>>('listboxEl');

  protected readonly query = signal<string>('');
  protected readonly isOpen = signal(false);
  protected readonly focused = signal(false);
  protected readonly activeIndex = signal(-1);
  // Tracks whether the user has started typing since the dropdown was opened.
  // While false the input shows the selected option's label; once true it shows
  // the live query string so the user sees their own keystrokes.
  protected readonly userTyped = signal(false);

  // Unique per-instance ID captured once at construction so the listboxId
  // computed does not contain a side-effecting _nextId++ inside it (computed
  // signals must be pure — re-evaluation would otherwise change the ID).
  private readonly _instanceId = ComboboxComponent._nextId++;
  private static _nextId = 0;

  // Resolved ID guaranteed to be non-empty: uses the provided inputId or falls
  // back to the per-instance unique ID.  Used consistently by listboxId,
  // activeOptionId, and the template so IDs never collide across instances.
  protected readonly resolvedInputId = computed(() => {
    return this.inputId() || `_cb_${this._instanceId}`;
  });

  protected readonly listboxId = computed(() => `lb-${this.resolvedInputId()}`);

  protected readonly filtered = computed(() => {
    // Fall back to [] if the parent somehow passes null/undefined.
    const opts = this.options() ?? [];
    const q = this.query().toLowerCase().trim();
    if (!q) return opts;
    return opts.filter((opt) => opt.label.toLowerCase().includes(q));
  });

  protected readonly inputDisplayValue = computed(() => {
    // Only show the raw query string after the user has actually started typing;
    // before that (or when closed) display the selected option's label so the
    // value doesn't visually disappear the moment the dropdown opens.
    if (this.isOpen() && this.userTyped()) {
      return this.query();
    }
    const selected = (this.options() ?? []).find((opt) => opt.value === this.value());
    return selected ? selected.label : '';
  });

  protected readonly activeOptionId = computed(() => {
    const idx = this.activeIndex();
    if (idx < 0) return null;
    return `opt-${this.resolvedInputId()}-${idx}`;
  });

  private readonly _elementRef = inject(ElementRef);

  constructor() {
    // Reset escapeDismissed when the bound field value changes externally
    // (e.g. form reset) so the dropdown can auto-open on the next focus.
    effect(() => {
      this.value();
      this.escapeDismissed = false;
    });
  }

  // Timeout ID for the post-open scroll; tracked so it can be cancelled on destroy.
  private scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // Blur close is delayed so touch-taps on options (where mousedown can't
  // prevent blur) still have time for the click to fire and select the option.
  private blurTimeoutId: ReturnType<typeof setTimeout> | null = null;
  // Set when the user dismisses the dropdown with Escape; prevents focus
  // alone (e.g. tabbing back in) from re-opening it until an explicit action.
  private escapeDismissed = false;

  // Close on click outside — skip the containment check when already closed.
  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.isOpen()) return;
    const el = (event.target as HTMLElement);
    if (!this._elementRef.nativeElement.contains(el)) {
      // Also cancel any pending blur-close timer — on touch devices blur fires
      // before pointerdown, so without this cancellation close() would be
      // called a second time when the timer expires.
      if (this.blurTimeoutId !== null) {
        clearTimeout(this.blurTimeoutId);
        this.blurTimeoutId = null;
      }
      this.close();
    }
  }

  ngOnDestroy(): void {
    if (this.scrollTimeoutId !== null) {
      clearTimeout(this.scrollTimeoutId);
    }
    if (this.blurTimeoutId !== null) {
      clearTimeout(this.blurTimeoutId);
    }
  }

  protected onFocus(): void {
    // Programmatic focus (e.g. from assistive technology or parent code) can
    // bypass the [disabled] attribute; guard against it here.
    if (this.disabled()) return;
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
    this.touched.set(true);
    // The Escape-dismiss flag should only suppress the re-open for the duration
    // of the current focus session.  Clear it here so that after the user
    // presses Escape, navigates away, and tabs back, the dropdown opens normally.
    this.escapeDismissed = false;
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
    this.userTyped.set(true);
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
        if (!this.isOpen()) {
          this.open();
        } else {
          event.preventDefault();
          const next = Math.min(this.activeIndex() + 1, filtered.length - 1);
          this.activeIndex.set(next);
          this.scrollActiveIntoView();
        }
        break;
      case 'ArrowUp':
        if (this.isOpen()) {
          event.preventDefault();
          const cur = this.activeIndex();
          const prev = cur <= 0 ? filtered.length - 1 : cur - 1;
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
        if (this.isOpen()) {
          event.preventDefault();
          // Only commit if there's an active option; otherwise just close to
          // avoid letting the key bubble to the parent <form> and submitting.
          const idx = this.activeIndex();
          const opt = idx >= 0 ? filtered[idx] : undefined;
          if (opt) {
            this.selectOption(opt.value);
          } else {
            this.close();
          }
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          // Only prevent / stop propagation when the dropdown is actually open,
          // so that Escape when the combobox is closed can bubble up and let the
          // parent form (e.g. prediction-tool's document-level listener) handle
          // it as a form-reset shortcut.
          event.preventDefault();
          event.stopPropagation();
          this.close();
          this.escapeDismissed = true;
          // Return focus to the input so the user can continue editing.
          this.inputEl()?.nativeElement.focus();
        }
        break;
      case 'Tab':
        if (this.isOpen()) {
          // Close without committing — mouseenter may have set activeIndex to a
          // hovered option the user didn't intend to select.  Only Enter commits.
          this.close();
        }
        break;
    }
  }

  protected toggleOpen(): void {
    if (this.disabled()) return;
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
      this.inputEl()?.nativeElement.focus();
    }
  }

  protected selectOption(val: string): void {
    this.value.set(val);
    // Do NOT clear query here — close() handles it atomically so there is no
    // intermediate state where isOpen=true + query='' + userTyped=true, which
    // would cause inputDisplayValue to briefly return '' (a visible flash).
    this.close();
  }

  private open(): void {
    this.isOpen.set(true);
    this.escapeDismissed = false;
    // Reset the userTyped flag so the selected label stays visible until the
    // user starts typing; also select all text so the first keystroke replaces it.
    this.userTyped.set(false);
    // Pre-select the active index to the current value
    const f = this.filtered();
    const currentIdx = f.findIndex((opt) => opt.value === this.value());
    // Only highlight an existing selection; leave at -1 otherwise so that Tab
    // out of a freshly-opened (nothing selected) dropdown does not accidentally
    // commit the first option.
    this.activeIndex.set(currentIdx >= 0 ? currentIdx : -1);
    // Scroll to active item after render; cancel any previous pending scroll.
    if (this.scrollTimeoutId !== null) {
      clearTimeout(this.scrollTimeoutId);
    }
    this.scrollTimeoutId = setTimeout(() => {
      this.scrollTimeoutId = null;
      this.scrollActiveIntoView();
      // Select all text so the user can immediately type a new query without
      // having to manually clear the existing label.
      this.inputEl()?.nativeElement.select();
    }, 0);
  }

  private close(): void {
    // Cancel any pending blur-close timer so a rapid re-open within 150 ms
    // (e.g. option tap on mobile) isn't immediately closed by the stale timer.
    if (this.blurTimeoutId !== null) {
      clearTimeout(this.blurTimeoutId);
      this.blurTimeoutId = null;
    }
    this.isOpen.set(false);
    this.query.set('');
    this.activeIndex.set(-1);
    this.userTyped.set(false);
  }

  private scrollActiveIntoView(): void {
    const idx = this.activeIndex();
    const listboxEl = this.listboxEl();
    if (idx < 0 || !listboxEl) return;
    const listbox = listboxEl.nativeElement;
    const item = listbox.children[idx] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }
}
