import { Ban, RotateCcw } from 'lucide-react';
import type { AnswerKey } from '@/types';
import { OPTION_INDICES } from '@/types';
import { toggleCorrectOption, toggleExcluded } from '@/lib/answerKey';
import { formatNumber } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export interface AnswerKeyEditorItem {
  id: string;
  key: AnswerKey;
}

/**
 * Editable answer key. Options are toggles (multiple correct options allowed),
 * clearing them returns the question to unresolved, and exclusion is separate.
 */
export function AnswerKeyEditor({
  items,
  onChange,
}: {
  items: AnswerKeyEditorItem[];
  onChange: (questionId: string, key: AnswerKey) => void;
}) {
  const { t, locale } = useI18n();

  return (
    <ul
      dir="ltr"
      aria-label={t('keyEditorLabel')}
      className="grid gap-1.5 p-2 sm:grid-cols-2 sm:gap-2 sm:p-3 xl:grid-cols-3"
    >
      {items.map((item, index) => {
        const known = item.key.kind === 'known' ? item.key.correct : [];
        const excluded = item.key.kind === 'excluded';
        const unresolved = item.key.kind === 'unresolved';
        const excludeLabel = excluded ? t('restoreQuestion') : t('excludeQuestion');

        return (
          <li
            key={item.id}
            data-key-question={index + 1}
            className={cn(
              'flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors',
              excluded && 'border-excluded-border bg-excluded-bg/70',
              unresolved && 'border-unanswered-border bg-unanswered-bg',
              !excluded && !unresolved && 'border-border bg-background/50',
            )}
          >
            <span className="tnum w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground">
              {formatNumber(index + 1, locale)}
            </span>

            <div className="flex items-center gap-1">
              {OPTION_INDICES.map((option) => {
                const selected = known.includes(option);
                const label = `${t('questionNumber', { n: index + 1 })} · ${t('optionLabel', {
                  n: option,
                })}`;
                return (
                  <button
                    key={option}
                    type="button"
                    data-option={option}
                    aria-pressed={selected}
                    aria-label={label}
                    title={label}
                    onClick={() => onChange(item.id, toggleCorrectOption(item.key, option))}
                    className={cn(
                      'tnum flex size-8 items-center justify-center rounded-full border text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-90',
                      selected
                        ? 'border-correct bg-correct text-white'
                        : 'border-border bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground',
                      selected && 'animate-pop-in',
                    )}
                  >
                    {formatNumber(option, locale)}
                  </button>
                );
              })}
            </div>

            <span className="ms-auto flex items-center gap-1">
              {unresolved && (
                <span className="text-[10px] font-medium text-unanswered">{t('needsAnswer')}</span>
              )}
              {excluded && (
                <span className="text-[10px] font-medium text-excluded">{t('excludedLabel')}</span>
              )}
              <button
                type="button"
                aria-pressed={excluded}
                aria-label={excludeLabel}
                title={excludeLabel}
                onClick={() => onChange(item.id, toggleExcluded(item.key))}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md border transition-colors duration-150 active:scale-90',
                  excluded
                    ? 'border-excluded-border bg-excluded-bg text-excluded hover:bg-excluded-bg/60'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground',
                )}
              >
                {excluded ? (
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                ) : (
                  <Ban className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
