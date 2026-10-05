import { formatPortion } from "@/lib/format";

export type AllocationSlice = {
  key: string;
  label: string;
  pct: number;
  valueLabel: string;
  color: string;
};

export function AllocationBar({ label, slices }: { label: string; slices: readonly AllocationSlice[] }) {
  if (slices.length === 0) return null;
  const summary = slices.map((slice) => `${slice.label} ${formatPortion(slice.pct)}`).join(", ");

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${label}: ${summary}`}>
        {slices.map((slice) => (
          <span key={slice.key} className="h-full min-w-0.5" style={{ flexGrow: slice.pct, backgroundColor: slice.color }} />
        ))}
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg">{slice.label}</span>
            <span className="num text-fg-muted">{formatPortion(slice.pct)}</span>
            <span className="num text-fg">{slice.valueLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
