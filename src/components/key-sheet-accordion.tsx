import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { AnswerSheet, type AnswerSheetRow } from '@/components/answer-sheet';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Collapsible panel for the key sheet. It starts closed so answers are not
 * spoiled, and also hosts editable keys when `children` is provided.
 */
export function KeySheetAccordion({
  rows,
  count,
  title,
  subtitle,
  closedHint,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
}: {
  rows?: AnswerSheetRow[];
  count?: number;
  title?: string;
  subtitle?: string;
  closedHint?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = open !== undefined;
  const expanded = controlled ? open : internalOpen;
  const panelId = useId();
  const total = count ?? rows?.length ?? 0;

  const setExpanded = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-200 hover:bg-secondary/50 active:bg-secondary/70 sm:px-5"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          {expanded ? (
            <Eye className="size-4" aria-hidden="true" />
          ) : (
            <EyeOff className="size-4" aria-hidden="true" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold sm:text-base">
            {title ?? t('answerSheetTitle')}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {expanded ? subtitle : (closedHint ?? t('keySheetHiddenHint'))}
          </span>
        </span>
        <Badge variant="outline" className="tnum hidden shrink-0 sm:inline-flex">
          {formatNumber(total, locale)} {t('questionCount')}
        </Badge>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id={panelId} className="animate-fade-up border-t border-border">
          {children ?? (rows ? <AnswerSheet rows={rows} variant="key" embedded /> : null)}
        </div>
      )}
    </div>
  );
}
