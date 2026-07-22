export function ProjetoCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-[12px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)]">
      {/* Faixa de status */}
      <div className="h-[30px] w-full animate-pulse bg-[var(--wb-bg-inset)]" />
      <div className="aspect-video w-full animate-pulse bg-[var(--wb-bg-inset)]" />
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--wb-bg-inset)]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--wb-bg-inset)]" />
        <div className="h-3 w-2/5 animate-pulse rounded bg-[var(--wb-bg-inset)]" />
      </div>
      {/* Pipeline em ícones */}
      <div className="flex gap-1 border-t border-[var(--wb-border-soft)] px-3 py-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-[21px] w-[21px] animate-pulse rounded-full bg-[var(--wb-bg-inset)]"
          />
        ))}
      </div>
      {/* Barra de ações */}
      <div className="flex gap-1.5 border-t border-[var(--wb-border-soft)] px-2.5 py-2">
        <div className="h-[28px] flex-1 animate-pulse rounded-[7px] bg-[var(--wb-bg-inset)]" />
        <div className="h-[28px] w-[30px] animate-pulse rounded-[7px] bg-[var(--wb-bg-inset)]" />
        <div className="h-[28px] w-[30px] animate-pulse rounded-[7px] bg-[var(--wb-bg-inset)]" />
      </div>
    </div>
  );
}
