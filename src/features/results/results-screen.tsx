import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { AnswerKey, Exam, ExamSession, QuestionOutcome } from '@/types';
import { useI18n } from '@/i18n';
import { useToast } from '@/app/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AnswerSheet, type AnswerSheetRow } from '@/components/answer-sheet';
import { AnswerKeyEditor } from '@/components/answer-key-editor';
import { KeySheetAccordion } from '@/components/key-sheet-accordion';
import { PdfDownloadButton } from '@/components/pdf-download-button';
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
} from '@/lib/format';
import { scoreExam } from '@/lib/scoring';
import { getExam, getSession, saveExam, saveSession } from '@/storage/db';
import { cn } from '@/lib/utils';

export function ResultsScreen({
  sessionId,
  exam,
  fallbackSession,
  onBack,
  onSessionUpdated,
}: {
  sessionId: string;
  exam?: Exam;
  fallbackSession?: ExamSession;
  onBack: () => void;
  onSessionUpdated?: () => void;
}) {
  const { t, locale, dir } = useI18n();
  const { notify } = useToast();
  const [session, setSession] = useState<ExamSession | null>(fallbackSession ?? null);
  const [loading, setLoading] = useState(!fallbackSession);

  useEffect(() => {
    if (fallbackSession) return;
    let cancelled = false;
    getSession(sessionId)
      .then((stored) => {
        if (!cancelled) setSession(stored ?? null);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, fallbackSession]);

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  const persistKeyChange = async (next: ExamSession, questionId: string, key: AnswerKey) => {
    try {
      const storedExam = await getExam(next.examId);
      if (storedExam) {
        // saveExam re-scores every attempt for this exam, not just this one.
        await saveExam({
          ...storedExam,
          questions: storedExam.questions.map((question) =>
            question.id === questionId ? { ...question, key } : question,
          ),
          updatedAt: Date.now(),
        });
      } else {
        await saveSession(next);
      }
      onSessionUpdated?.();
    } catch {
      notify(t('storageUnavailable'), 'error');
    }
  };

  /** Correcting a key after the attempt re-scores the stored session. */
  const updateKey = (questionId: string, key: AnswerKey) => {
    if (!session?.result) return;
    const questions = session.exam.questions.map((question) =>
      question.id === questionId ? { ...question, key } : question,
    );
    const result = scoreExam({ questions }, session.responses, session.result.completedAt);
    const next: ExamSession = { ...session, exam: { ...session.exam, questions }, result };
    setSession(next);
    void persistKeyChange(next, questionId, key);
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  if (!session || !session.result) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <Button variant="outline" onClick={onBack}>
          {t('backToDashboard')}
        </Button>
      </div>
    );
  }

  const result = session.result;
  const keyless = session.exam.answerKeyMode === 'none';
  const timeUsed =
    session.submittedAt !== undefined ? session.submittedAt - session.startedAt : null;
  const reviewById = new Map(result.perQuestion.map((item) => [item.questionId, item]));
  const rows: AnswerSheetRow[] = session.exam.questions.map((question, index) => {
    if (keyless) {
      return {
        id: question.id,
        number: index + 1,
        selected: reviewById.get(question.id)?.selected ?? [],
        correct: null,
      };
    }
    const review = reviewById.get(question.id);
    const outcome: QuestionOutcome | undefined = review?.outcome;
    return {
      id: question.id,
      number: index + 1,
      selected: review?.selected ?? [],
      correct: review?.correct ?? null,
      excluded: outcome === 'excluded',
      unresolved: outcome === 'unresolved',
      outcome,
    };
  });
  const answeredCount = rows.filter((row) => row.selected.length > 0).length;

  const stats = keyless
    ? [
        { label: t('answered'), value: answeredCount, tone: 'text-primary' },
        {
          label: t('unansweredLabel'),
          value: result.totalQuestions - answeredCount,
          tone: 'text-muted-foreground',
        },
        { label: t('totalLabel'), value: result.totalQuestions, tone: 'text-foreground' },
      ]
    : [
        { label: t('correctLabel'), value: result.correct, tone: 'text-correct' },
        { label: t('incorrectLabel'), value: result.incorrect, tone: 'text-incorrect' },
        { label: t('unansweredLabel'), value: result.unanswered, tone: 'text-unanswered' },
        { label: t('excludedLabel'), value: result.excluded, tone: 'text-excluded' },
        { label: t('unresolvedLabel'), value: result.unresolved, tone: 'text-muted-foreground' },
        { label: t('totalLabel'), value: result.totalQuestions, tone: 'text-foreground' },
      ];

  const takenAt = formatDateTime(result.completedAt, locale);

  return (
    <div className="page-container pb-16 pt-6 sm:pt-9">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <BackIcon className="size-4" aria-hidden="true" />
          {t('backToDashboard')}
        </Button>
        <h1 className="text-sm font-medium text-muted-foreground">{t('resultsTitle')}</h1>
      </div>

      <Card className="animate-rise-in mb-6 overflow-hidden">
        <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:items-start sm:p-7">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t('reportCard')}
              </span>
              <h2 className="text-xl font-semibold sm:text-2xl">
                {session.exam.title || t('untitled')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('takenAt', { date: takenAt })}
              </p>
              {timeUsed !== null && (
                <p className="text-xs text-muted-foreground">
                  {t('timeUsed', { duration: formatDuration(Math.max(0, timeUsed), locale) })}
                </p>
              )}
            </div>

            {exam && exam.booklets.some((booklet) => booklet.pdfs.length > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                <PdfDownloadButton
                  pdfs={exam.booklets.flatMap((booklet) => booklet.pdfs)}
                  label={t('downloadExamPdf')}
                />
              </div>
            )}
          </div>

          {keyless ? (
            <div className="flex flex-col items-start sm:items-end">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t('scoreLabel')}
              </span>
              <span className="tnum text-2xl font-semibold leading-tight text-muted-foreground sm:text-3xl">
                {t('noScoreShort')}
              </span>
              <span className="tnum text-xs text-muted-foreground">
                {t('answered')} · {formatNumber(answeredCount, locale)} /{' '}
                {formatNumber(result.totalQuestions, locale)}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-start sm:items-end">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {t('scoreLabel')}
              </span>
              <span
                className={cn(
                  'animate-pop-in tnum text-4xl font-semibold leading-tight sm:text-5xl',
                  result.percentage !== null && result.percentage < 0
                    ? 'text-incorrect'
                    : 'text-primary',
                )}
              >
                {formatPercent(result.percentage, locale)}
              </span>
              <span className="tnum text-xs text-muted-foreground">
                {formatNumber(result.correct, locale)} /{' '}
                {formatNumber(result.scoredQuestions, locale)}
              </span>
            </div>
          )}
        </div>
        <p className="border-t border-border bg-background/60 px-5 py-3 text-[11px] leading-relaxed text-muted-foreground sm:px-7">
          {keyless
            ? t('noKeyResultsNote')
            : t('denominatorNote', {
                scored: formatNumber(result.scoredQuestions, locale),
                total: formatNumber(result.totalQuestions, locale),
              })}
        </p>
      </Card>

      <div
        className={cn(
          'stagger mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3',
          !keyless && 'lg:grid-cols-6',
        )}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-surface px-3.5 py-3"
          >
            <span className="text-[11px] text-muted-foreground">{stat.label}</span>
            <p className={cn('tnum mt-1 text-xl font-semibold', stat.tone)}>
              {formatNumber(stat.value, locale)}
            </p>
          </div>
        ))}
      </div>

      <AnswerSheet
        rows={rows}
        variant={keyless ? 'selected' : 'review'}
        subtitle={t('answerSheetExam', { date: takenAt })}
        action={
          exam && exam.answerPdfs.length > 0 ? (
            <PdfDownloadButton
              pdfs={exam.answerPdfs}
              label={t('downloadAnswerPdf')}
            />
          ) : undefined
        }
      />

      {!keyless && (
        <div className="mt-6">
          <KeySheetAccordion
            count={session.exam.questions.length}
            title={t('editKeyTitle')}
            subtitle={t('editKeyHint')}
            closedHint={t('editKeyClosedHint')}
          >
            <AnswerKeyEditor
              items={session.exam.questions.map((question) => ({
                id: question.id,
                key: question.key,
              }))}
              onChange={updateKey}
              single={session.exam.answerKeyMode === 'manual'}
            />
          </KeySheetAccordion>
        </div>
      )}
    </div>
  );
}
