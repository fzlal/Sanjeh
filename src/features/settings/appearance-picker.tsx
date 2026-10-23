import { Monitor, Moon, Sun } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { AppearanceMode } from '@/types';
import { cn } from '@/lib/utils';

const options = [
  { value: 'light', icon: Sun, label: 'light' },
  { value: 'dark', icon: Moon, label: 'dark' },
  { value: 'system', icon: Monitor, label: 'system' },
] as const;

export function AppearancePicker({
  value,
  onChange,
}: {
  value: AppearanceMode;
  onChange: (mode: AppearanceMode) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t('appearance')}
      className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-input p-1"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.97]',
              selected
                ? 'bg-surface text-foreground shadow-soft'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span>{t(option.label)}</span>
          </button>
        );
      })}
    </div>
  );
}
