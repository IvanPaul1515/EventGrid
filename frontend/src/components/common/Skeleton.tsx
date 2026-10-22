import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => {
  return (
    <div
      className={`bg-muted/70 motion-safe:animate-pulse motion-reduce:animate-none rounded-md ${className}`}
      {...props}
    />
  );
};

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex items-center justify-between"
        >
          <div className="space-y-2.5 flex-1 pr-4">
            <Skeleton className="h-3.5 w-24 rounded" />
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-3 w-36 rounded" />
          </div>
          <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 5 }) => {
  return (
    <div className="w-full bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Cabecera falsa */}
      <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-40 rounded" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      {/* Filas */}
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="w-9 h-9 rounded-full shrink-0" />
              <div className="space-y-2 flex-1 max-w-xs">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
            {Array.from({ length: cols - 1 }).map((_, c) => (
              <Skeleton
                key={c}
                className="hidden sm:block h-4 w-20 rounded"
              />
            ))}
            <Skeleton className="h-8 w-16 rounded-lg shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const ChartSkeleton: React.FC<{ height?: string }> = ({ height = 'h-72' }) => {
  return (
    <div className={`w-full ${height} bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between`}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-4 w-24 rounded" />
      </div>
      <div className="flex items-end justify-between gap-2 h-44 pt-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-full rounded-t"
            style={{ height: `${20 + ((i * 19) % 75)}%` }}
          />
        ))}
      </div>
    </div>
  );
};
