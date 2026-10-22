import React from 'react';
import { Inbox, Search, Plus, FilterX } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  isFiltered?: boolean;
  onClearFilters?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  isFiltered = false,
  onClearFilters,
  className = '',
}) => {
  return (
    <div
      className={`p-8 sm:p-12 text-center rounded-2xl bg-card/60 border border-border flex flex-col items-center justify-center max-w-lg mx-auto ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border/80 text-muted-foreground flex items-center justify-center mb-4">
        {isFiltered ? <Search className="w-6 h-6 text-primary" /> : <Icon className="w-6 h-6" />}
      </div>

      <h3 className="text-base sm:text-lg font-display font-bold text-foreground">
        {title}
      </h3>

      {description && (
        <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
        {isFiltered && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-border"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Limpiar filtros</span>
          </button>
        )}

        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-primary/20 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};
