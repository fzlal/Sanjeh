import { useState } from 'react';
import { Download } from 'lucide-react';
import type { StoredPdf } from '@/types';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { downloadPdf } from '@/lib/file';
import { formatBytes, formatNumber } from '@/lib/format';
import { useI18n } from '@/i18n';
import { useToast } from '@/app/toast';

/** Downloads a single PDF directly, or lists every titled PDF when there are several. */
export function PdfDownloadButton({
  pdfs,
  label,
  variant = 'outline',
  size = 'sm',
  iconOnly = false,
  compactOnMobile = false,
  disabled = false,
}: {
  pdfs: StoredPdf[];
  label: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  iconOnly?: boolean;
  compactOnMobile?: boolean;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);

  const download = (pdf: StoredPdf) => {
    if (!downloadPdf(pdf)) notify(t('downloadFailed'), 'error');
  };

  const activate = () => {
    if (pdfs.length === 1) download(pdfs[0]);
    else if (pdfs.length > 1) setOpen(true);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={activate}
        disabled={disabled || pdfs.length === 0}
        aria-label={label}
        title={label}
      >
        <Download aria-hidden="true" />
        {!iconOnly && (
          <span className={compactOnMobile ? 'hidden sm:inline' : undefined}>{label}</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('close')}>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {t('pdfCount', { count: formatNumber(pdfs.length, locale) })}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {pdfs.map((pdf, index) => (
              <li
                key={`${pdf.name}-${index}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pdf.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {pdf.name} · {formatBytes(pdf.size, locale)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => download(pdf)}
                  aria-label={`${t('download')} ${pdf.title}`}
                >
                  <Download aria-hidden="true" />
                  {t('download')}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
