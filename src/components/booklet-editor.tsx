import { AlertCircle, CheckCircle2, FileText, Plus, Trash2 } from 'lucide-react';
import type { StoredPdf } from '@/types';
import { bookletRanges, totalQuestionCount } from '@/lib/booklets';
import { createId } from '@/lib/id';
import { formatNumber } from '@/lib/format';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PdfGroupEditor } from '@/components/pdf-group-editor';
import { cn } from '@/lib/utils';

export interface BookletDraft {
  id: string;
  title: string;
  pdfs: StoredPdf[];
  questionCount: number;
  durationMinutes: number;
}

export function createBookletDraft(): BookletDraft {
  return { id: createId(), title: '', pdfs: [], questionCount: 0, durationMinutes: 0 };
}

/** Ordered booklet cards: files, question count, and duration for each one. */
export function BookletEditor({
  booklets,
  onChange,
  totalQuestions,
}: {
  booklets: BookletDraft[];
  onChange: (booklets: BookletDraft[]) => void;
  totalQuestions: number;
}) {
  const { t, locale } = useI18n();
  const ranges = bookletRanges(booklets);
  const assigned = totalQuestionCount(booklets);
  const knownTotal = totalQuestions > 0;
  const matches = knownTotal && assigned === totalQuestions;

  const update = (id: string, changes: Partial<BookletDraft>) => {
    onChange(booklets.map((booklet) => (booklet.id === id ? { ...booklet, ...changes } : booklet)));
  };

  const remove = (id: string) => {
    onChange(booklets.filter((booklet) => booklet.id !== id));
  };

  const add = () => {
    onChange([...booklets, createBookletDraft()]);
  };

  const clampCount = (raw: string) => {
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  };

  return (
    <div className="flex flex-col gap-3" data-booklets>
      {booklets.map((booklet, index) => {
        const range = ranges[index];
        return (
          <section
            key={booklet.id}
            data-booklet={index}
            className="animate-fade-up rounded-xl border border-border bg-surface p-4 sm:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold text-muted-foreground">
                  {formatNumber(index + 1, locale)}
                </span>
                <Input
                  value={booklet.title}
                  onChange={(event) => update(booklet.id, { title: event.target.value })}
                  placeholder={t('bookletN', { n: formatNumber(index + 1, locale) })}
                  aria-label={t('bookletTitle')}
                  maxLength={300}
                  className="h-9 min-w-0 flex-1"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('removeBooklet')}
                title={t('removeBooklet')}
                disabled={booklets.length === 1}
                onClick={() => remove(booklet.id)}
              >
                <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`booklet-questions-${booklet.id}`}>
                  {t('bookletQuestionCount')}
                </Label>
                <Input
                  id={`booklet-questions-${booklet.id}`}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={booklet.questionCount}
                  onChange={(event) =>
                    update(booklet.id, { questionCount: clampCount(event.target.value) })
                  }
                  className="tnum"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`booklet-duration-${booklet.id}`}>{t('bookletDuration')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`booklet-duration-${booklet.id}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={booklet.durationMinutes}
                    onChange={(event) =>
                      update(booklet.id, { durationMinutes: clampCount(event.target.value) })
                    }
                    className="tnum"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('minutesShort')}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              {range && range.count > 0
                ? t('bookletRange', {
                    from: formatNumber(range.startQuestion, locale),
                    to: formatNumber(range.endQuestion, locale),
                  })
                : t('bookletTotals', {
                    assigned: formatNumber(0, locale),
                    expected: knownTotal ? formatNumber(totalQuestions, locale) : '—',
                  })}
            </p>

            <div className="mt-3">
              <PdfGroupEditor
                embedded
                title={t('bookletPdfs')}
                hint={t('bookletFilesHint')}
                icon={<FileText className="size-5" aria-hidden="true" />}
                pdfs={booklet.pdfs}
                onChange={(pdfs) => update(booklet.id, { pdfs })}
              />
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" aria-hidden="true" />
          {t('addBooklet')}
        </Button>
        <span
          data-booklet-totals
          role={knownTotal && !matches ? 'alert' : undefined}
          className={cn(
            'flex items-center gap-1.5 text-xs',
            knownTotal && !matches ? 'text-incorrect' : 'text-muted-foreground',
          )}
        >
          {knownTotal && matches ? (
            <CheckCircle2 className="size-3.5 shrink-0 text-correct" aria-hidden="true" />
          ) : (
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          )}
          {knownTotal
            ? matches
              ? t('bookletTotalsOk', { count: formatNumber(totalQuestions, locale) })
              : t('bookletTotalsMismatch', {
                  assigned: formatNumber(assigned, locale),
                  expected: formatNumber(totalQuestions, locale),
                })
            : t('bookletTotals', { assigned: formatNumber(assigned, locale), expected: '—' })}
        </span>
      </div>
    </div>
  );
}
