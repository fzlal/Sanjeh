import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardPaste,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { AnswerKey, Exam, Scheduling } from '@/types';
import { useI18n } from '@/i18n';
import type { MessageKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AnswerKeyEditor } from '@/components/answer-key-editor';
import { BookletEditor } from '@/components/booklet-editor';
import { KeySheetAccordion } from '@/components/key-sheet-accordion';
import { PdfGroupEditor } from '@/components/pdf-group-editor';
import { ImportDialog } from '@/features/import/import-dialog';
import { totalDurationMinutes, totalQuestionCount } from '@/lib/booklets';
import { defaultPdfTitle } from '@/lib/file';
import {
  formatDuration,
  formatNumber,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '@/lib/format';
import { validateSchedule } from '@/lib/scheduling';
import { saveExam } from '@/storage/db';
import { useToast } from '@/app/toast';

function schedulingForMode(mode: Scheduling['mode'], current: Scheduling): Scheduling {
  const fallbackStart = Date.now() + 60 * 60_000;
  const fallbackEnd = Date.now() + 3 * 60 * 60_000;
  if (mode === 'immediate') return { mode };
  if (mode === 'scheduled') {
    return { mode, startsAt: current.mode === 'scheduled' ? current.startsAt : fallbackStart };
  }
  if (mode === 'window') {
    return {
      mode,
      startsAt: current.mode === 'window' ? current.startsAt : fallbackStart,
      endsAt: current.mode === 'window' ? current.endsAt : fallbackEnd,
    };
  }
  return {
    mode: 'flexible',
    windowStart: current.mode === 'flexible' ? current.windowStart : fallbackStart,
    windowEnd: current.mode === 'flexible' ? current.windowEnd : fallbackEnd,
  };
}

const SCHEDULE_MODE_LABELS: Record<Scheduling['mode'], MessageKey> = {
  immediate: 'scheduleImmediate',
  scheduled: 'scheduleStart',
  window: 'scheduleWindow',
  flexible: 'scheduleFlexible',
};

/**
 * Exam settings, stored PDFs, and the answer-key preview. Question text is
 * never entered, imported, or displayed; the QZ1 answer key defines questions.
 */
export function ExamEditor({
  exam,
  onDone,
  onCancel,
}: {
  exam: Exam;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t, dir, locale } = useI18n();
  const { notify } = useToast();
  const [draft, setDraft] = useState<Exam>(() => structuredClone(exam));
  const [errors, setErrors] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const totalDuration = useMemo(
    () => totalDurationMinutes(draft.booklets),
    [draft.booklets],
  );
  const assignedQuestions = totalQuestionCount(draft.booklets);
  const schedule = useMemo(
    () => validateSchedule(draft.scheduling, totalDuration),
    [draft.scheduling, totalDuration],
  );

  const unresolvedCount = draft.questions.filter(
    (question) => question.key.kind === 'unresolved',
  ).length;
  const excludedCount = draft.questions.filter(
    (question) => question.key.kind === 'excluded',
  ).length;

  const patch = (changes: Partial<Exam>) => {
    setDraft((current) => ({ ...current, ...changes }));
  };

  const updateKey = (questionId: string, key: AnswerKey) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === questionId ? { ...question, key } : question,
      ),
    }));
  };

  const handleSave = async () => {
    const title = draft.title.trim();
    const booklets = draft.booklets.map((booklet, index) => ({
      ...booklet,
      title:
        booklet.title.trim() ||
        t('bookletN', { n: formatNumber(index + 1, locale) }),
      pdfs: booklet.pdfs.map((pdf) => ({
        ...pdf,
        title: pdf.title.trim() || defaultPdfTitle(pdf.name),
      })),
    }));
    const answerPdfs = draft.answerPdfs.map((pdf) => ({
      ...pdf,
      title: pdf.title.trim() || defaultPdfTitle(pdf.name),
    }));
    const nextErrors: string[] = [];
    if (!title) nextErrors.push(t('validationTitle'));
    if (booklets.length === 0) nextErrors.push(t('validationBooklets'));
    if (booklets.some((booklet) => booklet.pdfs.length === 0)) {
      nextErrors.push(t('validationBookletPdf'));
    }
    if (booklets.some((booklet) => booklet.questionCount < 1)) {
      nextErrors.push(t('validationBookletQuestionCount'));
    }
    if (assignedQuestions !== draft.questions.length) {
      nextErrors.push(
        t('validationBookletCounts', {
          total: formatNumber(draft.questions.length, locale),
          assigned: formatNumber(assignedQuestions, locale),
        }),
      );
    }
    if (booklets.some((booklet) => !Number.isInteger(booklet.durationMinutes) || booklet.durationMinutes < 0)) {
      nextErrors.push(t('validationBookletDuration'));
    }
    if (answerPdfs.length === 0) nextErrors.push(t('validationAnswerPdf'));
    if (unresolvedCount > 0) {
      nextErrors.push(
        t('validationUnresolved', { count: formatNumber(unresolvedCount, locale) }),
      );
      setSheetOpen(true);
    }
    if (schedule.errors.length > 0) {
      nextErrors.push(...new Set(schedule.errors.map((issue) => t(issueKey(issue.code)))));
    }
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await saveExam({
        ...draft,
        title,
        description: draft.description?.trim() ?? '',
        booklets,
        answerPdfs,
        updatedAt: Date.now(),
      });
      onDone();
    } catch {
      notify(t('storageUnavailable'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyImport = (tokens: AnswerKey[]) => {
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, index) => ({
        ...question,
        key: tokens[index] ?? question.key,
      })),
    }));
    notify(t('importSuccess'));
  };

  const timeValue = (value: number) => (Number.isFinite(value) ? toDateTimeLocalValue(value) : '');

  return (
    <div className="page-container pb-24 pt-6 sm:pt-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <BackIcon className="size-4" aria-hidden="true" />
            {t('back')}
          </Button>
          <span className="text-sm text-muted-foreground">{t('editExam')}</span>
        </div>
        <Button onClick={() => void handleSave()} disabled={saving}>
          <Save className="size-4" aria-hidden="true" />
          {t('saveExam')}
        </Button>
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-incorrect-border bg-incorrect-bg px-4 py-3 text-sm text-incorrect"
        >
          <ul className="list-inside list-disc space-y-1">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="stagger flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('examDetails')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="exam-title">{t('examTitle')}</Label>
                <Input
                  id="exam-title"
                  value={draft.title}
                  placeholder={t('examTitlePlaceholder')}
                  onChange={(event) => patch({ title: event.target.value })}
                  maxLength={300}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="exam-description">
                  {t('examDescription')}{' '}
                  <span className="text-muted-foreground">({t('optional')})</span>
                </Label>
                <Textarea
                  id="exam-description"
                  value={draft.description ?? ''}
                  placeholder={t('examDescriptionPlaceholder')}
                  onChange={(event) => patch({ description: event.target.value })}
                  rows={2}
                  maxLength={4000}
                />
              </div>
            </CardContent>
          </Card>

          <section aria-labelledby="pdfs-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="pdfs-heading" className="text-lg font-semibold">
                {t('pdfFiles')}
              </h2>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                {t('pdfStoredNote')}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t('noTextNote')}</p>

            <BookletEditor
              booklets={draft.booklets}
              onChange={(booklets) => patch({ booklets })}
              totalQuestions={draft.questions.length}
            />

            <PdfGroupEditor
              title={t('answerBooklet')}
              hint={t('answerBookletHint')}
              icon={<BookOpen className="size-5" aria-hidden="true" />}
              pdfs={draft.answerPdfs}
              onChange={(answerPdfs) => patch({ answerPdfs })}
            />
          </section>

          <section aria-labelledby="questions-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h2 id="questions-heading" className="text-lg font-semibold">
                  {t('questionsSection')}
                </h2>
                <span className="tnum text-sm text-muted-foreground">
                  {formatNumber(draft.questions.length, locale)}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <ClipboardPaste className="size-4" aria-hidden="true" />
                {t('importKeyButton')}
              </Button>
            </div>

            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {t('questionsFromKey')}
            </p>

            {(unresolvedCount > 0 || excludedCount > 0) && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {unresolvedCount > 0 && (
                  <span className="text-unanswered">
                    {t('unresolvedLabel')} · {formatNumber(unresolvedCount, locale)}
                  </span>
                )}
                {excludedCount > 0 && (
                  <span className="text-excluded">
                    {t('excludedLabel')} · {formatNumber(excludedCount, locale)}
                  </span>
                )}
              </div>
            )}

            {unresolvedCount > 0 && (
              <div
                role="alert"
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-unanswered-border bg-unanswered-bg px-3 py-2 text-xs leading-relaxed text-unanswered"
              >
                <span className="flex items-start gap-1.5">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {t('mustResolveUnresolved', {
                    count: formatNumber(unresolvedCount, locale),
                  })}
                </span>
                <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
                  {t('openKeyEditor')}
                </Button>
              </div>
            )}

            <KeySheetAccordion
              count={draft.questions.length}
              subtitle={t('keyPreviewSubtitle')}
              open={sheetOpen}
              onOpenChange={setSheetOpen}
            >
              <div className="flex flex-col gap-2 border-b border-border bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground sm:px-4">
                {t('keyEditorHint')}
                <span className="flex items-start gap-1.5 text-unanswered">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {t('aiFallibleNote')}
                </span>
              </div>
              <AnswerKeyEditor
                items={draft.questions.map((question) => ({
                  id: question.id,
                  key: question.key,
                }))}
                onChange={updateKey}
              />
            </KeySheetAccordion>
          </section>
        </div>

        <aside className="stagger flex flex-col gap-4 lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle>{t('scheduling')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="schedule-mode">{t('scheduling')}</Label>
                <Select
                  value={draft.scheduling.mode}
                  onValueChange={(value) =>
                    patch({
                      scheduling: schedulingForMode(
                        value as Scheduling['mode'],
                        draft.scheduling,
                      ),
                    })
                  }
                >
                  <SelectTrigger id="schedule-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SCHEDULE_MODE_LABELS) as Scheduling['mode'][]).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {t(SCHEDULE_MODE_LABELS[mode])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {draft.scheduling.mode !== 'immediate' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="schedule-start">
                      {draft.scheduling.mode === 'scheduled' || draft.scheduling.mode === 'window'
                        ? t('startsAt')
                        : t('windowStart')}
                    </Label>
                    <Input
                      id="schedule-start"
                      type="datetime-local"
                      value={timeValue(
                        draft.scheduling.mode === 'flexible'
                          ? draft.scheduling.windowStart
                          : draft.scheduling.startsAt,
                      )}
                      onChange={(event) => {
                        const value = fromDateTimeLocalValue(event.target.value);
                        const timestamp = value ?? Number.NaN;
                        if (draft.scheduling.mode === 'scheduled') {
                          patch({ scheduling: { mode: 'scheduled', startsAt: timestamp } });
                        } else if (draft.scheduling.mode === 'window') {
                          patch({
                            scheduling: {
                              mode: 'window',
                              startsAt: timestamp,
                              endsAt: draft.scheduling.endsAt,
                            },
                          });
                        } else if (draft.scheduling.mode === 'flexible') {
                          patch({
                            scheduling: {
                              mode: 'flexible',
                              windowStart: timestamp,
                              windowEnd: draft.scheduling.windowEnd,
                            },
                          });
                        }
                      }}
                    />
                  </div>
                  {draft.scheduling.mode !== 'scheduled' && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="schedule-end">
                        {draft.scheduling.mode === 'window' ? t('endsAt') : t('windowEnd')}
                      </Label>
                      <Input
                        id="schedule-end"
                        type="datetime-local"
                        value={timeValue(
                          draft.scheduling.mode === 'window'
                            ? draft.scheduling.endsAt
                            : draft.scheduling.mode === 'flexible'
                              ? draft.scheduling.windowEnd
                              : Number.NaN,
                        )}
                        onChange={(event) => {
                          const value = fromDateTimeLocalValue(event.target.value);
                          const timestamp = value ?? Number.NaN;
                          if (draft.scheduling.mode === 'window') {
                            patch({
                              scheduling: {
                                mode: 'window',
                                startsAt: draft.scheduling.startsAt,
                                endsAt: timestamp,
                              },
                            });
                          } else if (draft.scheduling.mode === 'flexible') {
                            patch({
                              scheduling: {
                                mode: 'flexible',
                                windowStart: draft.scheduling.windowStart,
                                windowEnd: timestamp,
                              },
                            });
                          }
                        }}
                      />
                    </div>
                  )}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t('localTimeNote')}
                  </p>
                </div>
              )}

              {schedule.errors.map((issue) => (
                <p key={issue.code} className="text-xs text-incorrect" role="alert">
                  {t(issueKey(issue.code))}
                </p>
              ))}
              {schedule.warnings.map((issue) => (
                <p key={issue.code} className="text-xs text-warning">
                  {t(issueKey(issue.code))}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('booklets')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t('booklets')}</span>
                <span className="tnum font-medium">
                  {formatNumber(draft.booklets.length, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t('questionCount')}</span>
                <span className="tnum font-medium">
                  {formatNumber(assignedQuestions, locale)} /{' '}
                  {formatNumber(draft.questions.length, locale)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t('totalDurationLabel')}</span>
                <span className="tnum font-medium">
                  {totalDuration > 0
                    ? formatDuration(totalDuration * 60_000, locale)
                    : t('untimed')}
                </span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        questions={draft.questions}
        onApply={applyImport}
      />
    </div>
  );
}

function issueKey(code: ReturnType<typeof validateSchedule>['errors'][number]['code']): MessageKey {
  switch (code) {
    case 'invalidDuration':
      return 'invalidDuration';
    case 'invalidStart':
      return 'invalidStart';
    case 'invalidEnd':
      return 'invalidEnd';
    case 'endBeforeStart':
      return 'endBeforeStart';
    case 'durationExceedsWindow':
      return 'durationExceedsWindow';
    default:
      return 'genericError';
  }
}
