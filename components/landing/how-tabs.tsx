"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type HowTabStep = {
  number: string;
  title: string;
  body: string;
};

/**
 * Pasos de "Cómo funciona" (T70).
 * - Escritorio (`lg`): lista de pestañas a la izquierda y, a la derecha, la
 *   pantalla del paso elegido. Pestañas accesibles (tablist/tab/tabpanel),
 *   flechas, Inicio y Fin; sin rotación automática.
 * - Móvil: los tres pasos apilados, cada uno seguido de su pantalla.
 * El servidor entrega las tres pantallas ya renderizadas en `panels`; aquí sólo
 * vive el paso elegido.
 */
export function HowTabs({
  header,
  steps,
  panels,
}: {
  header: ReactNode;
  steps: HowTabStep[];
  panels: ReactNode[];
}) {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number, focus: boolean) {
    setSelected(index);
    if (focus) tabRefs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = steps.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-16">
      <div className="min-w-0 lg:col-span-6">
        {header}

        {/* Móvil: sin pestañas; cada paso con su pantalla debajo. */}
        <ol className="mt-10 grid list-none gap-12 lg:hidden">
          {steps.map((step, index) => (
            <li key={step.title} className="min-w-0">
              <p aria-hidden className="label leading-none">
                {step.number}
              </p>
              <h3 className="mt-3 text-xl leading-snug font-semibold tracking-tight text-pretty">
                {step.title}
              </h3>
              <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed text-fg-body text-pretty">
                {step.body}
              </p>
              <div className="mt-6">{panels[index]}</div>
            </li>
          ))}
        </ol>

        {/* Escritorio: pestañas verticales. */}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Los tres pasos"
          className="mt-12 hidden flex-col gap-1 lg:flex"
        >
          {steps.map((step, index) => {
            const active = index === selected;
            return (
              <button
                key={step.title}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`how-tab-${index}`}
                aria-selected={active}
                aria-controls={`how-panel-${index}`}
                aria-labelledby={`how-tab-title-${index}`}
                aria-describedby={`how-tab-body-${index}`}
                tabIndex={active ? 0 : -1}
                onClick={() => select(index, false)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "flex min-h-11 w-full items-start gap-4 rounded-xl border-l-2 py-4 pr-4 pl-5 text-left transition-colors motion-reduce:transition-none",
                  active
                    ? "border-fg bg-surface-1"
                    : "border-border hover:bg-surface-1/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "label mt-1.5 shrink-0 leading-none",
                    active && "text-fg",
                  )}
                >
                  {step.number}
                </span>
                <span className="block min-w-0">
                  <span
                    id={`how-tab-title-${index}`}
                    className={cn(
                      "block text-lg leading-snug font-semibold tracking-tight text-pretty",
                      active ? "text-fg" : "text-fg-body",
                    )}
                  >
                    {step.title}
                  </span>
                  <span
                    id={`how-tab-body-${index}`}
                    className="mt-1.5 block max-w-[44ch] text-[15px] leading-relaxed text-fg-muted text-pretty"
                  >
                    {step.body}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Escritorio: todas las pantallas en la misma celda para que el marco no
          cambie de alto al pasar de un paso a otro. */}
      <div className="hidden min-w-0 lg:col-span-6 lg:grid">
        {panels.map((panel, index) => {
          const active = index === selected;
          return (
            <div
              key={steps[index]?.title ?? index}
              role="tabpanel"
              id={`how-panel-${index}`}
              aria-labelledby={`how-tab-${index}`}
              tabIndex={active ? 0 : -1}
              className={cn(
                "col-start-1 row-start-1 min-w-0 transition-[opacity,visibility] duration-200 motion-reduce:transition-none",
                active ? "visible opacity-100" : "invisible opacity-0",
              )}
            >
              {panel}
            </div>
          );
        })}
      </div>
    </div>
  );
}
