import { useRef, useState, type ReactNode } from 'react';
import { Download, FileCheck2, FilePlus2, Trash2 } from 'lucide-react';
import type { StoredPdf } from '@/types';
import {
  FileReadError,
  MAX_PDFS_PER_GROUP,
  defaultPdfTitle,
  downloadPdf,
  readPdfFile,
} from '@/lib/file';
import { formatBytes, formatNumber } from '@/lib/format';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/app/toast';

function readErrorMessage(error: unknown, t: ReturnType<typeof useI18n>['t']): string {
  if (error instanceof FileReadError) {
    if (error.code === 'tooLarge') return t('fileTooLarge');
    if (error.code === 'notPdf') return t('pdfOnly');
  }
  return t('fileUnreadable');
}

/** Edits one booklet's PDFs; every file carries an editable title. */
export function PdfGroupEditor({
  title,
  hint,
  icon,
  pdfs,
  onChange,
  embedded = false,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  pdfs: StoredPdf[];
  onChange: (pdfs: StoredPdf[]) => void;
  /** Drops the outer card when the editor sits inside a booklet card. */
  embedded?: boolean;
}) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remaining = MAX_PDFS_PER_GROUP - pdfs.length;
  const atLimit = remaining <= 0;

  const addFiles = async (list: File[]) => {
    setError(null);
    const files = list.slice(0, remaining);
    if (files.length === 0) return;
    const limitError =
      files.length < list.length
        ? t('pdfLimit', { max: formatNumber(MAX_PDFS_PER_GROUP, locale) })
        : null;
    setBusy(true);
    try {
      const results = await Promise.allSettled(files.map((file) => readPdfFile(file)));
      const added: StoredPdf[] = [];
      let failure: unknown;
      for (const result of results) {
        if (result.status === 'fulfilled') added.push(result.value);
        else if (failure === undefined) failure = result.reason;
      }
      setError(failure !== undefined ? readErrorMessage(failure, t) : limitError);
      if (added.length > 0) onChange([...pdfs, ...added]);
    } finally {
      setBusy(false);
    }
  };

  const download = (pdf: StoredPdf) => {
    if (!downloadPdf(pdf)) notify(t('downloadFailed'), 'error');
  };

  const rename = (index: number, value: string) => {
    onChange(pdfs.map((pdf, position) => (position === index ? { ...pdf, title: value } : pdf)));
  };

  const restoreTitle = (index: number) => {
    const pdf = pdfs[index];
    if (!pdf || pdf.title.trim()) return;
    rename(index, defaultPdfTitle(pdf.name));
  };

  const remove = (index: number) => {
    setError(null);
    onChange(pdfs.filter((_, position) => position !== index));
  };

  return (
    <section
      className={
        embedded
          ? 'rounded-lg border border-border/70 bg-background/40 p-3 sm:p-4'
          : 'rounded-xl border border-border bg-surface p-4 sm:p-5'
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {t('pdfCount', { count: formatNumber(pdfs.length, locale) })}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
        </div>
      </div>

      {pdfs.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-4 flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-xs text-muted-foreground transition-[border-color,color,background-color,transform] duration-200 hover:border-primary/40 hover:bg-secondary/30 hover:text-foreground active:scale-[0.995] disabled:opacity-60"
        >
          <FilePlus2 className="size-5" aria-hidden="true" />
          {t('pdfEmpty')}
          <span className="font-medium text-primary">{t('addPdf')}</span>
        </button>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {pdfs.map((pdf, index) => (
            <li
              key={`${pdf.name}-${index}`}
              className="animate-fade-up rounded-lg border border-border bg-background/60 p-2"
            >
              <div className="flex items-center gap-1.5">
                <FileCheck2 className="ms-1 size-4 shrink-0 text-correct" aria-hidden="true" />
                <Input
                  value={pdf.title}
                  onChange={(event) => rename(index, event.target.value)}
                  onBlur={() => restoreTitle(index)}
                  aria-label={`${t('pdfTitle')} ${formatNumber(index + 1, locale)}`}
                  placeholder={t('pdfTitlePlaceholder')}
                  maxLength={300}
                  className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-medium shadow-none focus-visible:border-border"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t('download')} ${pdf.title}`}
                  title={t('download')}
                  onClick={() => download(pdf)}
                >
                  <Download className="size-4 text-muted-foreground" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t('removePdf')} ${pdf.title}`}
                  title={t('removePdf')}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              </div>
              <p className="mt-0.5 truncate ps-7 text-[11px] text-muted-foreground">
                {pdf.name} · {formatBytes(pdf.size, locale)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {t('pdfLimit', { max: formatNumber(MAX_PDFS_PER_GROUP, locale) })}
        </span>
        {pdfs.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            disabled={atLimit || busy}
            onClick={() => inputRef.current?.click()}
          >
            <FilePlus2 className="size-4" aria-hidden="true" />
            {t('addPdf')}
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="application/pdf,.pdf"
        multiple
        aria-label={title}
        onChange={(event) => {
          // FileList is live: copy it before clearing the input for the next pick.
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) void addFiles(files);
        }}
      />

      {error && (
        <p role="alert" className="animate-fade-in mt-2 text-xs text-incorrect">
          {error}
        </p>
      )}
    </section>
  );
}
