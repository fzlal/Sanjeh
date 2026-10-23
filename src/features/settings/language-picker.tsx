import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { languages } from '@/i18n/languages';
import type { LanguageCode } from '@/types';
import { cn } from '@/lib/utils';

export function LanguagePicker({
  value,
  onChange,
  compact = false,
}: {
  value: LanguageCode;
  onChange: (language: LanguageCode) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t('language')}
      className={cn('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3')}
    >
      {languages.map((language) => {
        const selected = language.code === value;
        return (
          <button
            key={language.code}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(language.code)}
            className={cn(
              'flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-start text-sm transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98]',
              selected
                ? 'border-primary/70 bg-secondary text-foreground'
                : 'border-border bg-input text-foreground/85 hover:border-primary/35 hover:bg-secondary/50',
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{language.nativeName}</span>
              {language.nativeName !== language.latinName && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {language.latinName}
                </span>
              )}
            </span>
            {selected && (
              <Check className="animate-pop-in size-4 shrink-0 text-primary" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
