import type { ReactNode } from 'react';
import { CircleHelp, Settings } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Brand } from './brand';
import { Button } from '@/components/ui/button';

export function AppShell({
  current,
  onHome,
  onSettings,
  onGuide,
  alert,
  children,
}: {
  current: 'dashboard' | 'settings' | 'other';
  onHome: () => void;
  onSettings: () => void;
  onGuide: () => void;
  alert?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass-bar sticky top-0 z-30 border-b">
        <div className="page-container flex h-14 items-center justify-between gap-3">
          <button
            type="button"
            onClick={onHome}
            aria-label={t('yourExams')}
            className="rounded-md"
          >
            <Brand />
          </button>
          <nav className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('guideOpen')}
              title={t('guideOpen')}
              onClick={onGuide}
            >
              <CircleHelp className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant={current === 'settings' ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={t('settings')}
              title={t('settings')}
              onClick={onSettings}
            >
              <Settings className="size-4" aria-hidden="true" />
            </Button>
          </nav>
        </div>
      </header>
      {alert && (
        <div
          role="alert"
          className="border-b border-incorrect-border bg-incorrect-bg px-4 py-2 text-center text-xs text-incorrect"
        >
          {t('storageUnavailable')}
        </div>
      )}
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
