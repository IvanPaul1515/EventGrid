import { useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './scanner.css';

export function ScannerDialog({ label, children, onCancel, wide=false }: { label: string; children: ReactNode; onCancel?: () => void; wide?:boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel); cancel.current = onCancel;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || []);
    (controls()[0] || ref.current)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cancel.current?.(); }
      if (event.key !== 'Tab') return;
      const elements = controls(), first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="scanner-ui scanner-overlay fixed inset-x-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center"><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={(wide?'max-w-4xl p-4 space-y-3':'max-w-md p-5 sm:p-6 space-y-4')+' w-full min-w-0 max-h-full overflow-y-auto overflow-x-hidden bg-card text-foreground border border-border rounded-2xl shadow-2xl'}>{children}</div></div>, document.body);
}
