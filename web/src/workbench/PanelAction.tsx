import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** A small icon button for panel headers (terminal, output, preview). */
export function PanelAction({ label, onClick, children, disabled, pressed, className }: {
  label: string; onClick: () => void; children: ReactNode; disabled?: boolean; pressed?: boolean; className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button" aria-label={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}
          className={cn(
            'text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 inline-flex size-6 shrink-0 items-center justify-center rounded outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5',
            className,
          )}
        >{children}</button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
