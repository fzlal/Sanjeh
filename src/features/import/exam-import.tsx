import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ClipboardPaste,
  EyeOff,
  FileCheck2,
  KeyRound,
  PenLine,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { AnswerKey, AnswerKeyMode, Exam, Question, Scheduling, StoredPdf } from '@/types';
import { ANSWER_KEY_MODES } from '@/types';
import type { ParsedAnswerKey } from '@/lib/answerKey';
import { countUnresolved, parseAnswerKey } from '@/lib/answerKey';
import { totalDurationMinutes, totalQuestionCount } from '@/lib/booklets';
import { validateSchedule } from '@/lib/scheduling';
import { KEY_FILE_MAX_BYTES, FileReadError, defaultPdfTitle, readTextFile } from '@/lib/file';
import { createId } from '@/lib/id';
import { buildAnswerKeyPrompt } from '@/lib/prompts';
import { copyText } from '@/lib/clipboard';
import { formatNumber } from '@/lib/format';
import { useI18n } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnswerKeyEditor, type AnswerKeyEditorItem } from '@/components/answer-key-editor';
import { BookletEditor, createBookletDraft, type BookletDraft } from '@/components/booklet-editor';
import { KeySheetAccordion } from '@/components/key-sheet-accordion';
import { PdfGroupEditor } from '@/components/pdf-group-editor';
import { SchedulingEditor } from '@/components/scheduling-editor';
import { answerKeyErrorText } from './answer-key-errors';
import { useToast } from '@/app/toast';
import { cn } from '@/lib/utils';

