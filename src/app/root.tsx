import { SettingsProvider, useSettings } from './settings-provider';
import { I18nProvider } from '@/i18n';
import { ToastProvider } from './toast';
import { App } from './App';

function LocalizedTree() {
  const { settings } = useSettings();
  return (
    <I18nProvider language={settings.language}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  );
}

export function Root() {
  return (
    <SettingsProvider>
      <LocalizedTree />
    </SettingsProvider>
  );
}
