"use client";

import { Component, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { DistortionWaveHandle, WaveStyleInput } from "distortion-waves";

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
class WaveBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <ReceiptGlow fade /> : this.props.children;
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
