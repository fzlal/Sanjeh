import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { MessageKey } from '@/i18n';
import { useI18n } from '@/i18n';
import { useSettings } from '@/app/settings-provider';
import { resolveAppearance, themeIds, themes, type Appearance } from '@/themes';
import { cn } from '@/lib/utils';

function useResolvedAppearance(): Appearance {
  const { settings } = useSettings();
  const [prefersDark, setPrefersDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    if (settings.appearance !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setPrefersDark(media.matches);
    listener();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [settings.appearance]);

  return resolveAppearance(settings.appearance, prefersDark);
}

export function ThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (theme: string) => void;
}) {
  const { t } = useI18n();
  const appearance = useResolvedAppearance();
  return (
    <div role="radiogroup" aria-label={t('theme')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {themeIds.map((id) => {
        const theme = themes[id];
        const palette = theme[appearance];
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={cn(
              'group flex flex-col gap-2 rounded-lg border p-2.5 text-start transition-[background-color,border-color,transform] duration-200 active:scale-[0.98]',
              selected
                ? 'border-primary/70 bg-secondary/70'
                : 'border-border bg-input hover:border-primary/35 hover:bg-secondary/40',
            )}
          >
            <span
              className="relative flex h-10 w-full items-end gap-1 overflow-hidden rounded-md border p-1.5"
              style={{ backgroundColor: palette.background, borderColor: palette.border }}
              aria-hidden="true"
            >
              <span
                className="h-4 flex-1 rounded-sm"
                style={{ backgroundColor: palette.surface, border: `1px solid ${palette.border}` }}
              />
              <span
                className="size-4 rounded-full"
                style={{ backgroundColor: palette.primary }}
              />
              <span className="size-4 rounded-full" style={{ backgroundColor: palette.accent }} />
              {selected && (
                <span
                  className="animate-pop-in absolute end-1 top-1 flex size-4 items-center justify-center rounded-full"
                  style={{ backgroundColor: palette.primary, color: palette.primaryForeground }}
                >
                  <Check className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="flex items-center justify-between gap-1">
              <span className="truncate text-xs font-medium">
                {t(theme.nameKey as MessageKey)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
