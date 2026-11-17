import type { ReactNode } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { FileTab } from './Explorer';
import { FileIcon } from './workbench/FileIcon';

export interface PaletteCommand {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  run: () => void;
}

const base = (name: string) => name.slice(name.lastIndexOf('/') + 1);
const folderOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '');

// Ctrl+P: type a few letters of a file to open it, or the name of a command to run it.
export function CommandPalette({ files, activeKey, commands, onPick, onClose }: {
  files: FileTab[];
  activeKey: string;
  commands: PaletteCommand[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const done = (fn: () => void) => { onClose(); fn(); };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Go to file or run a command</DialogTitle>
        <DialogDescription className="sr-only">Type a file name or a command.</DialogDescription>
        <Command
          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-item]]:h-7 [&_[cmdk-item]]:py-0 [&_[cmdk-item]]:text-[13px]"
          filter={(value, search) => {
            // Files and commands are matched on their visible text; letters in order are enough.
            const v = value.toLowerCase();
            const q = search.toLowerCase().trim();
            if (!q) return 1;
            if (v.includes(q)) return 1;
            let at = 0;
            for (const ch of q) { at = v.indexOf(ch, at); if (at < 0) return 0; at++; }
            return 0.5;
          }}
        >
          <CommandInput placeholder="Go to file or run a command…" className="h-10 text-[13px]" />
          <CommandList className="max-h-[min(420px,60svh)]">
            <CommandEmpty className="py-6 text-center text-xs">Nothing matches.</CommandEmpty>
            <CommandGroup heading="Files">
              {files.map(f => (
                <CommandItem key={f.key} value={`file ${f.name}`} onSelect={() => done(() => onPick(f.key))}>
                  <FileIcon name={f.name} />
                  <span className="truncate">{base(f.name)}</span>
                  <span className="text-muted-foreground truncate text-xs">{folderOf(f.name)}</span>
                  {f.key === activeKey && <span className="text-muted-foreground ml-auto text-[11px]">open</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Commands">
              {commands.map(c => (
                <CommandItem key={c.id} value={`command ${c.label}`} onSelect={() => done(c.run)}>
                  <span className="text-muted-foreground [&_svg]:size-4">{c.icon}</span>
                  {c.label}
                  {c.shortcut && <CommandShortcut className="text-[11px]">{c.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
