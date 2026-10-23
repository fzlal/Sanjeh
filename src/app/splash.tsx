import { useI18n } from '@/i18n';
import { Brand } from './brand';

export function Splash() {
  const { t } = useI18n();
  return (
    <div className="animate-fade-in flex min-h-dvh flex-col items-center justify-center gap-5">
      <div className="animate-pop-in">
        <Brand />
      </div>
      <p className="animate-pulse-soft text-sm text-muted-foreground">{t('loading')}</p>
    </div>
  );
}