export function ExamImport({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (exam: Exam) => Promise<void>;
}) {
  const { t, dir, locale } = useI18n();
  const { notify } = useToast();
  const keyInput = useRef<HTMLInputElement>(null);
  const [booklets, setBooklets] = useState<BookletDraft[]>(() => [createBookletDraft()]);
  const [answerPdfs, setAnswerPdfs] = useState<StoredPdf[]>([]);
  const [keyFile, setKeyFile] = useState<ParsedAnswerKey | null>(null);
  const [keyItems, setKeyItems] = useState<AnswerKeyEditorItem[]>([]);
  const [manualKeys, setManualKeys] = useState<AnswerKey[]>([]);
  const [keyMode, setKeyMode] = useState<AnswerKeyMode>('none');
  const [keyFileName, setKeyFileName] = useState<string | null>(null);
  const [keyRaw, setKeyRaw] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduling, setScheduling] = useState<Scheduling>({ mode: 'immediate' });
  const [busy, setBusy] = useState(false);

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const assignedQuestions = totalQuestionCount(booklets);
  const manualItems = useMemo<AnswerKeyEditorItem[]>(
    () =>
      Array.from({ length: assignedQuestions }, (_, index) => ({
        id: `manual-${index}`,
        key: manualKeys[index] ?? { kind: 'unresolved' },
      })),
    [assignedQuestions, manualKeys],
  );
  const activeKeys =
    keyMode === 'qz1'
      ? keyItems.map((item) => item.key)
      : keyMode === 'manual'
        ? manualItems.map((item) => item.key)
        : [];
  const questionCount = keyMode === 'qz1' ? (keyFile?.count ?? 0) : assignedQuestions;
  const unresolvedCount = countUnresolved(activeKeys);
  const excludedCount = activeKeys.filter((key) => key.kind === 'excluded').length;
  const totalDuration = useMemo(() => totalDurationMinutes(booklets), [booklets]);
  const schedule = useMemo(
    () => validateSchedule(scheduling, totalDuration),
    [scheduling, totalDuration],
  );
  const bookletsReady =
    booklets.length > 0 && booklets.every((booklet) => booklet.questionCount > 0);
  const countsMatch =
    keyMode === 'qz1' && keyItems.length > 0 && assignedQuestions === keyItems.length;
  const keysReady =
    keyMode === 'qz1'
      ? countsMatch
      : keyMode === 'manual'
        ? assignedQuestions > 0 && unresolvedCount === 0
        : true;
  const ready =
    bookletsReady && keysReady && schedule.errors.length === 0 && Boolean(title.trim());

  const setParsedKey = (parsed: ParsedAnswerKey) => {
    setKeyFile(parsed);
    setKeyItems(parsed.tokens.map((token) => ({ id: createId(), key: token })));
    setBooklets((current) =>
      current.length === 1
        ? [{ ...current[0], questionCount: parsed.count }]
        : current,
    );
    if (countUnresolved(parsed.tokens) > 0) setSheetOpen(true);
  };

  const updateKey = (id: string, key: AnswerKeyEditorItem['key']) => {
    setKeyItems((current) =>
      current.map((item) => (item.id === id ? { ...item, key } : item)),
    );
  };

  const changeMode = (mode: AnswerKeyMode) => {
    setKeyMode(mode);
    setKeyError(null);
    if (mode === 'manual') setSheetOpen(true);
  };

  const updateManualKey = (id: string, key: AnswerKey) => {
    const index = Number(id.slice('manual-'.length));
    if (!Number.isInteger(index) || index < 0 || index >= assignedQuestions) return;
    setManualKeys((current) => {
      const next: AnswerKey[] = Array.from(
        { length: assignedQuestions },
        (_, position) => current[position] ?? { kind: 'unresolved' },
      );
      next[index] = key;
      return next;
    });
  };

  const copyPrompt = async () => {
    if (await copyText(buildAnswerKeyPrompt())) notify(t('copied'));
  };

  const applyKeyText = (text: string, fileName: string | null) => {
    const result = parseAnswerKey(text);
    if (!result.ok) {
      setKeyFile(null);
      setKeyItems([]);
      setKeyFileName(fileName);
      setKeyRaw(text);
      setKeyError(answerKeyErrorText(result.error, t, locale));
      return;
    }
    setParsedKey(result.value);
    setKeyFileName(fileName);
    setKeyRaw(text);
    setKeyError(null);
  };

  const loadKeyFile = async (file: File) => {
    try {
      const text = await readTextFile(file, KEY_FILE_MAX_BYTES);
      applyKeyText(text, file.name);
    } catch (error) {
      setKeyFile(null);
      setKeyFileName(null);
      setKeyError(
        error instanceof FileReadError && error.code === 'tooLarge'
          ? t('fileTooLarge')
          : t('fileUnreadable'),
      );
    }
  };

  const validateRaw = () => {
    const result = parseAnswerKey(keyRaw);
    if (!result.ok) {
      setKeyFile(null);
      setKeyItems([]);
      setKeyError(answerKeyErrorText(result.error, t, locale));
      return;
    }
    setParsedKey(result.value);
    setKeyFileName(null);
    setKeyError(null);
  };

  const create = async () => {
    if (!bookletsReady || schedule.errors.length > 0) return;
    if (keyMode === 'qz1' && !countsMatch) return;
    if (keyMode === 'manual' && (assignedQuestions === 0 || unresolvedCount > 0)) {
      setSheetOpen(true);
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setBusy(true);
    try {
      const now = Date.now();
      const questions: Question[] =
        keyMode === 'qz1'
          ? keyItems.map((item) => ({ id: item.id, key: item.key }))
          : keyMode === 'manual'
            ? manualItems.map((item) => ({ id: createId(), key: item.key }))
            : Array.from({ length: assignedQuestions }, () => ({
                id: createId(),
                key: { kind: 'unresolved' as const },
              }));
      const exam: Exam = {
        id: createId(),
        title: cleanTitle,
        answerKeyMode: keyMode,
        answerPdfs:
          keyMode === 'none'
            ? []
            : answerPdfs.map((pdf) => ({
                ...pdf,
                title: pdf.title.trim() || defaultPdfTitle(pdf.name),
              })),
        booklets: booklets.map((booklet, index) => ({
          id: booklet.id,
          title:
            booklet.title.trim() ||
            t('bookletN', { n: formatNumber(index + 1, locale) }),
          pdfs: booklet.pdfs.map((pdf) => ({
            ...pdf,
            title: pdf.title.trim() || defaultPdfTitle(pdf.name),
          })),
          questionCount: booklet.questionCount,
          durationMinutes: booklet.durationMinutes,
        })),
        questions,
        scheduling,
        createdAt: now,
        updatedAt: now,
      };
      const cleanDescription = description.trim();
      if (cleanDescription) exam.description = cleanDescription;
      await onCreate(exam);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-container stagger pb-28 pt-6 sm:pt-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <BackIcon className="size-4" aria-hidden="true" />
            {t('back')}
          </Button>
          <span className="text-sm text-muted-foreground">{t('importExamTitle')}</span>
        </div>
        <Button onClick={() => void create()} disabled={!ready || busy}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t('createExam')}
        </Button>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('examDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-title">{t('examTitle')}</Label>
            <Input
              id="import-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('examTitlePlaceholder')}
              maxLength={300}
              aria-required="true"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="import-description">
              {t('examDescription')}{' '}
              <span className="text-muted-foreground">({t('optional')})</span>
            </Label>
            <Input
              id="import-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('examDescriptionPlaceholder')}
              maxLength={4000}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t('answerKeyMode')}</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('answerKeyModeHint')}
          </p>
        </CardHeader>
        <CardContent>
          <fieldset>
            <legend className="sr-only">{t('answerKeyMode')}</legend>
            <div data-key-mode className="grid gap-2 sm:grid-cols-3">
              {ANSWER_KEY_MODES.map((mode) => {
                const Icon =
                  mode === 'qz1' ? Sparkles : mode === 'manual' ? PenLine : EyeOff;
                const label =
                  mode === 'qz1'
                    ? t('keyModeQz1')
                    : mode === 'manual'
                      ? t('keyModeManual')
                      : t('keyModeNone');
                const description =
                  mode === 'qz1'
                    ? t('keyModeQz1Desc')
                    : mode === 'manual'
                      ? t('keyModeManualDesc')
                      : t('keyModeNoneDesc');
                const active = keyMode === mode;
                return (
                  <label
                    key={mode}
                    data-mode={mode}
                    className={cn(
                      'relative flex cursor-pointer flex-col gap-1.5 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary/40',
                      active
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background/50 hover:border-primary/40',
                    )}
                  >
                    <input
                      type="radio"
                      name="answer-key-mode"
                      value={mode}
                      checked={active}
                      onChange={() => changeMode(mode)}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon
                        className={cn(
                          'size-4 shrink-0',
                          active ? 'text-primary' : 'text-muted-foreground',
                        )}
                        aria-hidden="true"
                      />
                      {label}
                      {active && (
                        <Check className="ms-auto size-4 text-primary" aria-hidden="true" />
                      )}
                    </span>
                    <span className="text-[11px] leading-relaxed text-muted-foreground">
                      {description}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <div className="mb-4">
        <SchedulingEditor
          scheduling={scheduling}
          durationMinutes={totalDuration}
          onChange={setScheduling}
          idPrefix="import-schedule"
        />
      </div>

      <section aria-labelledby="import-booklets-heading" className="mb-4 flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="import-booklets-heading" className="text-lg font-semibold">
            {t('booklets')}
          </h2>
          <span className="tnum text-sm text-muted-foreground">
            {formatNumber(booklets.length, locale)}
          </span>
        </div>
        <BookletEditor
          booklets={booklets}
          onChange={(next) => {
            setBooklets(next);
            const firstPdf = next[0]?.pdfs[0];
            if (firstPdf && !title.trim()) setTitle(firstPdf.title);
          }}
          totalQuestions={keyMode === 'qz1' ? keyItems.length : assignedQuestions}
        />
      </section>

      {keyMode !== 'none' && (
        <div className="mb-4">
          <PdfGroupEditor
            title={t('answerBooklet')}
            hint={
              keyMode === 'manual' ? t('answerBookletManualHint') : t('answerBookletHint')
            }
            icon={<BookOpen className="size-5" aria-hidden="true" />}
            pdfs={answerPdfs}
            onChange={setAnswerPdfs}
          />
        </div>
      )}

      {keyMode === 'manual' && (
        <Card className="mb-4">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                  <PenLine className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <CardTitle>{t('manualKeyTitle')}</CardTitle>
                  <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                    {t('manualKeyDesc')}
                  </p>
                </div>
              </div>
              <Badge variant="primary">
                {formatNumber(questionCount, locale)} {t('questionCount')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {assignedQuestions === 0 ? (
              <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                {t('manualKeyEmpty')}
              </p>
            ) : (
              <>
                {unresolvedCount > 0 ? (
                  <div
                    role="alert"
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-unanswered-border bg-unanswered-bg px-3 py-2 text-xs leading-relaxed text-unanswered"
                  >
                    <span className="flex items-start gap-1.5">
                      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {t('mustResolveUnresolved', {
                        count: formatNumber(unresolvedCount, locale),
                      })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSheetOpen(true)}
                    >
                      {t('openKeyEditor')}
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-correct">
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                    {t('manualKeyReady')}
                  </p>
                )}

                {excludedCount > 0 && (
                  <span className="text-xs text-excluded">
                    {t('excludedLabel')} · {formatNumber(excludedCount, locale)}
                  </span>
                )}

                <KeySheetAccordion
                  count={questionCount}
                  title={t('manualKeyTitle')}
                  subtitle={t('manualKeyPreviewSubtitle')}
                  open={sheetOpen}
                  onOpenChange={setSheetOpen}
                >
                  <div className="flex items-start gap-1.5 border-b border-border bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground sm:px-4">
                    <PenLine className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {t('manualKeyEditorHint')}
                  </div>
                  <AnswerKeyEditor items={manualItems} onChange={updateManualKey} single />
                </KeySheetAccordion>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {keyMode === 'none' && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-start gap-3 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
              <EyeOff className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold">{t('keyModeNone')}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t('noKeyExamNote')}
              </p>
            </div>
            <Badge variant="outline" className="tnum shrink-0">
              {formatNumber(questionCount, locale)} {t('questionCount')}
            </Badge>
          </CardContent>
        </Card>
      )}

      {keyMode === 'qz1' && (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                <KeyRound className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <CardTitle>{t('answerKeyPromptTitle')}</CardTitle>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
                  {t('answerKeyPromptDesc')}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void copyPrompt()}>
              <ClipboardCopy className="size-4" aria-hidden="true" />
              {t('copyPrompt')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-start gap-2 rounded-md border border-correct-border bg-correct-bg px-3 py-2 text-[11px] leading-relaxed text-correct">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{t('aiAccuracyNote')}</span>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-unanswered-border bg-unanswered-bg px-3 py-2 text-[11px] leading-relaxed text-unanswered">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{t('aiFallibleNote')}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => keyInput.current?.click()}
            >
              <Upload className="size-4" aria-hidden="true" />
              {t('chooseFile')}
            </Button>
            {keyFileName && (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-correct">
                <FileCheck2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{keyFileName}</span>
              </span>
            )}
            <input
              ref={keyInput}
              type="file"
              className="sr-only"
              accept=".txt,.qz1,text/plain"
              aria-label={t('keyFileLabel')}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void loadKeyFile(file);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="key-raw">{t('pasteTitle')}</Label>
            <Textarea
              id="key-raw"
              value={keyRaw}
              onChange={(event) => {
                const value = event.target.value;
                setKeyRaw(value);
                setKeyFileName(null);
                if (!value.trim()) {
                  setKeyFile(null);
                  setKeyItems([]);
                  setKeyError(null);
                  return;
                }
                const result = parseAnswerKey(value);
                if (result.ok) {
                  setParsedKey(result.value);
                } else {
                  setKeyFile(null);
                  setKeyItems([]);
                }
                setKeyError(null);
              }}
              onBlur={() => {
                if (keyRaw.trim() && !keyFile) validateRaw();
              }}
              placeholder={t('pasteHint')}
              rows={2}
              dir="ltr"
              className="font-mono text-xs"
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={validateRaw}
                disabled={!keyRaw.trim()}
              >
                <ClipboardPaste className="size-4" aria-hidden="true" />
                {t('validateAction')}
              </Button>
            </div>
          </div>

          {keyError && (
            <div
              role="alert"
              className="rounded-md border border-incorrect-border bg-incorrect-bg px-3 py-2 text-sm text-incorrect"
            >
              {keyError}
            </div>
          )}

          {keyItems.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">
                  {formatNumber(questionCount, locale)} {t('questionCount')}
                </Badge>
                {unresolvedCount > 0 && (
                  <Badge variant="unanswered">
                    {t('unresolvedLabel')} · {formatNumber(unresolvedCount, locale)}
                  </Badge>
                )}
                {excludedCount > 0 && (
                  <Badge variant="excluded">
                    {t('excludedLabel')} · {formatNumber(excludedCount, locale)}
                  </Badge>
                )}
              </div>

              {unresolvedCount > 0 && (
                <div
                  role="alert"
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-unanswered-border bg-unanswered-bg px-3 py-2 text-xs leading-relaxed text-unanswered"
                >
                  <span className="flex items-start gap-1.5">
                    <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {t('mustResolveUnresolved', {
                      count: formatNumber(unresolvedCount, locale),
                    })}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
                    {t('openKeyEditor')}
                  </Button>
                </div>
              )}

              <KeySheetAccordion
                count={keyItems.length}
                subtitle={t('keyPreviewSubtitle')}
                open={sheetOpen}
                onOpenChange={setSheetOpen}
              >
                <AnswerKeyEditor items={keyItems} onChange={updateKey} />
              </KeySheetAccordion>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button onClick={() => void create()} disabled={!ready || busy}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t('createExam')}
        </Button>
      </div>
    </div>
  );
}
