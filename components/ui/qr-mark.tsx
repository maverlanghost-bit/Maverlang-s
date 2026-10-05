"use client";

import { QRCodeSVG } from "qrcode.react";

/** Trozo aparte: `qrcode.react` no entra en el bundle de las pantallas que no muestran un QR. */
export function QrMark({ value, size }: { value: string; size: number }) {
  return <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#0a0a0a" level="M" />;
}
