import { useCallback, useEffect, useRef, useState } from 'react';
import type { Exam, ExamSession } from '@/types';
import { settleSession } from '@/lib/session';
import { loadExams, loadSessions, saveSession } from '@/storage/db';

export interface AppData {
  exams: Exam[];
  sessions: ExamSession[];
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

const SWEEP_INTERVAL = 10_000;

/** Settles every active attempt against the clock and reports what changed. */
function settleAll(sessions: ExamSession[], now: number) {
  const changed: ExamSession[] = [];
  const next = sessions.map((session) => {
    const settled = settleSession(session, now);
    if (settled.changed) changed.push(settled.session);
    return settled.session;
  });
  return { sessions: next, changed };
}

export function useAppData(ready: boolean): AppData {
  const [exams, setExams] = useState<Exam[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const sessionsRef = useRef<ExamSession[]>(sessions);

  const persistSettled = useCallback((changed: ExamSession[]) => {
    if (changed.length === 0) return;
    void Promise.all(changed.map((session) => saveSession(session))).catch(() =>
      setError(true),
    );
  }, []);

  const applySessions = useCallback((next: ExamSession[]) => {
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [loadedExams, loadedSessions] = await Promise.all([loadExams(), loadSessions()]);
      const settled = settleAll(loadedSessions, Date.now());
      setExams(loadedExams);
      applySessions(settled.sessions);
      persistSettled(settled.changed);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [applySessions, persistSettled]);

  useEffect(() => {
    if (!ready) return;
    // oxlint-disable-next-line react/set-state-in-effect -- initial storage read once settings are ready
    void refresh();
  }, [ready, refresh]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const settled = settleAll(sessionsRef.current, Date.now());
      if (settled.changed.length === 0) return;
      applySessions(settled.sessions);
      persistSettled(settled.changed);
    }, SWEEP_INTERVAL);
    return () => window.clearInterval(timer);
  }, [ready, applySessions, persistSettled]);

  return { exams, sessions, loading, error, refresh };
}
