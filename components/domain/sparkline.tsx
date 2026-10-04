import { cn } from "@/lib/cn";

export function Sparkline({
  data,
  width = 96,
  height = 32,
  label,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  label?: string;
  className?: string;
}) {
  if (data.length < 2) return null;

  let min = data[0] ?? 0;
  let max = data[0] ?? 0;
  for (const value of data) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points = data
    .map((value, index) => {
      const x = pad + (index / (data.length - 1)) * innerW;
      const y = pad + innerH - ((value - min) / span) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = data[0] ?? 0;
  const last = data[data.length - 1] ?? 0;
  const tone = last > first ? "text-up" : last < first ? "text-down" : "text-fg-muted";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", tone, className)}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}
