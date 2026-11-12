// Esqueletos de carregamento sem layout shift para Board, Backlog, Tabelas e Modal do item.
function Bar({ className = '' }) {
  return <div className={`animate-pulse rounded bg-hover ${className}`} />;
}

export function BoardSkeleton() {
  return (
    <div className="flex-1 overflow-hidden px-8 pb-8" aria-busy="true">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(5, 272px)' }}>
        {[3, 2, 2, 1, 2].map((cards, col) => (
          <div key={col} className="flex flex-col gap-2 rounded-md bg-column p-2">
            <div className="flex items-center justify-between px-1 py-1">
              <Bar className="h-3.5 w-24" />
              <Bar className="h-3.5 w-8" />
            </div>
            {Array.from({ length: cards }).map((_, i) => (
              <div key={i} className="space-y-2.5 rounded-[3px] bg-surface p-3 shadow-card">
                <Bar className="h-3.5 w-4/5" />
                <Bar className="h-3 w-3/5" />
                <div className="flex items-center justify-between pt-1">
                  <Bar className="h-3.5 w-12" />
                  <Bar className="h-5 w-5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BacklogSkeleton() {
  return (
    <div className="flex-1 space-y-4 overflow-hidden px-8 pb-8" aria-busy="true">
      {[4, 3].map((rows, s) => (
        <div key={s} className="rounded-md bg-column p-2">
          <div className="flex items-center gap-3 px-1 pb-2">
            <Bar className="h-4 w-32" />
            <Bar className="h-3.5 w-24" />
            <span className="flex-1" />
            <Bar className="h-4 w-12 rounded-full" />
          </div>
          <div className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} className="flex items-center gap-3 px-3 py-2.5">
                <Bar className="h-4 w-4" />
                <Bar className="h-3.5 w-10" />
                <Bar className="h-3.5 flex-1 max-w-md" />
                <span className="flex-1" />
                <Bar className="h-4 w-20" />
                <Bar className="h-6 w-6 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2 py-2" aria-busy="true">
      <div className="flex items-center gap-4 border-b-2 border-line pb-2">
        <Bar className="h-3 w-12" />
        <Bar className="h-3 w-40" />
        <span className="flex-1" />
        <Bar className="h-3 w-24" />
        <Bar className="h-3 w-20" />
        <Bar className="h-3 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line py-2.5">
          <Bar className="h-4 w-4" />
          <Bar className="h-3.5 w-12" />
          <Bar className="h-3.5 flex-1 max-w-lg" />
          <span className="flex-1" />
          <Bar className="h-5 w-28" />
          <Bar className="h-4 w-20" />
          <Bar className="h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

export function ItemModalSkeleton({ id }) {
  return (
    <div className="p-6" aria-busy="true" aria-label={`#${id}`}>
      <div className="mb-5 flex items-center justify-between">
        <Bar className="h-4 w-40" />
        <Bar className="h-6 w-16" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Bar className="h-7 w-3/4" />
          <div className="space-y-2">
            <Bar className="h-3.5 w-24" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
            <Bar className="h-4 w-2/3" />
          </div>
          <div className="space-y-2 pt-2">
            <Bar className="h-3.5 w-32" />
            <Bar className="h-10 w-full" />
            <Bar className="h-10 w-full" />
          </div>
        </div>
        <div className="space-y-4">
          <Bar className="h-8 w-32" />
          <div className="space-y-3 rounded border border-line p-3">
            <Bar className="h-4 w-20" />
            <Bar className="h-5 w-full" />
            <Bar className="h-5 w-full" />
            <Bar className="h-5 w-3/4" />
            <Bar className="h-5 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
