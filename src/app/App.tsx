import { useCallback, useState } from 'react';
import type { Exam, ExamSession } from '@/types';
import { useSettings } from './settings-provider';
import { useAppData } from './use-app-data';
import { useToast } from './toast';
import { Splash } from './splash';
import { AppShell } from './shell';
import { Onboarding } from '@/features/onboarding/onboarding';
import { Dashboard } from '@/features/dashboard/dashboard';
import { ExamEditor } from '@/features/editor/exam-editor';
import { ExamImport } from '@/features/import/exam-import';
import { ExamSessionScreen } from '@/features/exam/exam-session';
import { ResultsScreen } from '@/features/results/results-screen';
import { SettingsScreen } from '@/features/settings/settings-screen';
import { useI18n } from '@/i18n';
import { canStartExam } from '@/lib/scheduling';
import { createSession } from '@/lib/session';
import { createId } from '@/lib/id';
import {
  removeExam,
  removeSession,
  saveExam,
  saveSession,
} from '@/storage/db';

type Route =
  | { name: 'dashboard' }
  | { name: 'importExam' }
  | { name: 'editor'; examId: string }
  | { name: 'exam'; sessionId: string }
  | { name: 'results'; sessionId: string }
  | { name: 'settings' };

export function App() {
  const { t } = useI18n();
  const { notify } = useToast();
  const { settings, ready, storageFailed, reloadSettings } = useSettings();
  const { exams, sessions, loading, error, refresh } = useAppData(ready);
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [lastSubmitted, setLastSubmitted] = useState<ExamSession | undefined>();

  const goDashboard = useCallback(() => setRoute({ name: 'dashboard' }), []);
  const goSettings = useCallback(() => setRoute({ name: 'settings' }), []);
  const openResults = useCallback((session: ExamSession) => {
    setLastSubmitted(undefined);
    setRoute({ name: 'results', sessionId: session.id });
  }, []);

  const handleSubmitted = useCallback(
    (session: ExamSession) => {
      setLastSubmitted(session);
      setRoute({ name: 'results', sessionId: session.id });
      void refresh();
    },
    [refresh],
  );

  const startExam = useCallback(
    async (exam: Exam) => {
      const existing = sessions
        .filter((session) => session.examId === exam.id && session.status === 'active')
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      if (existing) {
        setRoute({ name: 'exam', sessionId: existing.id });
        return;
      }
      const check = canStartExam(exam);
      if (!check.ok) {
        notify(check.reason === 'ended' ? t('examEnded') : t('examNotStarted'), 'error');
        return;
      }
      const session = createSession(exam);
      try {
        await saveSession(session);
        await refresh();
        setRoute({ name: 'exam', sessionId: session.id });
      } catch {
        notify(t('storageUnavailable'), 'error');
      }
    },
    [notify, refresh, sessions, t],
  );

  const deleteExam = useCallback(
    async (exam: Exam) => {
      try {
        await removeExam(exam.id);
        const actives = sessions.filter(
          (session) => session.examId === exam.id && session.status === 'active',
        );
        await Promise.all(actives.map((session) => removeSession(session.id)));
        await refresh();
      } catch {
        notify(t('storageUnavailable'), 'error');
      }
    },
    [notify, refresh, sessions, t],
  );

  const duplicateExam = useCallback(
    async (exam: Exam) => {
      const now = Date.now();
      const copy: Exam = {
        ...structuredClone(exam),
        id: createId(),
        title: `${exam.title} · ${t('duplicate')}`,
        questions: exam.questions.map((question) => ({
          ...structuredClone(question),
          id: createId(),
        })),
        createdAt: now,
        updatedAt: now,
      };
      try {
        await saveExam(copy);
        await refresh();
      } catch {
        notify(t('storageUnavailable'), 'error');
      }
    },
    [notify, refresh, t],
  );

  const importExam = useCallback(
    async (exam: Exam) => {
      try {
        await saveExam(exam);
        await refresh();
        notify(t('examImported'));
        goDashboard();
      } catch {
        notify(t('storageUnavailable'), 'error');
      }
    },
    [goDashboard, notify, refresh, t],
  );

  if (!ready) return <Splash />;
  if (!settings.onboardingComplete) return <Onboarding />;

  if (route.name === 'exam') {
    return (
      <ExamSessionScreen
        sessionId={route.sessionId}
        onExit={() => {
          void refresh();
          goDashboard();
        }}
        onSubmitted={handleSubmitted}
      />
    );
  }

  const alert = storageFailed || error;
  const reviewSession =
    route.name === 'results'
      ? lastSubmitted && lastSubmitted.id === route.sessionId
        ? lastSubmitted
        : sessions.find((session) => session.id === route.sessionId)
      : undefined;
  const reviewExam = reviewSession
    ? exams.find((exam) => exam.id === reviewSession.examId)
    : undefined;

  return (
    <AppShell
      current={
        route.name === 'dashboard' ? 'dashboard' : route.name === 'settings' ? 'settings' : 'other'
      }
      onHome={goDashboard}
      onSettings={goSettings}
      alert={alert}
    >
      <div
        key={route.name === 'editor' ? `editor-${route.examId}` : route.name}
        className="animate-fade-up"
      >
      {route.name === 'dashboard' && (
        <Dashboard
          exams={exams}
          sessions={sessions}
          loading={loading}
          onCreate={() => setRoute({ name: 'importExam' })}
          onEdit={(exam) => setRoute({ name: 'editor', examId: exam.id })}
          onDuplicate={(exam) => void duplicateExam(exam)}
          onDelete={(exam) => void deleteExam(exam)}
          onStart={(exam) => void startExam(exam)}
          onResume={(session) => setRoute({ name: 'exam', sessionId: session.id })}
          onReview={openResults}
        />
      )}

      {route.name === 'settings' && (
        <SettingsScreen
          exams={exams}
          sessions={sessions}
          onDataReplaced={() => {
            void reloadSettings();
            void refresh();
          }}
        />
      )}

      {route.name === 'results' && (
        <ResultsScreen
          sessionId={route.sessionId}
          exam={reviewExam}
          fallbackSession={
            lastSubmitted && lastSubmitted.id === route.sessionId ? lastSubmitted : undefined
          }
          onBack={goDashboard}
          onSessionUpdated={() => void refresh()}
        />
      )}

      {route.name === 'importExam' && (
        <ExamImport onCancel={goDashboard} onCreate={importExam} />
      )}

      {route.name === 'editor' &&
        (() => {
          const editing = exams.find((exam) => exam.id === route.examId);
          if (!editing) {
            if (loading) return null;
            return (
              <div className="page-container flex flex-col items-center gap-4 py-20 text-center">
                <p className="text-sm text-muted-foreground">{t('notFound')}</p>
              </div>
            );
          }
          return (
            <ExamEditor
              key={editing.id}
              exam={editing}
              onDone={() => {
                void refresh();
                goDashboard();
              }}
              onCancel={goDashboard}
            />
          );
        })()}
      </div>
    </AppShell>
  );
}
