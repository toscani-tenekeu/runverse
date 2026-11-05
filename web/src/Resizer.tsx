import type { KeyboardEvent, PointerEvent } from 'react';

interface Props {
  axis: 'x' | 'y';
  label: string;
  onResize: (delta: number) => void; // pixels moved since the last call
  className?: string;
}

// A drag handle between two panes. Also works with arrow keys for keyboard users.
export function Resizer({ axis, label, onResize, className = '' }: Props) {
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let last = axis === 'x' ? e.clientX : e.clientY;
    document.body.classList.add(`resizing-${axis}`);
    const move = (ev: globalThis.PointerEvent) => {
      const pos = axis === 'x' ? ev.clientX : ev.clientY;
      onResize(pos - last);
      last = pos;
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove(`resizing-${axis}`);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const i = keys.indexOf(e.key);
    if (i < 0) return;
    e.preventDefault();
    onResize(i ? step : -step);
  };

  return (
    <div
      className={`resizer resizer-${axis} ${className}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      onPointerDown={down}
      onKeyDown={key}
    />
  );
}
