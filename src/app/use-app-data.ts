import { useCallback, useEffect, useState } from 'react';
import type { Exam, ExamSession } from '@/types';
import { loadExams, loadSessions } from '@/storage/db';

export interface AppData {
  exams: Exam[];
  sessions: ExamSession[];
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

export function useAppData(ready: boolean): AppData {
  const [exams, setExams] = useState<Exam[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [loadedExams, loadedSessions] = await Promise.all([loadExams(), loadSessions()]);
      setExams(loadedExams);
      setSessions(loadedSessions);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    // oxlint-disable-next-line react/set-state-in-effect -- initial IndexedDB read once settings are ready
    void refresh();
  }, [ready, refresh]);

  return { exams, sessions, loading, error, refresh };
}
