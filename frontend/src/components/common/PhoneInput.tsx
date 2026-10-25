import React, { useLayoutEffect, useRef } from 'react';
import { formatPhone } from '../../utils/phone';
export function PhoneInput({ value, onChange, className }: { value: string; onChange: (value: string) => void; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const display = formatPhone(value);
  useLayoutEffect(() => { if (caret.current !== null && input.current === document.activeElement) input.current?.setSelectionRange(caret.current, caret.current); caret.current = null; }, [display]);
  return <input ref={input} type="tel" autoComplete="tel" value={display} className={className} onChange={event => {
    let raw = event.target.value; let end = event.target.selectionStart ?? raw.length;
    // Backspace over punctuation deletes the preceding digit too.
    if (raw.length < display.length && raw.replace(/\D/g, '') === display.replace(/\D/g, '')) {
      let index = end - 1; while (index >= 0 && !/\d/.test(raw[index])) index--;
      if (index >= 0) { raw = raw.slice(0, index) + raw.slice(index + 1); end = index; }
    }
    const formatted = formatPhone(raw);
    const count = raw.slice(0, end).replace(/\D/g, '').length;
    let seen = 0; let position = 0;
    while (position < formatted.length && seen < count) { if (/\d/.test(formatted[position])) seen++; position++; }
    caret.current = end === raw.length ? formatted.length : position;
    onChange(formatted);
    // Same digits may produce the same formatted value.
    requestAnimationFrame(() => { if (input.current === document.activeElement && caret.current !== null) { input.current?.setSelectionRange(caret.current, caret.current); caret.current = null; } });
  }} />;
}
