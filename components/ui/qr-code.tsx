import { QRCodeSVG } from "qrcode.react";

export function QRCode({ value, size = 168, label = "Código QR" }: { value: string; size?: number; label?: string }) {
  return (
    <div role="img" aria-label={label} className="inline-flex rounded-xl border border-border bg-bg p-3">
      <div aria-hidden>
        <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#0a0a0a" level="M" />
      </div>
    </div>
  );
}
