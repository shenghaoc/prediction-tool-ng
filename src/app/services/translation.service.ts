import { inject, Injectable, signal } from '@angular/core';

import { StorageService } from './storage.service';
import { TRANSLATION_RESOURCES } from './i18n.resources';
import type { Lang, OptionGroup } from './i18n.resources';

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly storageService = inject(StorageService);
  readonly lang = signal<Lang>(this.getInitialLanguage());

  translate(key: string): string {
    return TRANSLATION_RESOURCES[this.lang()].labels[key] ?? key;
  }

  translateOption(group: OptionGroup, value: string): string {
    return TRANSLATION_RESOURCES[this.lang()].options[group][value] ?? value;
  }

  currentLang(): Lang {
    return this.lang();
  }

  setLanguage(lang: Lang): void {
    this.lang.set(lang);
    this.storageService.setItem('lang', lang);
  }

  toggleLanguage(): Lang {
    const nextLanguage = this.lang() === 'en' ? 'zh' : 'en';
    this.setLanguage(nextLanguage);
    return nextLanguage;
  }

  private getInitialLanguage(): Lang {
    const storedLanguage = this.storageService.getItem<Lang>('lang');
    if (storedLanguage === 'zh') {
      return 'zh';
    }

    return 'en';
  }
}

export type { Lang } from './i18n.resources';
export type { OptionGroup } from './i18n.resources';
