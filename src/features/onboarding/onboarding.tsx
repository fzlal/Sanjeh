import type { ComponentType, ReactNode } from 'react';
import { Globe2, Palette, SunMedium } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useSettings } from '@/app/settings-provider';
import { Brand } from '@/app/brand';
import { Button } from '@/components/ui/button';
import { LanguagePicker } from '@/features/settings/language-picker';
import { ThemePicker } from '@/features/settings/theme-picker';
import { AppearancePicker } from '@/features/settings/appearance-picker';

export function Onboarding() {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const finish = () => updateSettings({ onboardingComplete: true });
  const skipAll = () => updateSettings({ onboardingComplete: true, guideSeen: true });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="page-container flex h-16 items-center justify-between">
        <Brand />
        <Button variant="ghost" size="sm" onClick={skipAll}>
          {t('skip')}
        </Button>
      </header>

      <main className="page-container flex flex-1 items-center justify-center pb-14">
        <section className="animate-fade-up flex w-full max-w-xl flex-col gap-6">
          <header className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold sm:text-3xl">{t('onboardingTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('onboardingDesc')}</p>
          </header>

          <div className="glass flex flex-col gap-5 rounded-[2rem] p-5 sm:p-7">
            <SettingRow icon={Globe2} label={t('setupLanguage')}>
              <LanguagePicker
                value={settings.language}
                onChange={(language) => updateSettings({ language })}
              />
            </SettingRow>
            <SettingRow icon={SunMedium} label={t('setupAppearance')}>
              <AppearancePicker
                value={settings.appearance}
                onChange={(appearance) => updateSettings({ appearance })}
              />
            </SettingRow>
            <SettingRow icon={Palette} label={t('setupTheme')}>
              <ThemePicker value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
            </SettingRow>
          </div>

          <Button size="lg" className="w-full" onClick={finish}>
            {t('getStarted')}
          </Button>
        </section>
      </main>
    </div>
  );
}

function SettingRow({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {label}
      </span>
      {children}
    </div>
  );
}
