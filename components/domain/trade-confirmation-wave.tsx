"use client";

import { Component, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { DistortionWaveHandle, WaveStyleInput } from "distortion-waves";

import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type WaveComponent = typeof import("distortion-waves").DistortionWave;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const BACKDROP = "pointer-events-none absolute inset-0 z-0 rounded-[inherit]";
const TINT = "bg-linear-to-r from-up-bg via-up-bg/65 to-bg";
const WAVE_STYLE: WaveStyleInput = {
  anticipation: 0.04,
  travel: 0.58,
  linger: 0.08,
  rimFade: 0.38,
  hairlineLinger: 0.06,
  hairlineFade: 0.26,
  rimStrength: 0.34,
  hairlineOpacity: 0.42,
  strength: 0.3,
  particleCount: 0,
  particleLife: 0,
};

let readyWave: WaveComponent | undefined;
let loadingWave: Promise<void> | undefined;

export function preloadTradeConfirmationWave() {
  if (window.matchMedia(REDUCED_MOTION).matches) return;
  loadingWave ??= import("distortion-waves")
    .then(({ DistortionWave }) => { readyWave = DistortionWave; })
    .catch(() => { loadingWave = undefined; });
}

function ReceiptGlow({ fade = false }: { fade?: boolean }) {
  return <div aria-hidden="true" className={`${BACKDROP} ${TINT}${fade ? " motion-safe:animate-fade-in" : ""}`} />;
}

// Aislamos el componente WebGL para que un error de montaje sólo afecte la decoración.
class WaveBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback === undefined ? <ReceiptGlow fade /> : this.props.fallback;
  }
}

export function TradeConfirmationWave({ source }: { source: RefObject<HTMLSpanElement | null> }) {
  // Al mostrar el comprobante elegimos una transición una sola vez. Una descarga
  // tardía ya queda lista para la siguiente compra.
  const [Wave] = useState(() =>
    typeof window !== "undefined" && !window.matchMedia(REDUCED_MOTION).matches ? readyWave : undefined,
  );
  const [finished, setFinished] = useState(false);
  const waveRef = useRef<DistortionWaveHandle>(null);

  useEffect(() => {
    if (!Wave || finished) return;
    // El navegador pinta el comprobante antes de inicializar WebGL.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        try {
          waveRef.current?.play();
        } catch {
          setFinished(true);
        }
      });
    });
    const timeout = window.setTimeout(() => setFinished(true), 900);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [Wave, finished]);

  if (!Wave || finished) return <ReceiptGlow fade={!Wave} />;

  return (
    <WaveBoundary>
      <Wave
        ref={waveRef}
        type="center"
        source={source}
        palette="#18844c"
        waveStyle={WAVE_STYLE}
        // El canvas genera sólo la onda. Los datos del comprobante viven en el DOM.
        capture={false}
        live={false}
        prewarm={false}
        resolution={1}
        reducedMotion="system"
        onFinish={() => setFinished(true)}
        aria-hidden="true"
        className={BACKDROP}
        revealedContent={<div className={`size-full ${TINT}`} />}
      >
        <div className="size-full bg-bg" />
      </Wave>
    </WaveBoundary>
  );
}

/** Título del comprobante de una orden confirmada. */
export function doneTitle(side: "buy" | "sell", english: boolean) {
  if (english) return side === "buy" ? "Purchase complete" : "Sale complete";
  return side === "buy" ? "Compra realizada" : "Venta realizada";
}

/** Lo que dura la onda antes de que el velo empiece a desvanecerse. */
const FLOOD_MS = 760;
const FLOOD_FADE_MS = 420;

/**
 * Onda que cubre toda la hoja (no sólo el encabezado): el velo blanco tapa el
 * cambio de contenido, la onda verde sale desde el check y luego el velo se
 * desvanece para dejar ver el comprobante. Se posiciona contra el panel del
 * diálogo, así que ningún ancestro entre ambos debe estar posicionado.
 */
