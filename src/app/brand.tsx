import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-[10px] border border-primary/20 bg-primary text-primary-foreground shadow-soft',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 17.5 9 12l3.2 3.2L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 6.5v11h16" strokeLinecap="round" opacity="0.45" />
      </svg>
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-bold tracking-tight">سنجه</span>
        {!compact && (
          <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            SANJEH
          </span>
        )}
      </span>
    </span>
  );
}
