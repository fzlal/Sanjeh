import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-xl border border-glass-border bg-input/75 px-3.5 py-2 text-sm text-foreground shadow-[inset_0_1px_0_var(--glass-highlight)] backdrop-blur-md transition-colors placeholder:text-muted-foreground/70 hover:border-primary/25 focus-visible:border-primary/45 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-20 w-full resize-y rounded-xl border border-glass-border bg-input/75 px-3.5 py-2.5 text-sm text-foreground shadow-[inset_0_1px_0_var(--glass-highlight)] backdrop-blur-md transition-colors placeholder:text-muted-foreground/70 hover:border-primary/25 focus-visible:border-primary/45 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
