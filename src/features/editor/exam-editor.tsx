import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardPaste,
  EyeOff,
  KeyRound,
  PenLine,
  Save,
  ShieldAlert,
} from 'lucide-react';
import type { AnswerKey, Exam } from '@/types';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnswerKeyEditor } from '@/components/answer-key-editor';
import { BookletEditor } from '@/components/booklet-editor';
import { KeySheetAccordion } from '@/components/key-sheet-accordion';
import { PdfGroupEditor } from '@/components/pdf-group-editor';
import { SchedulingEditor, scheduleIssueKey } from '@/components/scheduling-editor';
import { ImportDialog } from '@/features/import/import-dialog';
import { totalDurationMinutes, totalQuestionCount } from '@/lib/booklets';
import { defaultPdfTitle } from '@/lib/file';
import { formatNumber } from '@/lib/format';
import { createId } from '@/lib/id';
import { validateSchedule } from '@/lib/scheduling';
import { StorageError, saveExam } from '@/storage/db';
import { useToast } from '@/app/toast';

/**
 * Exam settings, stored PDFs, and the answer-key preview. Question text is
 * never entered, imported, or displayed; the question count comes from the QZ1
 * key or from the booklets, depending on the exam's answer-key mode.
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
  const keyMode = draft.answerKeyMode;
  const keyModeLabel =
    keyMode === 'qz1'
      ? t('keyModeQz1')
      : keyMode === 'manual'
        ? t('keyModeManual')
        : t('keyModeNone');
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

  const changeBooklets = (booklets: Exam['booklets']) => {
    setDraft((current) => {
      if (current.answerKeyMode === 'qz1') return { ...current, booklets };
      const nextCount = totalQuestionCount(booklets);
      return {
        ...current,
        booklets,
        questions: Array.from(
          { length: nextCount },
          (_, index) =>
            current.questions[index] ?? {
              id: createId(),
              key: { kind: 'unresolved' as const },
            },
        ),
      };
    });
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
    if (keyMode !== 'none' && unresolvedCount > 0) {
      nextErrors.push(
        t('validationUnresolved', { count: formatNumber(unresolvedCount, locale) }),
      );
      setSheetOpen(true);
    }
    if (schedule.errors.length > 0) {
      nextErrors.push(...new Set(schedule.errors.map((issue) => t(scheduleIssueKey(issue.code)))));
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
    } catch (error) {
      notify(
        error instanceof StorageError && error.code === 'pdfImmutable'
          ? t('pdfImmutableError')
          : t('storageUnavailable'),
        'error',
      );
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
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3.5" aria-hidden="true" />
                {t('answerKeyMode')}:
                <span className="font-medium text-foreground">{keyModeLabel}</span>
              </p>
            </CardContent>
          </Card>

          <section aria-labelledby="pdfs-heading" className="flex flex-col gap-3">
            <h2 id="pdfs-heading" className="text-lg font-semibold">
              {t('pdfFiles')}
            </h2>

            <BookletEditor
              booklets={draft.booklets}
              onChange={changeBooklets}
              totalQuestions={draft.questions.length}
            />

            {keyMode !== 'none' && (
              <PdfGroupEditor
                title={t('answerBooklet')}
                hint={
                  keyMode === 'manual'
                    ? t('answerBookletManualHint')
                    : t('answerBookletHint')
                }
                icon={<BookOpen className="size-5" aria-hidden="true" />}
                pdfs={draft.answerPdfs}
                onChange={(answerPdfs) => patch({ answerPdfs })}
              />
            )}
          </section>

          {keyMode === 'none' ? (
            <Card>
              <CardContent className="flex flex-wrap items-start gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                  <EyeOff className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold">{t('keyModeNone')}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t('noKeyExamNote')}
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm text-muted-foreground">
                  {formatNumber(draft.questions.length, locale)} {t('questionCount')}
                </span>
              </CardContent>
            </Card>
          ) : (
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
                {keyMode === 'qz1' && (
                  <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                    <ClipboardPaste className="size-4" aria-hidden="true" />
                    {t('importKeyButton')}
                  </Button>
                )}
              </div>

              {keyMode === 'manual' && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('manualKeyDesc')}
                </p>
              )}

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
                title={keyMode === 'manual' ? t('manualKeyTitle') : undefined}
                subtitle={
                  keyMode === 'manual'
                    ? t('manualKeyPreviewSubtitle')
                    : t('keyPreviewSubtitle')
                }
                open={sheetOpen}
                onOpenChange={setSheetOpen}
              >
                {keyMode === 'qz1' ? (
                  <div className="flex items-start gap-1.5 border-b border-border bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-unanswered sm:px-4">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {t('aiFallibleNote')}
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5 border-b border-border bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground sm:px-4">
                    <PenLine className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {t('manualKeyEditorHint')}
                  </div>
                )}
                <AnswerKeyEditor
                  items={draft.questions.map((question) => ({
                    id: question.id,
                    key: question.key,
                  }))}
                  onChange={updateKey}
                  single={keyMode === 'manual'}
                />
              </KeySheetAccordion>
            </section>
          )}
        </div>

        <aside className="stagger flex flex-col gap-4 lg:sticky lg:top-20">
          <SchedulingEditor
            scheduling={draft.scheduling}
            durationMinutes={totalDuration}
            onChange={(scheduling) => patch({ scheduling })}
          />
        </aside>
      </div>

      {keyMode === 'qz1' && (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          questions={draft.questions}
          onApply={applyImport}
        />
      )}
    </div>
  );
}
