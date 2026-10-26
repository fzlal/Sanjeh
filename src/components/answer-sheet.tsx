import type { ReactNode } from 'react';
import { Check, Lock, X } from 'lucide-react';
import type { OptionIndex, QuestionOutcome } from '@/types';
import { OPTION_INDICES } from '@/types';
import { useI18n } from '@/i18n';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface AnswerSheetRow {
  id: string;
  number: number;
  selected: OptionIndex[];
  correct: OptionIndex[] | null;
  excluded?: boolean;
  unresolved?: boolean;
  outcome?: QuestionOutcome;
  /** A question outside the active booklet cannot be answered right now. */
  locked?: boolean;
}

type Variant = 'answering' | 'review' | 'key' | 'selected';
type BubbleTone = 'neutral' | 'selected' | 'correct' | 'correctOutline' | 'incorrect' | 'muted';

type GlyphName = 'check' | 'cross' | 'circle' | 'slash' | 'lock';

interface LegendItem {
  glyph: GlyphName;
  tone: string;
  label: string;
}

function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  if (name === 'check') {
    return <Check className={cn('size-3', className)} strokeWidth={3} aria-hidden="true" />;
  }
  if (name === 'cross') {
    return <X className={cn('size-3', className)} strokeWidth={3} aria-hidden="true" />;
  }
  if (name === 'lock') {
    return <Lock className={cn('size-3', className)} strokeWidth={2.5} aria-hidden="true" />;
  }
  if (name === 'slash') {
    return (
      <span
        className={cn('relative block size-3 rounded-full border border-current', className)}
        aria-hidden="true"
      >
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
      </span>
    );
  }
  return (
    <span
      className={cn('block size-3 rounded-full border border-current', className)}
      aria-hidden="true"
    />
  );
}

function bubbleTone(
  variant: Variant,
  row: AnswerSheetRow,
  option: OptionIndex,
): BubbleTone {
  const isSelected = row.selected.includes(option);
  const isCorrect = row.correct?.includes(option) ?? false;
  if (row.excluded) return 'muted';
  if (variant === 'answering') {
    if (row.locked) return isSelected ? 'selected' : 'muted';
    return isSelected ? 'selected' : 'neutral';
  }
  if (variant === 'key') return isCorrect ? 'correct' : 'neutral';
  if (variant === 'selected') return isSelected ? 'selected' : 'neutral';
  if (row.outcome === 'unresolved') return isSelected ? 'muted' : 'neutral';
  if (isCorrect && isSelected) return 'correct';
  if (isCorrect) return 'correctOutline';
  if (isSelected) return 'incorrect';
  return 'neutral';
}

const BUBBLE_TONE_CLASS: Record<BubbleTone, string> = {
  neutral: 'border-border bg-surface text-muted-foreground',
  selected: 'border-primary bg-primary text-primary-foreground',
  correct: 'border-correct bg-correct text-white',
  correctOutline: 'border-correct bg-correct-bg text-correct',
  incorrect: 'border-incorrect bg-incorrect text-white',
  muted: 'border-border bg-secondary text-foreground/70',
};

