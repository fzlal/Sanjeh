import { useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  ClipboardPaste,
  FileCheck2,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { AnswerKey, Question } from '@/types';
import { countUnresolved, parseAnswerKey } from '@/lib/answerKey';
import { KEY_FILE_MAX_BYTES, FileReadError, readTextFile } from '@/lib/file';
import { copyText } from '@/lib/clipboard';
import { buildAnswerKeyPrompt } from '@/lib/prompts';
import { formatNumber } from '@/lib/format';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { AnswerKeyEditor } from '@/components/answer-key-editor';
import { answerKeyErrorText } from './answer-key-errors';
import { useToast } from '@/app/toast';

/**
 * Replaces the QZ1 answer key for an existing exam. The key stays a single
 * line for the whole sheet; the seed is internal and never surfaced.
 */
export function ImportDialog({
  open,
  onOpenChange,
  questions,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: Question[];
  onApply: (tokens: AnswerKey[]) => void;
}) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<AnswerKey[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reading, setReading] = useState(false);

  const count = questions.length;
  const prompt = buildAnswerKeyPrompt();

  const reset = () => {
    setRaw('');
    setFileName(null);
    setError(null);
    setParsed(null);
    setConfirming(false);
  };

  const validate = (text: string) => {
    setConfirming(false);
    const result = parseAnswerKey(text);
    if (!result.ok) {
      setParsed(null);
      setError(answerKeyErrorText(result.error, t, locale));
      return;
    }
    if (result.value.count !== count) {
      setParsed(null);
      setError(
        t('errQuestionCount', {
          keyCount: formatNumber(result.value.count, locale),
          examCount: formatNumber(count, locale),
        }),
      );
      return;
    }
    setError(null);
    setParsed(result.value.tokens);
  };

  const loadFile = async (file: File) => {
    setReading(true);
    try {
      const text = await readTextFile(file, KEY_FILE_MAX_BYTES);
      setFileName(file.name);
      setRaw(text);
      validate(text);
    } catch (issue) {
      setFileName(null);
      setParsed(null);
      setError(
        issue instanceof FileReadError && issue.code === 'tooLarge'
          ? t('fileTooLarge')
          : t('fileUnreadable'),
      );
    } finally {
      setReading(false);
    }
  };

  const copy = async (text: string) => {
    if (await copyText(text)) notify(t('copied'));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const unresolvedCount = countUnresolved(parsed ?? []);
  const excludedCount = parsed?.filter((token) => token.kind === 'excluded').length ?? 0;

  const updateKey = (id: string, key: AnswerKey) => {
    setParsed((current) =>
      current ? current.map((token, index) => (String(index) === id ? key : token)) : current,
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl" closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{t('importTitle')}</DialogTitle>
          <DialogDescription>{t('importDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-sm font-semibold">{t('answerKeyPromptTitle')}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('answerKeyPromptDesc')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void copy(prompt)}>
              <ClipboardCopy className="size-4" aria-hidden="true" />
              {t('copyPrompt')}
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-unanswered-border bg-unanswered-bg px-3 py-2 text-[11px] leading-relaxed text-unanswered">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{t('aiFallibleNote')}</span>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-correct-border bg-correct-bg px-3 py-2 text-[11px] leading-relaxed text-correct">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{t('aiAccuracyNote')}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('keyFileLabel')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={reading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-4" aria-hidden="true" />
              {t('chooseFile')}
            </Button>
            {fileName && (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-correct">
                <FileCheck2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{fileName}</span>
              </span>
            )}
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              accept=".txt,.qz1,text/plain"
              aria-label={t('keyFileLabel')}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void loadFile(file);
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="import-raw" className="text-sm font-medium">
            {t('pasteTitle')}
          </label>
          <Textarea
            id="import-raw"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setFileName(null);
              setError(null);
              setParsed(null);
              setConfirming(false);
            }}
            onBlur={() => raw.trim() && validate(raw)}
            placeholder={t('pasteHint')}
            rows={3}
            dir="ltr"
            className="font-mono text-xs"
            spellCheck={false}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-incorrect-border bg-incorrect-bg px-3 py-2 text-sm text-incorrect"
          >
            <p className="font-medium">{t('importErrorTitle')}</p>
            <p className="mt-0.5 text-xs">{error}</p>
          </div>
        )}

        {parsed && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t('importPreview')}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="tnum rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                  {formatNumber(count, locale)} {t('questionCount')}
                </span>
                {unresolvedCount > 0 && (
                  <span className="tnum rounded-full border border-unanswered-border bg-unanswered-bg px-2.5 py-0.5 text-xs text-unanswered">
                    {formatNumber(unresolvedCount, locale)} {t('unresolvedLabel')}
                  </span>
                )}
                {excludedCount > 0 && (
                  <span className="tnum rounded-full border border-excluded-border bg-excluded-bg px-2.5 py-0.5 text-xs text-excluded">
                    {formatNumber(excludedCount, locale)} {t('excludedLabel')}
                  </span>
                )}
              </div>
            </div>
            {unresolvedCount > 0 && (
              <div
                role="alert"
                className="flex items-start gap-1.5 rounded-md border border-unanswered-border bg-unanswered-bg px-2.5 py-2 text-[11px] leading-relaxed text-unanswered"
              >
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t('mustResolveUnresolved', {
                  count: formatNumber(unresolvedCount, locale),
                })}
              </div>
            )}
            <div className="rounded-lg border border-border">
              <div className="max-h-56 overflow-y-auto">
                <AnswerKeyEditor
                  items={parsed.map((token, index) => ({ id: String(index), key: token }))}
                  onChange={updateKey}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <span className="hidden text-[11px] text-muted-foreground sm:block">
            {formatNumber(count, locale)} {t('questionCount')}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => validate(raw)}
              disabled={!raw.trim() || reading}
            >
              <ClipboardPaste className="size-4" aria-hidden="true" />
              {t('validateAction')}
            </Button>
            <Button
              onClick={() => setConfirming(true)}
              disabled={!parsed || unresolvedCount > 0}
            >
              <Check className="size-4" aria-hidden="true" />
              {t('applyImport')}
            </Button>
          </div>
        </DialogFooter>

        {confirming && parsed && unresolvedCount === 0 && (
          <div className="rounded-lg border border-border bg-background/70 p-3">
            <p className="text-sm">
              {t('importConfirmDesc', { count: formatNumber(count, locale) })}
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onApply(parsed);
                  reset();
                  onOpenChange(false);
                }}
              >
                {t('confirm')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
