import React from 'react';
import { Shirt } from 'lucide-react';

interface TshirtSizeSelectorProps {
  sizes: string[];
  selectedSize: string | null;
  onSelect: (size: string | null) => void;
  disabled?: boolean;
  showSkip?: boolean;
  label?: string;
}

export const TshirtSizeSelector: React.FC<TshirtSizeSelectorProps> = ({
  sizes,
  selectedSize,
  onSelect,
  disabled = false,
  showSkip = true,
  label = 'Selecciona la talla de camiseta',
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shirt className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold text-foreground uppercase tracking-wider">{label}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(selectedSize === size ? null : size)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              selectedSize === size
                ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                : 'bg-card text-foreground border-border hover:border-primary/50 hover:bg-muted'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {size}
          </button>
        ))}
        {showSkip && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              selectedSize === null
                ? 'bg-zinc-700 text-zinc-200 border-zinc-600'
                : 'bg-transparent text-muted-foreground border-border hover:border-zinc-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Sin talla
          </button>
        )}
      </div>

      {selectedSize && (
        <p className="text-[11px] text-emerald-400 font-semibold">
          ✓ Talla seleccionada: <strong>{selectedSize}</strong>
        </p>
      )}
    </div>
  );
};