function TradeConfirmationFlood({ source, Wave }: { source: RefObject<HTMLSpanElement | null>; Wave: WaveComponent }) {
  const [stage, setStage] = useState<"wave" | "fade" | "gone">("wave");
  const waveRef = useRef<DistortionWaveHandle>(null);

  useEffect(() => {
    if (stage === "gone") return;
    if (stage === "fade") {
      const timeout = window.setTimeout(() => setStage("gone"), FLOOD_FADE_MS);
      return () => window.clearTimeout(timeout);
    }
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        try {
          waveRef.current?.play();
        } catch {
          setStage("fade");
        }
      });
    });
    const timeout = window.setTimeout(() => setStage("fade"), FLOOD_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [stage]);

  if (stage === "gone") return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-30 overflow-hidden transition-opacity ease-out",
        stage === "fade" && "opacity-0",
      )}
      style={{ transitionDuration: `${FLOOD_FADE_MS}ms` }}
    >
      <WaveBoundary fallback={<div className="size-full bg-up-bg" />}>
        <Wave
          ref={waveRef}
          type="center"
          source={source}
          palette="#18844c"
          waveStyle={WAVE_STYLE}
          capture={false}
          live={false}
          prewarm={false}
          resolution={1}
          reducedMotion="system"
          onFinish={() => setStage("fade")}
          className="absolute inset-0"
          revealedContent={<div className="size-full bg-linear-to-b from-up-bg via-up-bg to-bg" />}
        >
          <div className="size-full bg-bg" />
        </Wave>
      </WaveBoundary>
    </div>
  );
}

/**
 * Encabezado del comprobante. Con `animate` (orden confirmada): la onda cubre
 * toda la hoja y después aparece el check blanco en un círculo verde, con un
 * halo que se expande, y el título «Compra realizada» / «Venta realizada».
 */
export function TradeConfirmationHeading({ title, summary, animate }: {
  title: string;
  summary: string;
  animate: boolean;
}) {
  const check = useRef<HTMLSpanElement>(null);
  // La onda se decide una vez al montar; sin ella (movimiento reducido, sin
  // WebGL o módulo aún no cargado) el check aparece sin esperar.
  const [Wave] = useState(() =>
    animate && typeof window !== "undefined" && !window.matchMedia(REDUCED_MOTION).matches ? readyWave : undefined,
  );
  const delay = Wave ? FLOOD_MS - 120 : 0;
  const after = (ms: number) => ({ animationDelay: `${delay + ms}ms` });

  useEffect(() => {
    if (animate) check.current?.scrollIntoView({ block: "nearest" });
  }, [animate]);

  return (
    <div className={cn("flex flex-col items-center text-center", animate ? "gap-4 pt-3" : "gap-3")}>
      {Wave ? <TradeConfirmationFlood source={check} Wave={Wave} /> : null}
      <span
        ref={check}
        aria-hidden="true"
        className={cn(
          "relative grid shrink-0 place-items-center rounded-full",
          animate ? "size-20 bg-up text-white motion-safe:animate-success-pop" : "size-12 bg-fg text-bg",
        )}
        style={animate ? after(0) : undefined}
      >
        {animate ? (
          <>
            <span className="absolute inset-0 rounded-full bg-up motion-safe:animate-success-ring" style={after(120)} />
            <svg viewBox="0 0 24 24" className="relative size-10" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path
                d="M5 12.5 9.5 17 19 7.5"
                pathLength={1}
                strokeDasharray={1}
                className="motion-safe:animate-check-draw"
                style={after(220)}
              />
            </svg>
          </>
        ) : (
          <IconCheck className="size-5" />
        )}
      </span>
      <div className={cn("min-w-0", animate && "motion-safe:animate-success-text")} style={animate ? after(280) : undefined}>
        <p className={cn("leading-tight text-fg", animate ? "text-2xl font-medium" : "text-xl")}>{title}</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-balance text-fg-body">{summary}</p>
      </div>
    </div>
  );
}
