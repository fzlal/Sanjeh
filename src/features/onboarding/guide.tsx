import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Calculator,
  CalendarClock,
  Check,
  ClipboardList,
  Clock,
  EyeOff,
  FileText,
  HardDriveDownload,
  KeyRound,
  Languages,
  LayoutDashboard,
  Lock,
  Palette,
  PenLine,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRoundX,
  WifiOff,
} from 'lucide-react';
import type { MessageKey } from '@/i18n';
import { useI18n } from '@/i18n';
import type { OptionIndex } from '@/types';
import { OPTION_INDICES } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BrandMark } from '@/app/brand';
import { CORRECT_POINTS, INCORRECT_POINTS } from '@/lib/scoring';
import { formatClock, formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

type GuideIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

type GuideVisualKind =
  | 'welcome'
  | 'dashboard'
  | 'booklets'
  | 'keys'
  | 'scoring'
  | 'schedule'
  | 'session'
  | 'results'
  | 'settings';

interface GuideStep {
  id: string;
  icon: GuideIcon;
  title: MessageKey;
  body: MessageKey;
  points: MessageKey[];
  visual: GuideVisualKind;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'welcome',
    icon: Sparkles,
    title: 'guideWelcomeTitle',
    body: 'guideWelcomeBody',
    points: ['guideWelcomePoint1', 'guideWelcomePoint2', 'guideWelcomePoint3'],
    visual: 'welcome',
  },
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'guideDashboardTitle',
    body: 'guideDashboardBody',
    points: ['guideDashboardPoint1', 'guideDashboardPoint2', 'guideDashboardPoint3'],
    visual: 'dashboard',
  },
  {
    id: 'booklets',
    icon: BookOpen,
    title: 'guideCreateTitle',
    body: 'guideCreateBody',
    points: ['guideCreatePoint1', 'guideCreatePoint2', 'guideCreatePoint3'],
    visual: 'booklets',
  },
  {
    id: 'keys',
    icon: KeyRound,
    title: 'guideKeysTitle',
    body: 'guideKeysBody',
    points: [
      'guideKeysPoint1',
      'guideKeysPoint2',
      'guideKeysPoint3',
      'guideKeysPoint4',
    ],
    visual: 'keys',
  },
  {
    id: 'scoring',
    icon: Calculator,
    title: 'guideScoringTitle',
    body: 'guideScoringBody',
    points: ['guideScoringPoint1', 'guideScoringPoint2', 'guideScoringPoint3'],
    visual: 'scoring',
  },
  {
    id: 'schedule',
    icon: CalendarClock,
    title: 'guideScheduleTitle',
    body: 'guideScheduleBody',
    points: ['guideSchedulePoint1', 'guideSchedulePoint2', 'guideSchedulePoint3'],
    visual: 'schedule',
  },
  {
    id: 'session',
    icon: ClipboardList,
    title: 'guideSessionTitle',
    body: 'guideSessionBody',
    points: ['guideSessionPoint1', 'guideSessionPoint2', 'guideSessionPoint3'],
    visual: 'session',
  },
  {
    id: 'results',
    icon: BarChart3,
    title: 'guideResultsTitle',
    body: 'guideResultsBody',
    points: ['guideResultsPoint1', 'guideResultsPoint2', 'guideResultsPoint3'],
    visual: 'results',
  },
  {
    id: 'settings',
    icon: Settings,
    title: 'guideSettingsTitle',
    body: 'guideSettingsBody',
    points: ['guideSettingsPoint1', 'guideSettingsPoint2', 'guideSettingsPoint3'],
    visual: 'settings',
  },
];

