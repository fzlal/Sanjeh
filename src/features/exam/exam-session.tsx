import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Flag, LogOut, Send } from 'lucide-react';
import type { Booklet, ExamSession, OptionIndex } from '@/types';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AnswerSheet, type AnswerSheetRow } from '@/components/answer-sheet';
import { PdfDownloadButton } from '@/components/pdf-download-button';
import { bookletRanges } from '@/lib/booklets';
import { formatClock, formatNumber } from '@/lib/format';
import {
  advanceBooklet,
  answeredCount,
  answeredInBookletCount,
  currentBookletRange,
  isLastBooklet,
  responseFor,
  syncBookletProgress,
  toggleResponse,
} from '@/lib/session';
import { scoreExam } from '@/lib/scoring';
import { getExam, getSession, saveSession } from '@/storage/db';
import { useToast } from '@/app/toast';
import { cn } from '@/lib/utils';

export function ExamSessionScreen({
  sessionId,
  onExit,
  onSubmitted,
}: {
  sessionId: string;
  onExit: () => void;
  onSubmitted: (session: ExamSession) => void;
}) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const [session, setSession] = useState<ExamSession | null>(null);
  const [examBooklets, setExamBooklets] = useState<Booklet[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [finishBookletOpen, setFinishBookletOpen] = useState(false);

  const sessionRef = useRef<ExamSession | null>(null);
  const submittedRef = useRef(false);
  const persistChain = useRef<Promise<void>>(Promise.resolve());

  const apply = useCallback((next: ExamSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const queuePersist = useCallback(
    (next: ExamSession) => {
      persistChain.current = persistChain.current
        .catch(() => undefined)
        .then(() => saveSession(next))
        .catch(() => notify(t('storageUnavailable'), 'error'));
    },
    [notify, t],
  );

  useEffect(() => {
    let cancelled = false;
    getSession(sessionId)
      .then((stored) => {
        if (cancelled) return;
        if (!stored) {
          setNotFound(true);
          return;
        }
        if (stored.status === 'submitted') {
          onSubmitted(stored);
          return;
        }
        sessionRef.current = stored;
        setSession(stored);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, onSubmitted]);

  const examId = session?.examId;
  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    getExam(examId)
      .then((exam) => {
        if (!cancelled) setExamBooklets(exam?.booklets ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const finish = useCallback(
    async (auto: boolean) => {
      const current = sessionRef.current;
      if (!current || current.status !== 'active' || submittedRef.current) return;
      submittedRef.current = true;
      await persistChain.current.catch(() => undefined);
      const submittedAt = Date.now();
      const submitted: ExamSession = {
        ...current,
        status: 'submitted',
        submittedAt,
        result: scoreExam(current.exam, current.responses, submittedAt),
      };
      try {
        await saveSession(submitted);
      } catch {
        notify(t('storageUnavailable'), 'error');
      }
      if (auto) notify(t('timeUpTitle'));
      onSubmitted(submitted);
    },
    [notify, onSubmitted, t],
  );

  useEffect(() => {
    const latest = sessionRef.current;
    if (!latest || latest.status !== 'active') return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const active = sessionRef.current;
      if (!active || active.status !== 'active') return;
      const progress = syncBookletProgress(active, current);
      if (progress.changed) {
        apply(progress.session);
        queuePersist(progress.session);
        if (!progress.completed) notify(t('bookletAdvanced'));
      }
      if (progress.completed) void finish(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session?.status, apply, queuePersist, notify, t, finish]);

  useEffect(() => {
    if (session?.status !== 'active') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session?.status]);

  const rows = useMemo<AnswerSheetRow[]>(() => {
    if (!session) return [];
    const ranges = bookletRanges(session.exam.booklets);
    const active = ranges[session.bookletIndex];
    return session.exam.questions.map((question, index) => ({
      id: question.id,
      number: index + 1,
      selected: responseFor(session, question.id),
      correct: null,
      excluded: question.key.kind === 'excluded',
      unresolved: question.key.kind === 'unresolved',
      locked: !active || index < active.startIndex || index >= active.endIndex,
    }));
  }, [session]);

  const total = session?.exam.questions.length ?? 0;
  const answered = session ? answeredCount(session) : 0;
  const answeredHere = session ? answeredInBookletCount(session) : 0;
  const remaining =
    session?.bookletEndsAt != null ? Math.max(0, session.bookletEndsAt - now) : null;
  const critical = remaining !== null && remaining <= 60_000;
  const low = remaining !== null && remaining <= 5 * 60_000;

  const currentBooklet = session?.exam.booklets[session.bookletIndex];
  const currentRange = session ? currentBookletRange(session) : undefined;
  const bookletProgress =
    currentRange && currentRange.count > 0
      ? Math.round((answeredHere / currentRange.count) * 100)
      : 0;
  const bookletTotal = session?.exam.booklets.length ?? 0;
  const lastBooklet = session ? isLastBooklet(session) : false;
  const currentPdfs =
    examBooklets.find((booklet) => booklet.id === currentBooklet?.id)?.pdfs ??
    examBooklets[session?.bookletIndex ?? 0]?.pdfs ??
    [];

  const toggle = useCallback(
    (questionId: string, option: OptionIndex) => {
      const latest = sessionRef.current;
      if (!latest || latest.status !== 'active') return;
      if (latest.bookletEndsAt !== null && Date.now() >= latest.bookletEndsAt) return;
      const question = latest.exam.questions.find((entry) => entry.id === questionId);
      if (!question || question.key.kind === 'excluded') return;
      const next = toggleResponse(latest, questionId, option);
      if (next === latest) return;
      apply(next);
      queuePersist(next);
    },
    [apply, queuePersist],
  );

  const finishCurrentBooklet = useCallback(() => {
    const latest = sessionRef.current;
    if (!latest || latest.status !== 'active') return;
    const current = Date.now();
    const progress = syncBookletProgress(latest, current);
    if (progress.completed) {
      setFinishBookletOpen(false);
      void finish(true);
      return;
    }
    if (progress.changed) {
      apply(progress.session);
      queuePersist(progress.session);
    }
    const advanced = advanceBooklet(progress.session, current);
    setFinishBookletOpen(false);
    if (advanced.completed) {
      void finish(false);
      return;
    }
    apply(advanced.session);
    queuePersist(advanced.session);
    setNow(current);
  }, [apply, queuePersist, finish]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
        <Button variant="outline" onClick={onExit}>
          {t('backToDashboard')}
        </Button>
      </div>
    );
  }

  const bookletNumber = session.bookletIndex + 1;
  const bookletTitle = currentBooklet?.title || t('bookletN', { n: bookletNumber });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass-bar sticky top-0 z-30 border-b">
        <div className="page-container flex min-h-14 items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('leave')}
              title={t('leave')}
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut className="size-4" aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {session.exam.title || t('untitled')}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {t('currentBooklet', {
                  current: formatNumber(bookletNumber, locale),
                  total: formatNumber(bookletTotal, locale),
                })}{' '}
                · {formatNumber(answered, locale)} / {formatNumber(total, locale)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {currentPdfs.length > 0 && (
              <PdfDownloadButton
                pdfs={currentPdfs}
                label={t('downloadExamPdf')}
                variant="outline"
                size="sm"
                compactOnMobile
              />
            )}
            {remaining !== null ? (
              <div
                role="timer"
                className={cn(
                  'tnum flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  critical
                    ? 'animate-pulse-soft border-incorrect-border bg-incorrect-bg text-incorrect'
                    : low
                      ? 'border-unanswered-border bg-unanswered-bg text-unanswered'
                      : 'border-border bg-surface text-foreground',
                )}
                aria-label={`${t('bookletTimeLeft')}: ${formatClock(remaining, locale)}`}
              >
                <Clock className="size-3.5" aria-hidden="true" />
                <span dir="ltr">{formatClock(remaining, locale)}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">{t('untimed')}</span>
            )}
          </div>
        </div>
      </header>

      <main className="page-container animate-fade-up flex flex-1 flex-col gap-4 py-5 sm:py-7">
        <div className="glass flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{bookletTitle}</p>
              <p className="text-[11px] text-muted-foreground">
                {t('currentBooklet', {
                  current: formatNumber(bookletNumber, locale),
                  total: formatNumber(bookletTotal, locale),
                })}
                {currentRange && currentRange.count > 0
                  ? ` · ${t('bookletRange', {
                      from: formatNumber(currentRange.startQuestion, locale),
                      to: formatNumber(currentRange.endQuestion, locale),
                    })}`
                  : ''}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {t('answered')}{' '}
              <span className="tnum">
                {formatNumber(answeredHere, locale)} /{' '}
                {formatNumber(currentRange?.count ?? 0, locale)}
              </span>
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/80">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${bookletProgress}%` }}
            />
          </div>
        </div>

        <AnswerSheet rows={rows} variant="answering" onToggle={toggle} />
      </main>

      <footer className="glass-bar sticky bottom-0 z-30 border-t">
        <div className="page-container flex flex-wrap items-center justify-between gap-2 py-3">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            {t('answered')}{' '}
            <span className="tnum">
              {formatNumber(answered, locale)} / {formatNumber(total, locale)}
            </span>
          </span>
          <div className="flex flex-1 items-center justify-end gap-2">
            {!lastBooklet && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFinishBookletOpen(true)}
              >
                <Flag className="size-4" aria-hidden="true" />
                {t('finishBooklet')}
              </Button>
            )}
            <Button size="sm" onClick={() => setSubmitOpen(true)}>
              <Send className="size-4" aria-hidden="true" />
              {t('submitExam')}
            </Button>
          </div>
        </div>
      </footer>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent closeLabel={t('close')}>
          <DialogHeader>
            <DialogTitle>{t('leaveTitle')}</DialogTitle>
            <DialogDescription>{t('leaveDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              {t('stay')}
            </Button>
            <Button
              onClick={() => {
                setLeaveOpen(false);
                onExit();
              }}
            >
              {t('leave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={finishBookletOpen} onOpenChange={setFinishBookletOpen}>
        <DialogContent closeLabel={t('close')}>
          <DialogHeader>
            <DialogTitle>{t('finishBookletTitle')}</DialogTitle>
            <DialogDescription>{t('finishBookletDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFinishBookletOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={finishCurrentBooklet}>
              <Flag className="size-4" aria-hidden="true" />
              {t('finishBookletConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent closeLabel={t('close')}>
          <DialogHeader>
            <DialogTitle>{t('submitConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('submitConfirmDesc', {
                answered: formatNumber(answered, locale),
                total: formatNumber(total, locale),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSubmitOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => {
                setSubmitOpen(false);
                void finish(false);
              }}
            >
              {t('submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
