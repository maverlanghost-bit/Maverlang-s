"use client";

import { useState } from "react";
import Image from "next/image";
import type { CryptoGroup, CryptoSector } from "@/lib/catalog/crypto-types";
import { cn } from "@/lib/cn";

type Swatch = readonly [from: string, to: string];

/**
 * Paleta de marca por símbolo (clave en mayúsculas).
 * Sin imágenes externas: cumple la CSP estricta (`img-src 'self' data: blob:`).
 */
const BRAND_SWATCHES: Record<string, Swatch> = {
  // ── Bluechips ──
  BTC: ["#F7931A", "#E07B0B"],
  SOL: ["#9945FF", "#14F195"],
  XRP: ["#1E293B", "#0F172A"],
  ETH: ["#627EEA", "#435CCB"],
  BNB: ["#F3BA2F", "#D99E12"],
  TRX: ["#DC2626", "#991B1B"],
  ZEC: ["#ECB22E", "#CA8A04"],
  HYPE: ["#5EEAD4", "#14B8A6"],
  LTC: ["#345D9D", "#224070"],
  AVAX: ["#E84142", "#B91C1C"],
  SUI: ["#2563EB", "#1D4ED8"],
  NEAR: ["#00D084", "#10B981"],

  // ── Solana DeFi & protocolos ──
  JUP: ["#14B8A6", "#10B981"],
  RAY: ["#4F46E5", "#7C3AED"],
  LINK: ["#2A5ADA", "#1E40AF"],
  UNI: ["#DB2777", "#9D174D"],
  ENA: ["#18181B", "#27272A"],
  AAVE: ["#7C3AED", "#0D9488"],
  ONDO: ["#0F172A", "#1E3A5F"],
  KMNO: ["#2563EB", "#1E3A8A"],
  PYTH: ["#6D28D9", "#4C1D95"],
  JTO: ["#0F766E", "#065F46"],
  ORCA: ["#FBBF24", "#D97706"],
  DRIFT: ["#6D28D9", "#4338CA"],
  W: ["#18181B", "#3F3F46"],

  // ── IA & Infraestructura ──
  TAO: ["#111827", "#27272A"],
  RENDER: ["#DC2626", "#991B1B"],
  HNT: ["#2563EB", "#0284C7"],

  // ── Memes ──
  DOGE: ["#EAB308", "#CA8A04"],
  PEPE: ["#15803D", "#166534"],
  BONK: ["#FB923C", "#F97316"],
  WIF: ["#F97316", "#EA580C"],
  POPCAT: ["#FB7185", "#F43F5E"],
  PENGU: ["#0284C7", "#0369A1"],
  TRUMP: ["#E11D48", "#9F1239"],
  FARTCOIN: ["#84CC16", "#65A30D"],

  // ── Dólares digitales ──
  USDT: ["#0F766E", "#047857"],
  USDS: ["#047857", "#065F46"],
  USDE: ["#1E293B", "#0F172A"],
  USD1: ["#0369A1", "#1E40AF"],
  PYUSD: ["#0052CC", "#003B99"],
  USDG: ["#047857", "#0F766E"],
  USDY: ["#1D4ED8", "#1E3A8A"],

  // ── Oro tokenizado ──
  XAUT0: ["#F59E0B", "#D97706"],
  PAXG: ["#FACC15", "#D97706"],

  // ── LSTs de Ganar (por si se reutiliza en fichas/cartera) ──
  JITOSOL: ["#0F766E", "#065F46"],
  JUPSOL: ["#14B8A6", "#10B981"],
  MSOL: ["#0D9488", "#2563EB"],
  BSOL: ["#9945FF", "#4F46E5"],
  DSOL: ["#6D28D9", "#4338CA"],
  INF: ["#1E293B", "#334155"],
};

const SECTOR_FALLBACKS: Record<CryptoSector, readonly Swatch[]> = {
  bluechip: [
    ["#2563EB", "#1D4ED8"],
    ["#1E293B", "#0F172A"],
    ["#4338CA", "#312E81"],
  ],
  "solana-defi": [
    ["#4F46E5", "#7C3AED"],
    ["#0F766E", "#115E59"],
    ["#6D28D9", "#4C1D95"],
  ],
  "ai-infra": [
    ["#111827", "#27272A"],
    ["#1E3A8A", "#312E81"],
    ["#B91C1C", "#7F1D1D"],
  ],
  meme: [
    ["#FB923C", "#F97316"],
    ["#FB7185", "#F43F5E"],
    ["#FBBF24", "#D97706"],
  ],
  dollar: [
    ["#0F766E", "#047857"],
    ["#0369A1", "#1E40AF"],
    ["#047857", "#065F46"],
  ],
  gold: [
    ["#F59E0B", "#D97706"],
    ["#FACC15", "#D97706"],
  ],
};

