import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Settings } from '@/types';
import { readSettingsRecord, writeSettingsRecord } from '@/storage/db';
import { readBootSettings, writeBootSettings, DEFAULT_SETTINGS } from '@/storage/boot';
import { applyTheme, resolveAppearance } from '@/themes';
import { asSettings } from '@/storage/backup';

export interface SettingsContextValue {
  settings: Settings;
  ready: boolean;
  storageFailed: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  reloadSettings: () => Promise<void>;
  replaceSettings: (settings: Settings) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function prefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => readBootSettings());
  const [ready, setReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persist = useCallback((next: Settings) => {
    writeBootSettings(next);
    writeSettingsRecord(next).catch(() => setStorageFailed(true));
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const replaceSettings = useCallback(
    (next: Settings) => {
      setSettings(next);
      writeBootSettings(next);
    },
    [],
  );

  const reloadSettings = useCallback(async () => {
    try {
      const stored = await readSettingsRecord();
      if (stored) {
        const validated = asSettings(stored);
        setSettings(validated);
        writeBootSettings(validated);
      }
    } catch {
      setStorageFailed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    readSettingsRecord()
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          try {
            const validated = asSettings(stored);
            setSettings(validated);
            writeBootSettings(validated);
          } catch {
            setSettings(DEFAULT_SETTINGS);
          }
        } else {
          writeSettingsRecord(settingsRef.current).catch(() => setStorageFailed(true));
        }
      })
      .catch(() => {
        if (!cancelled) setStorageFailed(true);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      applyTheme(settings.theme, resolveAppearance(settings.appearance, prefersDark()));
    };
    apply();
    if (settings.appearance !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => apply();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [settings.theme, settings.appearance]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      ready,
      storageFailed,
      updateSettings,
      reloadSettings,
      replaceSettings,
    }),
    [settings, ready, storageFailed, updateSettings, reloadSettings, replaceSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}
