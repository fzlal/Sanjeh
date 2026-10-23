import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Globe2, Palette, SunMedium } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useSettings } from '@/app/settings-provider';
import { Brand } from '@/app/brand';
import { Button } from '@/components/ui/button';
import { LanguagePicker } from '@/features/settings/language-picker';
import { ThemePicker } from '@/features/settings/theme-picker';
import { AppearancePicker } from '@/features/settings/appearance-picker';
import { cn } from '@/lib/utils';

const steps = [
  { id: 'language', icon: Globe2 },
  { id: 'appearance', icon: SunMedium },
  { id: 'theme', icon: Palette },
] as const;

export function Onboarding() {
  const { t, dir } = useI18n();
  const { settings, updateSettings } = useSettings();
  const [step, setStep] = useState(0);

  const finish = () => updateSettings({ onboardingComplete: true });
  const last = step === steps.length - 1;
  const StepIcon = steps[step].icon;
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const NextIcon = dir === 'rtl' ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-dvh">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-7 lg:grid-cols-[1.06fr_0.94fr] lg:items-start lg:gap-12 lg:px-8 lg:py-14">
        <section className="animate-fade-up flex flex-col gap-7">
          <header className="flex items-center justify-between gap-4">
            <Brand />
            <Button variant="ghost" size="sm" onClick={finish}>
              {t('skip')}
            </Button>
          </header>

          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t('stepOf', { current: step + 1, total: steps.length })}
            </span>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
              {t('onboardingTitle')}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              {t('onboardingDesc')}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-soft sm:p-5">
            <div key={step} className="animate-fade-up">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-md bg-secondary text-foreground">
                <StepIcon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex flex-col">
                <h2 className="text-sm font-semibold">
                  {step === 0
                    ? t('setupLanguage')
                    : step === 1
                      ? t('setupAppearance')
                      : t('setupTheme')}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {step === 0
                    ? t('languageHint')
                    : step === 1
                      ? t('appearanceHint')
                      : t('themeHint')}
                </span>
              </div>
            </div>

            <div className={cn(step === 0 && 'max-h-[42vh] overflow-y-auto pe-1')}>
              {step === 0 && (
                <LanguagePicker
                  value={settings.language}
                  onChange={(language) => updateSettings({ language })}
                />
              )}
              {step === 1 && (
                <div className="flex flex-col gap-3">
                  <AppearancePicker
                    value={settings.appearance}
                    onChange={(appearance) => updateSettings({ appearance })}
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t('setupNote')}
                  </p>
                </div>
              )}
              {step === 2 && (
                <ThemePicker
                  value={settings.theme}
                  onChange={(theme) => updateSettings({ theme })}
                />
              )}
            </div>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {steps.map((item, index) => (
                <span
                  key={item.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    index === step ? 'w-7 bg-primary' : 'w-1.5 bg-border',
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="ghost" onClick={() => setStep((current) => current - 1)}>
                  <BackIcon className="size-4" aria-hidden="true" />
                  {t('back')}
                </Button>
              )}
              {last ? (
                <Button onClick={finish}>
                  <Check className="size-4" aria-hidden="true" />
                  {t('getStarted')}
                </Button>
              ) : (
                <Button onClick={() => setStep((current) => current + 1)}>
                  {t('continue')}
                  <NextIcon className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </footer>
        </section>

        <aside className="animate-rise-in [animation-delay:120ms] lg:sticky lg:top-10">
          <PreviewPanel />
        </aside>
      </div>
    </div>
  );
}

function PreviewPanel() {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-lift sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {t('previewLabel')}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-correct" aria-hidden="true" />
          {t('available')}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{t('previewExamTitle')}</h3>
            <span className="tnum text-xs text-muted-foreground">{t('previewQuestion')}</span>
          </div>
          <span className="tnum rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-muted-foreground">
            {t('untimed')}
          </span>
        </div>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-[30%] rounded-full bg-primary" />
        </div>

        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4].map((option) => {
            const selected = option === 1;
            return (
              <div
                key={option}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                  selected
                    ? 'border-primary/60 bg-secondary text-foreground'
                    : 'border-border bg-surface text-foreground/80',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {selected ? <Check className="size-3" strokeWidth={3} /> : option}
                </span>
                <span className="truncate text-muted-foreground">
                  {t('optionLabel', { n: option })}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span>{t('answered')} · 3</span>
          <span>{t('noTextNote')}</span>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
        {t('setupNote')}
      </p>
    </div>
  );
}
