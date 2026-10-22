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
      // Do not replace the DOM value during focus: it invalidates the browser's
      // selection and can append pasted/autofilled text to the previous amount.
      event.currentTarget.select();
      onFocus?.(event);
    }}
    onChange={(event) => {
      const input = event.target.value.replace(/^RD\$\s*/i, '').replace(/\s/g, '');
      const text = (input.includes('.') || /^\d{1,3}(,\d{3})+$/.test(input)
        ? input.replace(/,/g, '') : input.replace(',', '.')).replace(/^0+(?=\d)/, '');
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
