import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { Language } from '@/api';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// A searchable list of languages and frameworks; picking one opens its editor.
export function LanguagePicker({ current, languages, onPick }: { current: Language; languages: Language[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button" aria-label="Language or framework"
          className="hover:bg-accent focus-visible:ring-ring/50 inline-flex h-6 max-w-52 items-center gap-1 rounded px-2 text-[12px] outline-none focus-visible:ring-2"
        >
          <span className="truncate font-medium">{current.name}</span>
          {current.version && <span className="text-muted-foreground hidden sm:inline">{current.version}</span>}
          <ChevronsUpDown className="text-muted-foreground size-3 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command className="[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-item]]:h-7 [&_[cmdk-item]]:py-0 [&_[cmdk-item]]:text-[13px]">
          <CommandInput placeholder="Search…" className="h-9 text-[13px]" />
          <CommandList className="max-h-80">
            <CommandEmpty className="py-4 text-center text-xs">No match.</CommandEmpty>
            {(['language', 'framework'] as const).map(group => (
              <CommandGroup key={group} heading={group === 'language' ? 'Languages' : 'Frameworks'}>
                {languages.filter(l => l.group === group).map(l => (
                  <CommandItem
                    key={l.id} value={`${l.name} ${l.id}`} disabled={!l.installed}
                    onSelect={() => { setOpen(false); if (l.id !== current.id) onPick(l.id); }}
                  >
                    <Check className={cn('size-3.5', l.id === current.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{l.name}</span>
                    <span className="text-muted-foreground ml-auto text-[11px]">{l.installed ? l.version ?? '' : 'not installed'}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
