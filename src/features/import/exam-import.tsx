import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCopy,
  ClipboardPaste,
  FileCheck2,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { Exam, StoredPdf } from '@/types';
import type { ParsedAnswerKey } from '@/lib/answerKey';
import { countUnresolved, parseAnswerKey } from '@/lib/answerKey';
import { totalQuestionCount } from '@/lib/booklets';
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
import { answerKeyErrorText } from './answer-key-errors';
import { useToast } from '@/app/toast';

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
  const [keyFileName, setKeyFileName] = useState<string | null>(null);
  const [keyRaw, setKeyRaw] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const questionCount = keyFile?.count ?? 0;
  const unresolvedCount = countUnresolved(keyItems.map((item) => item.key));
  const excludedCount =
    keyItems.filter((item) => item.key.kind === 'excluded').length;
  const assignedQuestions = totalQuestionCount(booklets);
  const bookletsReady =
    booklets.length > 0 &&
    booklets.every((booklet) => booklet.pdfs.length > 0 && booklet.questionCount > 0);
  const countsMatch = keyItems.length > 0 && assignedQuestions === keyItems.length;
  const ready =
    bookletsReady &&
    countsMatch &&
    answerPdfs.length > 0 &&
    keyItems.length > 0 &&
    unresolvedCount === 0 &&
    Boolean(title.trim());

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
    if (
      !bookletsReady ||
      !countsMatch ||
      answerPdfs.length === 0 ||
      keyItems.length === 0
    ) {
      return;
    }
    if (countUnresolved(keyItems.map((item) => item.key)) > 0) {
      setSheetOpen(true);
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setBusy(true);
    try {
      const now = Date.now();
      const exam: Exam = {
        id: createId(),
        title: cleanTitle,
        answerPdfs: answerPdfs.map((pdf) => ({
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
        questions: keyItems.map((item) => ({ id: item.id, key: item.key })),
        scheduling: { mode: 'immediate' },
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

      <div className="mb-6 max-w-3xl">
        <h1 className="text-xl font-semibold sm:text-2xl">{t('importExamTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('importExamDesc')}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          {t('filesLocalNote')}
        </p>
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

      <section aria-labelledby="import-booklets-heading" className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h2 id="import-booklets-heading" className="text-lg font-semibold">
              {t('booklets')}
            </h2>
            <span className="tnum text-sm text-muted-foreground">
              {formatNumber(booklets.length, locale)}
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
            {t('bookletFilesHint')}
          </span>
        </div>
        <BookletEditor
          booklets={booklets}
          onChange={(next) => {
            setBooklets(next);
            const firstPdf = next[0]?.pdfs[0];
            if (firstPdf && !title.trim()) setTitle(firstPdf.title);
          }}
          totalQuestions={keyItems.length}
        />
      </section>

      <div className="mb-4">
        <PdfGroupEditor
          title={t('answerBooklet')}
          hint={t('answerBookletHint')}
          icon={<BookOpen className="size-5" aria-hidden="true" />}
          pdfs={answerPdfs}
          onChange={setAnswerPdfs}
        />
      </div>

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
                <p className="mt-1 text-[11px] text-muted-foreground">{t('singleKeyNote')}</p>
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

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t('promptNote')}
          </p>

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
            <span className="text-[11px] text-muted-foreground">{t('keyFileHint')}</span>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{t('pasteHint')}</span>
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
                {unresolvedCount === 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-correct">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    {t('answerSheetReady')}
                  </span>
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
                <div className="flex flex-col gap-2 border-b border-border bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground sm:px-4">
                  {t('keyEditorHint')}
                </div>
                <AnswerKeyEditor items={keyItems} onChange={updateKey} />
              </KeySheetAccordion>
            </div>
          )}
        </CardContent>
      </Card>

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
