import { useRef, useState } from 'react';
import {
  Download,
  Eye,
  HardDriveDownload,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import type { BackupFile, Exam, ExamSession } from '@/types';
import { useI18n } from '@/i18n';
import { useSettings } from '@/app/settings-provider';
import { useToast } from '@/app/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LanguagePicker } from '@/features/settings/language-picker';
import { ThemePicker } from '@/features/settings/theme-picker';
import { AppearancePicker } from '@/features/settings/appearance-picker';
import {
  backupFileName,
  createBackup,
  parseBackupFile,
} from '@/storage/backup';
import { clearAllStores, replaceAllData } from '@/storage/db';
import { DEFAULT_SETTINGS, clearBootSettings } from '@/storage/boot';
import { APP_VERSION } from '@/lib/config';

export function SettingsScreen({
  exams,
  sessions,
  onDataReplaced,
}: {
  exams: Exam[];
  sessions: ExamSession[];
  onDataReplaced: () => void;
}) {
  const { t } = useI18n();
  const { settings, updateSettings, replaceSettings, storageFailed } = useSettings();
  const { notify } = useToast();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [pendingBackup, setPendingBackup] = useState<BackupFile | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const exportBackup = () => {
    const backup = createBackup(exams, sessions, settings);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupFileName();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const backup = parseBackupFile(text);
      setPendingBackup(backup);
    } catch {
      notify(t('importDataError'), 'error');
    }
  };

  const confirmImport = async () => {
    if (!pendingBackup) return;
    setBusy(true);
    try {
      await replaceAllData(pendingBackup.data);
      replaceSettings(pendingBackup.data.settings);
      setPendingBackup(null);
      notify(t('importDataSuccess'));
      onDataReplaced();
    } catch {
      notify(t('importDataError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    setBusy(true);
    try {
      await clearAllStores();
      clearBootSettings();
      replaceSettings(DEFAULT_SETTINGS);
      setResetOpen(false);
      onDataReplaced();
    } catch {
      notify(t('storageUnavailable'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-container max-w-4xl pb-16 pt-6 sm:pt-9">
      <div className="mb-7 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('settings')}</h1>
        <p className="text-sm text-muted-foreground">{t('tagline')}</p>
      </div>

      {storageFailed && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-incorrect-border bg-incorrect-bg px-4 py-3 text-sm text-incorrect"
        >
          {t('storageUnavailable')}
        </div>
      )}

      <div className="stagger flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('language')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <LanguagePicker
              value={settings.language}
              onChange={(language) => updateSettings({ language })}
            />
            <p className="text-[11px] text-muted-foreground">{t('languageHint')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('theme')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ThemePicker value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t('appearance')}</span>
              <AppearancePicker
                value={settings.appearance}
                onChange={(appearance) => updateSettings({ appearance })}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{t('themeHint')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dataTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{t('backupNote')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportBackup}>
                <Download className="size-4" aria-hidden="true" />
                {t('exportBackup')}
              </Button>
              <Button variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload className="size-4" aria-hidden="true" />
                {t('importBackup')}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </div>
            <div className="flex items-start gap-2 rounded-md border border-unanswered-border bg-unanswered-bg px-3 py-2 text-xs leading-relaxed text-unanswered">
              <HardDriveDownload className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{t('storageNotice')}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dangerZone')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => updateSettings({ onboardingComplete: false })}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t('resetOnboarding')}
            </Button>
            <Button variant="destructive" onClick={() => setResetOpen(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              {t('resetData')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('aboutTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="flex flex-col gap-0.5">
                <span>{t('aboutText')}</span>
                <span className="text-xs text-muted-foreground">
                  {t('versionLabel', { version: APP_VERSION })}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 border-t border-border pt-4">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t('privacyTitle')}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {t('privacyText')}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 border-t border-border pt-4">
              <Eye className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t('setupNote')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={pendingBackup !== null}
        onOpenChange={(open) => !open && setPendingBackup(null)}
      >
        <DialogContent closeLabel={t('close')}>
          <DialogHeader>
            <DialogTitle>{t('importBackup')}</DialogTitle>
            <DialogDescription>{t('importDataConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingBackup(null)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void confirmImport()} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent closeLabel={t('close')}>
          <DialogHeader>
            <DialogTitle>{t('resetData')}</DialogTitle>
            <DialogDescription>{t('resetDataConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={busy}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmReset()} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