const DEFAULT_FALLBACKS: readonly Swatch[] = [
  ["#1E293B", "#0F172A"],
  ["#2563EB", "#1D4ED8"],
  ["#4F46E5", "#7C3AED"],
  ["#0F766E", "#047857"],
  ["#B45309", "#92400E"],
];

function hashSymbol(symbol: string): number {
  let hash = 2166136261;
  for (let index = 0; index < symbol.length; index += 1) {
    hash ^= symbol.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveSwatch(symbol: string, group?: CryptoGroup, sector?: CryptoSector): Swatch {
  const key = symbol.trim().toUpperCase();
  const branded = BRAND_SWATCHES[key];
  if (branded) return branded;

  const effectiveSector: CryptoSector | undefined =
    sector ?? (group === "dollar" ? "dollar" : group === "gold" ? "gold" : undefined);
  const pool = effectiveSector ? SECTOR_FALLBACKS[effectiveSector] : DEFAULT_FALLBACKS;
  return pool[hashSymbol(key || "CRYPTO") % pool.length] ?? DEFAULT_FALLBACKS[0];
}

function channelLuminance(channel255: number): number {
  const srgb = channel255 / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function hexLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Selecciona tinta oscura (`text-fg`) o blanca según la luminancia promedio del fondo. */
function usesDarkInk([from, to]: Swatch): boolean {
  const avgLuminance = (hexLuminance(from) + hexLuminance(to)) / 2;
  return avgLuminance > 0.186;
}

function monogramText(symbol: string): string {
  const trimmed = symbol.trim();
  const clean = trimmed.replace(/[^A-Za-z0-9]/g, "");
  if (clean.length === 0) return trimmed.slice(0, 2).toUpperCase() || "?";
  if (clean.length <= 4) {
    return clean === clean.toLowerCase() ? clean.toUpperCase() : clean;
  }
  return clean.slice(0, 3).toUpperCase();
}

function monogramFontSize(length: number, size: number): number {
  if (length <= 1) return Math.round(size * 0.42);
  if (length === 2) return Math.round(size * 0.36);
  if (length === 3) return Math.round(size * 0.3);
  return Math.round(size * 0.25);
}

// Logos de CoinGecko, guardados como WebP de 96 × 96 en public/crypto.
const LOGO_SYMBOLS = new Set([
  "aave", "avax", "bnb", "bonk", "bsol", "btc", "doge", "drift", "dsol", "ena", "eth", "fartcoin",
  "hnt", "hype", "inf", "jitosol", "jto", "jup", "jupsol", "kmno", "link", "ltc", "msol", "near",
  "ondo", "orca", "paxg", "pengu", "pepe", "popcat", "pyth", "pyusd", "ray", "render", "sol",
  "sui", "tao", "trump", "trx", "uni", "usd1", "usde", "usdg", "usds", "usdt", "usdy", "w",
  "wif", "xaut0", "xrp", "zec",
]);

/**
 * Avatar circular cromático para tokens cripto.
 * Usa logos locales con respaldo al monograma si falta la imagen.
 */
export function CryptoBadgeIcon({
  symbol,
  group,
  sector,
  size = 36,
  loading = "lazy",
  className,
}: {
  symbol: string;
  group?: CryptoGroup;
  sector?: CryptoSector;
  size?: number;
  loading?: "eager" | "lazy";
  className?: string;
}) {
  const normalized = symbol.trim().toLowerCase();
  const src = LOGO_SYMBOLS.has(normalized) ? `/crypto/${normalized}.webp` : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showFallback = src === null || failedSrc === src;

  if (!showFallback) {
    return (
      <span
        aria-hidden
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10 select-none ring-inset",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          loading={loading}
          unoptimized
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  const swatch = resolveSwatch(symbol, group, sector);
  const darkInk = usesDarkInk(swatch);
  const label = monogramText(symbol);

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-mono leading-none font-semibold ring-1 ring-black/10 select-none ring-inset",
        darkInk ? "text-fg" : "text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(135deg, ${swatch[0]} 0%, ${swatch[1]} 100%)`,
        fontSize: monogramFontSize(label.length, size),
        letterSpacing: label.length >= 4 ? "-0.05em" : "-0.02em",
      }}
    >
      {label}
    </span>
  );
}