export function AnswerSheet({
  rows,
  variant,
  onToggle,
  subtitle,
  action,
  embedded = false,
}: {
  rows: AnswerSheetRow[];
  variant: Variant;
  onToggle?: (questionId: string, option: OptionIndex) => void;
  subtitle?: string;
  action?: ReactNode;
  /** Drops the outer card and heading when the sheet sits inside another panel. */
  embedded?: boolean;
}) {
  const { t, locale } = useI18n();
  const rowsPerColumn = Math.min(40, Math.max(1, rows.length));

  const status = (row: AnswerSheetRow) => {
    if (row.excluded || row.outcome === 'excluded') {
      return { glyph: 'slash' as const, tone: 'text-muted-foreground', label: t('excludedLabel') };
    }
    if (variant === 'answering') {
      if (row.locked) {
        return {
          glyph: 'lock' as const,
          tone: 'text-muted-foreground',
          label: t('lockedLabel'),
        };
      }
      return row.selected.length > 0
        ? { glyph: 'check' as const, tone: 'text-primary', label: t('answered') }
        : { glyph: 'circle' as const, tone: 'text-muted-foreground', label: t('unansweredLabel') };
    }
    if (variant === 'key') {
      return row.unresolved
        ? {
            glyph: 'circle' as const,
            tone: 'text-muted-foreground',
            label: t('unresolvedLabel'),
          }
        : { glyph: 'check' as const, tone: 'text-correct', label: t('correctLabel') };
    }
    if (variant === 'selected') {
      return row.selected.length > 0
        ? { glyph: 'check' as const, tone: 'text-primary', label: t('answered') }
        : { glyph: 'circle' as const, tone: 'text-muted-foreground', label: t('unansweredLabel') };
    }
    if (row.outcome === 'correct') {
      return { glyph: 'check' as const, tone: 'text-correct', label: t('correctLabel') };
    }
    if (row.outcome === 'incorrect') {
      return { glyph: 'cross' as const, tone: 'text-incorrect', label: t('incorrectLabel') };
    }
    if (row.outcome === 'unresolved') {
      return {
        glyph: 'circle' as const,
        tone: 'text-muted-foreground',
        label: t('unresolvedLabel'),
      };
    }
    return { glyph: 'circle' as const, tone: 'text-muted-foreground', label: t('unansweredLabel') };
  };

  const legend: LegendItem[] =
    variant === 'review'
      ? [
          { glyph: 'circle', tone: 'text-muted-foreground', label: t('unansweredLabel') },
          { glyph: 'cross', tone: 'text-incorrect', label: t('incorrectLabel') },
          { glyph: 'check', tone: 'text-correct', label: t('correctLabel') },
          { glyph: 'slash', tone: 'text-muted-foreground', label: t('excludedLabel') },
        ]
      : variant === 'key'
        ? [
            { glyph: 'check', tone: 'text-correct', label: t('correctLabel') },
            { glyph: 'circle', tone: 'text-muted-foreground', label: t('unresolvedLabel') },
            { glyph: 'slash', tone: 'text-muted-foreground', label: t('excludedLabel') },
          ]
        : [
            { glyph: 'circle', tone: 'text-muted-foreground', label: t('unansweredLabel') },
            { glyph: 'check', tone: 'text-primary', label: t('answered') },
            { glyph: 'slash', tone: 'text-muted-foreground', label: t('excludedLabel') },
            ...(rows.some((row) => row.locked)
              ? [{ glyph: 'lock' as const, tone: 'text-muted-foreground', label: t('lockedLabel') }]
              : []),
          ];

  return (
    <section
      aria-label={t('answerSheetTitle')}
      className={
        embedded
          ? 'overflow-hidden'
          : 'overflow-hidden rounded-xl border border-border bg-surface shadow-soft'
      }
    >
      {!embedded && (
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-sm font-semibold sm:text-base">{t('answerSheetTitle')}</h2>
            {subtitle && (
              <span className="truncate text-[11px] text-muted-foreground">{subtitle}</span>
            )}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}

      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-background/40 px-4 py-2.5 sm:px-5">
        {legend.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn('flex size-4 items-center justify-center', item.tone)}>
              <Glyph name={item.glyph} />
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      <div dir="ltr" className="overflow-x-auto p-3 sm:p-5">
        <ul
          className="mx-auto grid w-max gap-x-3 gap-y-1"
          style={{
            gridTemplateRows: `repeat(${rowsPerColumn}, minmax(0, auto))`,
            gridAutoFlow: 'column',
          }}
        >
          {rows.map((row) => {
            const rowStatus = status(row);
            const isExcluded = row.excluded || row.outcome === 'excluded';
            const isLocked = Boolean(row.locked);
            const readOnly = isExcluded || isLocked;
            return (
              <li
                key={row.id}
                data-question-number={row.number}
                data-locked={isLocked ? 'true' : undefined}
                className={cn(
                  'flex h-9 w-[12.25rem] items-center gap-1.5 rounded-md px-1.5 transition-colors odd:bg-secondary/40 sm:h-10 sm:w-[13.5rem]',
                  variant === 'answering' && !readOnly && 'hover:bg-secondary/70',
                  isExcluded && 'opacity-60',
                  isLocked && 'opacity-55',
                )}
              >
                <span className="tnum w-7 shrink-0 text-center text-xs font-medium text-muted-foreground sm:w-8 sm:text-sm">
                  {formatNumber(row.number, locale)}
                </span>
                <div className="flex items-center gap-1">
                  {OPTION_INDICES.map((option) => {
                    const tone = bubbleTone(variant, row, option);
                    const isSelected = row.selected.includes(option);
                    const label = `${t('questionNumber', { n: row.number })} · ${t('optionLabel', {
                      n: option,
                    })}`;
                    const className = cn(
                      'tnum flex size-7 items-center justify-center rounded-full border text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 sm:size-8 sm:text-[13px]',
                      BUBBLE_TONE_CLASS[tone],
                      readOnly && 'cursor-not-allowed',
                    );
                    if (variant === 'answering' && onToggle) {
                      return (
                        <button
                          key={option}
                          type="button"
                          data-option={option}
                          aria-pressed={isSelected}
                          aria-label={label}
                          title={label}
                          disabled={readOnly}
                          onClick={() => onToggle(row.id, option)}
                          className={cn(
                            className,
                            tone === 'selected' && 'animate-pop-in',
                            !readOnly &&
                              tone === 'neutral' &&
                              'hover:border-primary/50 active:scale-90',
                          )}
                        >
                          {formatNumber(option, locale)}
                        </button>
                      );
                    }
                    return (
                      <span
                        key={option}
                        data-option={option}
                        aria-label={
                          (variant === 'key' || variant === 'selected') && isSelected
                            ? label
                            : undefined
                        }
                        className={className}
                      >
                        {formatNumber(option, locale)}
                      </span>
                    );
                  })}
                </div>
                <span
                  role="img"
                  aria-label={rowStatus.label}
                  title={rowStatus.label}
                  className={cn(
                    'ms-auto flex size-5 shrink-0 items-center justify-center',
                    rowStatus.tone,
                  )}
                >
                  <Glyph name={rowStatus.glyph} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
