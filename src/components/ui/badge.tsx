import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-secondary-foreground',
        primary: 'border-transparent bg-primary/10 text-primary',
        correct: 'border-correct-border bg-correct-bg text-correct',
        incorrect: 'border-incorrect-border bg-incorrect-bg text-incorrect',
        unanswered: 'border-unanswered-border bg-unanswered-bg text-unanswered',
        excluded: 'border-excluded-border bg-excluded-bg text-excluded',
        outline: 'border-border bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