export function GuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [index]);

  const step = GUIDE_STEPS[index];
  const Icon = step.icon;
  const lastStep = index === GUIDE_STEPS.length - 1;
  const stepCount = GUIDE_STEPS.length;

  const next = () => {
    if (lastStep) {
      onOpenChange(false);
      return;
    }
    setIndex((current) => Math.min(current + 1, stepCount - 1));
  };

  const previous = () => setIndex((current) => Math.max(0, current - 1));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('close')}
        className="flex h-auto max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-1rem-env(safe-area-inset-left)-env(safe-area-inset-right))] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(43rem,calc(100dvh-3rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] lg:h-[36rem]"
        style={{
          overflow: 'hidden',
          top: 'calc(50% + (env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 2)',
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          setIndex(0);
          nextRef.current?.focus();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('guideTitle')}</DialogTitle>
          <DialogDescription>{t('guideIntro')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b border-border px-4 pb-3 pt-4 pe-12 sm:px-6 sm:pt-5 sm:pe-14">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpenCheck className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t('guideTitle')}</p>
                <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                  {t('guideIntro')}
                </p>
              </div>
            </div>
            <span
              aria-live="polite"
              className="tnum shrink-0 text-[11px] font-medium text-muted-foreground"
            >
              {t('stepOf', {
                current: formatNumber(index + 1, locale),
                total: formatNumber(stepCount, locale),
              })}
            </span>
          </div>

          <div
            role="progressbar"
            aria-label={t('guideTitle')}
            aria-valuemin={1}
            aria-valuemax={stepCount}
            aria-valuenow={index + 1}
            aria-valuetext={t(step.title)}
            className="flex gap-1"
          >
            {GUIDE_STEPS.map((entry, entryIndex) => (
              <span
                key={entry.id}
                aria-hidden="true"
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors duration-200',
                  entryIndex <= index ? 'bg-primary' : 'bg-border',
                )}
              />
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            key={step.id}
            className="animate-fade-up grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-center lg:gap-7"
          >
            <GuideVisual kind={step.visual} />

            <div className="min-w-0">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-7 sm:text-xl">
                    {t(step.title)}
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {t(step.body)}
                  </p>
                </div>
              </div>

              <ul className="mt-4 flex flex-col gap-2">
                {step.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/35 px-3 py-2.5"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 text-xs leading-5 text-foreground/90 sm:text-[13px]">
                      {t(point)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('skip')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={previous} disabled={index === 0}>
              {t('previous')}
            </Button>
            <Button
              ref={nextRef}
              size="sm"
              data-guide-next
              onClick={next}
            >
              {lastStep ? t('done') : t('next')}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function GuideVisual({ kind }: { kind: GuideVisualKind }) {
  const { t, locale } = useI18n();

  return (
    <div className="relative flex min-h-[10.5rem] items-center justify-center overflow-hidden rounded-2xl border border-glass-border bg-secondary/30 p-4 lg:min-h-[22rem]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -start-10 -top-10 size-36 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-12 -end-8 size-40 rounded-full bg-accent/25 blur-3xl"
      />

      <div aria-hidden="true" className="relative w-full max-w-[16rem]">
        {kind === 'welcome' && <WelcomeVisual />}

        {kind === 'dashboard' && (
          <div className="flex flex-col gap-2">
            <div className="rounded-xl border border-glass-border bg-surface/90 p-2.5 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <span className="h-2 w-20 rounded-full bg-foreground/15" />
                <Badge variant="correct" className="px-1.5 py-0 text-[9px]">
                  {t('available')}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="h-1.5 w-14 rounded-full bg-border" />
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[9px] font-medium text-primary-foreground">
                  <Play className="size-2.5" aria-hidden="true" />
                  {t('start')}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-glass-border bg-surface/75 p-2.5 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <span className="h-2 w-24 rounded-full bg-foreground/15" />
                <Badge variant="primary" className="px-1.5 py-0 text-[9px]">
                  {t('inProgress')}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="h-1.5 w-10 rounded-full bg-border" />
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[9px] font-medium text-primary">
                  <RotateCcw className="size-2.5" aria-hidden="true" />
                  {t('resume')}
                </span>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[9px] text-muted-foreground">
              <FileText className="size-3" aria-hidden="true" />
              {t('recentResults')}
            </div>
          </div>
        )}

        {kind === 'booklets' && (
          <div className="flex flex-col gap-2">
            {[
              { number: 1, minutes: 25 },
              { number: 2, minutes: 15 },
            ].map((booklet) => (
              <div
                key={booklet.number}
                className="flex items-center gap-2.5 rounded-xl border border-glass-border bg-surface/90 p-2.5 shadow-soft"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium">
                    {t('bookletN', { n: formatNumber(booklet.number, locale) })}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {formatNumber(booklet.minutes, locale)} {t('minutesShort')}
                  </p>
                </div>
                <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </div>
            ))}
            <div className="flex justify-center gap-1.5 text-[9px] text-muted-foreground">
              <span className="rounded-full border border-border bg-surface/70 px-2 py-0.5">
                PDF
              </span>
              <span className="rounded-full border border-border bg-surface/70 px-2 py-0.5">
                {t('optional')}
              </span>
            </div>
          </div>
        )}

        {kind === 'keys' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Sparkles, active: true },
                { icon: PenLine, active: false },
                { icon: EyeOff, active: false },
              ].map(({ icon: KeyIcon, active }, tileIndex) => (
                <span
                  key={tileIndex}
                  className={cn(
                    'relative flex aspect-square items-center justify-center rounded-xl border bg-surface/90 shadow-soft',
                    active
                      ? 'border-primary text-primary ring-2 ring-primary/20'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  <KeyIcon className="size-5" aria-hidden="true" />
                  {active && (
                    <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="rounded-xl border border-glass-border bg-surface/90 p-2.5 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <span className="h-2 w-24 rounded-full bg-foreground/15" />
                <span className="rounded-full border border-unanswered-border bg-unanswered-bg px-2 py-0.5 text-[9px] font-medium text-unanswered">
                  ?
                </span>
              </div>
              <div className="mt-2 flex gap-1">
                {OPTION_INDICES.map((option) => (
                  <span
                    key={option}
                    className={cn(
                      'tnum flex size-5 items-center justify-center rounded-full border text-[9px] font-semibold',
                      option === 2
                        ? 'border-correct bg-correct text-white'
                        : 'border-border bg-surface text-muted-foreground',
                    )}
                  >
                    {formatNumber(option, locale)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {kind === 'scoring' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2">
              <span
                dir="ltr"
                className="tnum rounded-xl border border-correct-border bg-correct-bg px-3 py-2 text-lg font-semibold text-correct"
              >
                +{formatNumber(CORRECT_POINTS, locale)}
              </span>
              <span
                dir="ltr"
                className="tnum rounded-xl border border-incorrect-border bg-incorrect-bg px-3 py-2 text-lg font-semibold text-incorrect"
              >
                {formatNumber(INCORRECT_POINTS, locale)}
              </span>
            </div>
            <div className="rounded-xl border border-glass-border bg-surface/90 p-2.5 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-muted-foreground">{t('scoreLabel')}</span>
                <span className="tnum text-sm font-semibold text-primary" dir="ltr">
                  {formatPercent(64, locale)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-[64%] rounded-full bg-primary" />
              </div>
            </div>
            <div className="flex justify-center gap-1.5 text-[9px] text-muted-foreground">
              <span className="rounded-full border border-correct-border bg-correct-bg px-2 py-0.5 text-correct">
                {t('correctLabel')}
              </span>
              <span className="rounded-full border border-incorrect-border bg-incorrect-bg px-2 py-0.5 text-incorrect">
                {t('incorrectLabel')}
              </span>
              <span className="rounded-full border border-unanswered-border bg-unanswered-bg px-2 py-0.5 text-unanswered">
                {t('unansweredLabel')}
              </span>
            </div>
          </div>
        )}

        {kind === 'schedule' && (
          <div className="rounded-xl border border-glass-border bg-surface/90 p-3 shadow-soft">
            <div className="flex items-center justify-between gap-2 text-[9px] font-medium text-muted-foreground">
              <span>{t('windowStart')}</span>
              <span>{t('windowEnd')}</span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-secondary">
              <div className="absolute inset-y-0 start-[12%] end-[10%] rounded-full bg-primary/60" />
              <span className="absolute start-[12%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-surface" />
              <span className="absolute end-[10%] top-1/2 size-3 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-surface" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-[10px] font-medium">
                <CalendarClock className="size-3 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{t('scheduleWindow')}</span>
              </span>
              <span
                dir="ltr"
                className="tnum flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
              >
                <Clock className="size-2.5" aria-hidden="true" />
                {formatClock(90 * 60_000, locale)}
              </span>
            </div>
          </div>
        )}

        {kind === 'session' && <SessionVisual />}

        {kind === 'results' && (
          <div className="rounded-xl border border-glass-border bg-surface/90 p-3 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {t('reportCard')}
                </p>
                <span className="mt-2 block h-2 w-24 rounded-full bg-foreground/15" />
                <span className="mt-1.5 block h-1.5 w-16 rounded-full bg-border" />
              </div>
              <div className="shrink-0 text-end">
                <p className="tnum text-2xl font-semibold leading-none text-primary" dir="ltr">
                  {formatPercent(69.4, locale)}
                </p>
                <p className="tnum mt-1 text-[8px] text-muted-foreground" dir="ltr">
                  {formatNumber(18, locale)} / {formatNumber(24, locale)}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1">
              {[
                { label: t('correctLabel'), value: 18, tone: 'text-correct' },
                { label: t('incorrectLabel'), value: 4, tone: 'text-incorrect' },
                { label: t('unansweredLabel'), value: 2, tone: 'text-unanswered' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border/70 bg-background/45 px-1.5 py-1"
                >
                  <p className="truncate text-[8px] text-muted-foreground">{stat.label}</p>
                  <p className={cn('tnum mt-0.5 text-xs font-semibold', stat.tone)}>
                    {formatNumber(stat.value, locale)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {kind === 'settings' && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Palette, label: t('theme') },
                { icon: Languages, label: t('language') },
                { icon: HardDriveDownload, label: t('exportBackup') },
                { icon: ShieldCheck, label: t('privacyTitle') },
              ].map(({ icon: SettingIcon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-xl border border-glass-border bg-surface/90 px-2.5 py-2 shadow-soft"
                >
                  <SettingIcon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate text-[9px] font-medium">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-correct-border bg-correct-bg px-2.5 py-1.5 text-[9px] text-correct">
              <ShieldCheck className="size-3 shrink-0" aria-hidden="true" />
              {t('guideChipLocal')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeVisual() {
  const { t } = useI18n();
  const chips = [
    { icon: ShieldCheck, label: t('guideChipLocal') },
    { icon: WifiOff, label: t('guideChipOffline') },
    { icon: UserRoundX, label: t('guideChipNoAccount') },
  ];

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <BrandMark className="size-14 rounded-2xl shadow-lift [&_svg]:size-7" />
      <p className="text-[11px] font-medium text-muted-foreground">{t('tagline')}</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {chips.map(({ icon: ChipIcon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-surface/85 px-2.5 py-1 text-[9px] font-medium text-foreground/90 shadow-soft"
          >
            <ChipIcon className="size-3 text-primary" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SessionVisual() {
  const { t, locale } = useI18n();
  const rows: { selected: OptionIndex | null; locked: boolean }[] = [
    { selected: 2, locked: false },
    { selected: 4, locked: false },
    { selected: null, locked: false },
    { selected: null, locked: true },
  ];

  return (
    <div className="rounded-xl border border-glass-border bg-surface/90 p-2.5 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-medium">
          {t('currentBooklet', {
            current: formatNumber(1, locale),
            total: formatNumber(3, locale),
          })}
        </span>
        <span
          dir="ltr"
          className="tnum flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary"
        >
          <Clock className="size-2.5" aria-hidden="true" />
          {formatClock(19 * 60_000 + 45_000, locale)}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={cn(
              'flex items-center gap-1 rounded-md px-1 py-0.5',
              rowIndex % 2 === 0 && 'bg-secondary/50',
              row.locked && 'opacity-50',
            )}
          >
            <span className="tnum w-3 shrink-0 text-center text-[8px] text-muted-foreground">
              {formatNumber(rowIndex + 1, locale)}
            </span>
            {OPTION_INDICES.map((option) => (
              <span
                key={option}
                className={cn(
                  'tnum flex size-4 shrink-0 items-center justify-center rounded-full border text-[7px] font-semibold',
                  row.selected === option
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface text-muted-foreground',
                )}
              >
                {formatNumber(option, locale)}
              </span>
            ))}
            <span className="ms-auto flex size-3 shrink-0 items-center justify-center text-muted-foreground">
              {row.locked ? (
                <Lock className="size-2.5" aria-hidden="true" />
              ) : (
                <span className="block size-2.5 rounded-full border border-border" />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
