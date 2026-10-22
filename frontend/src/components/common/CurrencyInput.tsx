import React, { useState } from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | string;
  onValueChange: (value: number) => void;
};

// Keep an editable draft so deleting a zero does not immediately put it back.
export const CurrencyInput: React.FC<Props> = ({ value, onValueChange, onFocus, onBlur, min, max, step: _step, ...props }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const number = Number(value) || 0;
  const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
  return <input {...props} type="text" inputMode="decimal"
    value={draft ?? (value === '' ? '' : formatted)}
    onFocus={(event) => {
      setDraft(number === 0 ? '' : String(number));
      onFocus?.(event);
    }}
    onChange={(event) => {
      const text = event.target.value.replace(',', '.').replace(/^0+(?=\d)/, '');
      if (!/^\d*(\.\d{0,2})?$/.test(text)) return;
      const amount = Number(text) || 0;
      event.target.setCustomValidity(
        min !== undefined && amount < Number(min) ? `El monto mínimo es ${min}.` :
        max !== undefined && amount > Number(max) ? `El monto máximo es ${max}.` : ''
      );
      setDraft(text);
      onValueChange(amount);
    }}
    onBlur={(event) => {
      setDraft(null);
      onBlur?.(event);
    }} />;
};
