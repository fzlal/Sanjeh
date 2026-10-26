import type { Settings } from '@/types';
import { isLanguageCode } from '@/i18n/languages';
import { DEFAULT_THEME, isThemeId } from '@/themes';

export const BOOT_STORAGE_KEY = 'sanjeh:boot';

export const DEFAULT_SETTINGS: Settings = {
  language: 'fa',
  theme: DEFAULT_THEME,
  appearance: 'light',
  onboardingComplete: false,
  guideSeen: false,
};

/** Synchronous mirror of settings so the first paint has the right theme and direction. */
export function readBootSettings(): Settings {
  try {
    const raw = localStorage.getItem(BOOT_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
    const record = parsed as Record<string, unknown>;
    return {
      language: isLanguageCode(record.language) ? record.language : DEFAULT_SETTINGS.language,
      theme:
        typeof record.theme === 'string' && isThemeId(record.theme)
          ? record.theme
          : DEFAULT_SETTINGS.theme,
      appearance:
        record.appearance === 'light' ||
        record.appearance === 'dark' ||
        record.appearance === 'system'
          ? record.appearance
          : DEFAULT_SETTINGS.appearance,
      onboardingComplete:
        typeof record.onboardingComplete === 'boolean'
          ? record.onboardingComplete
          : DEFAULT_SETTINGS.onboardingComplete,
      guideSeen:
        typeof record.guideSeen === 'boolean' ? record.guideSeen : DEFAULT_SETTINGS.guideSeen,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeBootSettings(settings: Settings): void {
  try {
    localStorage.setItem(BOOT_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* preferences still live in IndexedDB; the mirror is only a paint hint */
  }
}

export function clearBootSettings(): void {
  try {
    localStorage.removeItem(BOOT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
