"use client";

import dynamic from "next/dynamic";

const QrMark = dynamic(() => import("@/components/ui/qr-mark").then((mod) => mod.QrMark), {
  ssr: false,
  loading: () => <span className="block size-full animate-pulse rounded-md bg-surface-2" aria-hidden />,
});

export function QRCode({ value, size = 168, label = "Código QR" }: { value: string; size?: number; label?: string }) {
  return (
    <div role="img" aria-label={label} className="inline-flex rounded-xl border border-border bg-bg p-3">
      <span className="block" style={{ width: size, height: size }} aria-hidden>
        <QrMark value={value} size={size} />
      </span>
    </div>
  );
}
