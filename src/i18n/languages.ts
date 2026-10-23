import type { LanguageCode } from '@/types';

export type Direction = 'rtl' | 'ltr';

export interface LanguageMeta {
  code: LanguageCode;
  /** Endonym shown in selectors, e.g. فارسی. */
  nativeName: string;
  /** Latin-script name used for accessible labels and search. */
  latinName: string;
  dir: Direction;
  locale: string;
}

export const languages: readonly LanguageMeta[] = [
  { code: 'fa', nativeName: 'فارسی', latinName: 'Persian', dir: 'rtl', locale: 'fa-IR' },
  { code: 'en', nativeName: 'English', latinName: 'English', dir: 'ltr', locale: 'en-US' },
] as const;

export const DEFAULT_LANGUAGE: LanguageCode = 'fa';

const languageMap = new Map(languages.map((language) => [language.code, language]));

export function getLanguage(code: LanguageCode): LanguageMeta {
  return languageMap.get(code) ?? languageMap.get(DEFAULT_LANGUAGE)!;
}

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && languageMap.has(value as LanguageCode);
}

export function directionOf(code: LanguageCode): Direction {
  return getLanguage(code).dir;
}
