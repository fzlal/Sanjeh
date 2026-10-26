import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type { LanguageCode } from '@/types';
import {
  directionOf,
  getLanguage,
  type Direction,
  type LanguageMeta,
} from './languages';
import type { MessageKey, Messages } from './locales/en';
import { en } from './locales/en';
import { fa } from './locales/fa';
import { calendarForLocale } from '@/lib/calendar';

export const dictionaries: Record<LanguageCode, Messages> = {
  fa,
  en,
};

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export interface I18nValue {
  language: LanguageCode;
  locale: string;
  dir: Direction;
  meta: LanguageMeta;
  messages: Messages;
  t: Translate;
}

function translate(
  messages: Messages,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = messages[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  language,
  children,
}: {
  language: LanguageCode;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(() => {
    const meta = getLanguage(language);
    const messages = dictionaries[language] ?? en;
    return {
      language,
      locale: meta.locale,
      dir: directionOf(language),
      meta,
      messages,
      t: (key, params) => translate(messages, key, params),
    };
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = value.language;
    root.dir = value.dir;
  }, [value.language, value.dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}

export function useT(): Translate {
  return useI18n().t;
}

export function useLocale(): string {
  return useI18n().locale;
}

/** Bind Intl-backed formatters to the active locale. */
export function useFormatters() {
  const { locale } = useI18n();
  return useMemo(
    () => ({
      locale,
      number: (value: number, options?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(locale, options).format(value),
      date: (timestamp: number, options?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(locale, {
          calendar: calendarForLocale(locale),
          ...(options ?? { dateStyle: 'medium' }),
        }).format(timestamp),
    }),
    [locale],
  );
}

export type { MessageKey };
