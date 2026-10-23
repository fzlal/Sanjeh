import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileText,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import type { Exam, ExamSession } from '@/types';
import { useI18n } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PdfDownloadButton } from '@/components/pdf-download-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { totalDurationMinutes } from '@/lib/booklets';
import { formatDate, formatDateTime, formatDuration, formatPercent } from '@/lib/format';
import { getAvailability } from '@/lib/scheduling';
import { cn } from '@/lib/utils';

type ExamStatus = 'inProgress' | 'available' | 'scheduled' | 'ended';

function statusOf(exam: Exam, sessions: ExamSession[], now: number): ExamStatus {
  const active = sessions.some(
    (session) => session.examId === exam.id && session.status === 'active',
  );
  if (active) return 'inProgress';
  const availability = getAvailability(exam, now);
  if (availability.available) return 'available';
  return availability.reason === 'ended' ? 'ended' : 'scheduled';
}

const statusVariant = {
  inProgress: 'primary',
  available: 'correct',
  scheduled: 'unanswered',
  ended: 'excluded',
} as const;

export function Dashboard({
  exams,
  sessions,
  loading,
  onCreate,
  onEdit,
  onDuplicate,
  onDelete,
  onStart,
  onResume,
  onReview,
}: {
  exams: Exam[];
  sessions: ExamSession[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (exam: Exam) => void;
  onDuplicate: (exam: Exam) => void;
  onDelete: (exam: Exam) => void;
  onStart: (exam: Exam) => void;
  onResume: (session: ExamSession) => void;
  onReview: (session: ExamSession) => void;
}) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const sortedExams = useMemo(
    () => [...exams].sort((a, b) => b.updatedAt - a.updatedAt),
    [exams],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return sortedExams;
    return sortedExams.filter(
      (exam) =>
        exam.title.toLocaleLowerCase().includes(needle) ||
        (exam.description ?? '').toLocaleLowerCase().includes(needle),
    );
  }, [sortedExams, query]);

  const results = useMemo(
    () =>
      sessions
        .filter((session) => session.status === 'submitted' && session.result)
        .sort(
          (a, b) =>
            (b.result?.completedAt ?? b.submittedAt ?? 0) -
            (a.result?.completedAt ?? a.submittedAt ?? 0),
        )
        .slice(0, 6),
    [sessions],
  );

  const activeSessionFor = (examId: string) =>
    sessions
      .filter((session) => session.examId === examId && session.status === 'active')
      .sort((a, b) => b.startedAt - a.startedAt)[0];

  const statusLabel = (status: ExamStatus) =>
    status === 'inProgress'
      ? t('inProgress')
      : status === 'available'
        ? t('available')
        : status === 'scheduled'
          ? t('scheduled')
          : t('ended');

  return (
    <div className="page-container pb-16 pt-6 sm:pt-9">
      <section className="mb-8 flex flex-col gap-5 sm:mb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-2xl flex-col gap-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">{t('yourExams')}</h1>
            <p className="text-sm text-muted-foreground">{t('tagline')}</p>
          </div>
          <Button onClick={onCreate}>
            <Plus className="size-4" aria-hidden="true" />
            {t('newExam')}
          </Button>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0">
          {exams.length >= 4 && (
            <div className="relative mb-4">
              <Search
                className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('search')}
                className="ps-9"
              />
            </div>
          )}

          {loading ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">{t('loading')}</Card>
          ) : exams.length === 0 ? (
            <EmptyExams onCreate={onCreate} />
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {t('noSearchResults')}
            </Card>
          ) : (
            <ul className="stagger grid gap-4 sm:grid-cols-2">
              {filtered.map((exam) => {
                const status = statusOf(exam, sessions, now);
                const totalMinutes = totalDurationMinutes(exam.booklets);
                const examPdfs = exam.booklets.flatMap((booklet) => booklet.pdfs);
                return (
                  <li key={exam.id}>
                    <Card
                      className={cn(
                        'hover-lift group flex h-full flex-col justify-between hover:border-primary/35',
                        status === 'ended' && 'opacity-80',
                      )}
                    >
                      <div className="flex flex-col gap-3 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate text-base font-semibold">
                              {exam.title || t('untitled')}
                            </h2>
                            {exam.description ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                {exam.description}
                              </p>
                            ) : null}
                          </div>
                          <Badge variant={statusVariant[status]}>{statusLabel(status)}</Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <FileText className="size-3.5" aria-hidden="true" />
                            <span className="tnum">{exam.questions.length}</span> {t('questionCount')}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CalendarClock className="size-3.5" aria-hidden="true" />
                            {totalMinutes > 0
                              ? formatDuration(totalMinutes * 60_000, locale)
                              : t('untimed')}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="size-3.5" aria-hidden="true" />
                            <span className="tnum">{exam.booklets.length}</span> {t('booklets')}
                          </span>
                        </div>

                        {exam.scheduling.mode !== 'immediate' && (
                          <div className="rounded-md bg-background/70 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                            {exam.scheduling.mode === 'scheduled' && (
                              <span>
                                {t('startsAt')}: {formatDateTime(exam.scheduling.startsAt, locale)}
                              </span>
                            )}
                            {exam.scheduling.mode === 'window' && (
                              <span className="tnum">
                                {formatDateTime(exam.scheduling.startsAt, locale)} —{' '}
                                {formatDateTime(exam.scheduling.endsAt, locale)}
                              </span>
                            )}
                            {exam.scheduling.mode === 'flexible' && (
                              <span>
                                {t('windowEnd')}: {formatDate(exam.scheduling.windowEnd, locale)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('edit')}
                            title={t('edit')}
                            onClick={() => onEdit(exam)}
                          >
                            <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('duplicate')}
                            title={t('duplicate')}
                            onClick={() => onDuplicate(exam)}
                          >
                            <Copy className="size-4 text-muted-foreground" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('delete')}
                            title={t('delete')}
                            onClick={() => setDeleteTarget(exam)}
                          >
                            <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
                          </Button>
                          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
                          <PdfDownloadButton
                            pdfs={examPdfs}
                            label={t('downloadExamPdf')}
                            variant="ghost"
                            size="icon-sm"
                            iconOnly
                          />
                          <PdfDownloadButton
                            pdfs={exam.answerPdfs}
                            label={t('downloadAnswerPdf')}
                            variant="ghost"
                            size="icon-sm"
                            iconOnly
                          />
                        </div>

                        {status === 'inProgress' ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              const active = activeSessionFor(exam.id);
                              if (active) onResume(active);
                            }}
                          >
                            <RotateCcw className="size-4" aria-hidden="true" />
                            {t('resume')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={status !== 'available'}
                            onClick={() => onStart(exam)}
                          >
                            <Play className="size-4" aria-hidden="true" />
                            {t('start')}
                          </Button>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">{t('recentResults')}</h2>
            <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          {results.length === 0 ? (
            <Card className="p-5 text-xs leading-relaxed text-muted-foreground">
              {t('emptyResults')}
            </Card>
          ) : (
            <ul className="stagger flex flex-col gap-2">
              {results.map((session) => {
                const result = session.result!;
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => onReview(session)}
                      className="w-full rounded-lg border border-border bg-surface p-3 text-start transition-colors hover:border-primary/35 hover:bg-secondary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {session.exam.title || t('untitled')}
                        </span>
                        <span className="tnum shrink-0 text-sm font-semibold text-primary">
                          {formatPercent(result.percentage, locale)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {t('correctLabel')} {result.correct}/{result.scoredQuestions}
                        </span>
                        <span>{formatDate(result.completedAt, locale)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent closeLabel={t('close')}>
          <DialogHeader>
            <DialogTitle>{t('deleteExamTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteExamDesc', { title: deleteTarget?.title || t('untitled') })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyExams({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <Card className="animate-pop-in flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground">
        <FileText className="size-5" aria-hidden="true" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t('emptyExamsTitle')}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('emptyExamsDesc')}</p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="size-4" aria-hidden="true" />
        {t('createFirstExam')}
      </Button>
    </Card>
  );
}
