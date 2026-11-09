"use client";

import { useId, useState, type ReactElement } from "react";

import { cn } from "@/lib/cn";

/**
 * Resultado normalizado de una cita: las URLs se muestran como fuente web y
 * cualquier otro texto se trata como documento citado. Nunca lanza.
 */
export function formatCitationSource(rawSource: string): {
  displayTitle: string;
  subtitle: string;
  badge: string;
  isWeb: boolean;
  url: string | null;
} {
  const raw = (typeof rawSource === "string" ? rawSource : "").trim();

  if (raw.length > 0) {
    try {
      const parsed = new URL(raw);

      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        const hostname = parsed.hostname.replace(/^www\./, "");
        const path = `${parsed.pathname}${parsed.search}`;

        return {
          displayTitle: hostname.length > 0 ? hostname : raw,
          subtitle: path === "/" || path.length === 0 ? "Fuente web" : path,
          badge: "Web",
          isWeb: true,
          url: parsed.href,
        };
      }
    } catch {
      // No es una URL absoluta válida: cae al tratamiento de documento.
    }
  }

  const collapsed = raw.replace(/\s+/g, " ");
  const displayTitle =
    collapsed.length > 64 ? `${collapsed.slice(0, 64).trimEnd()}…` : collapsed;

  return {
    displayTitle: displayTitle.length > 0 ? displayTitle : "Documento citado",
    subtitle: "Documento citado",
    badge: "Doc",
    isWeb: false,
    url: null,
  };
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "size-4 shrink-0 text-fg-muted transition-transform duration-200 motion-reduce:transition-none",
        open ? "rotate-180" : "rotate-0",
      )}
    />
  );
}

/**
 * Lista de fuentes citadas por una respuesta. Devuelve `null` sin fuentes y en
 * SSR renderiza todo el contenido (sin estado ni efectos de montaje).
 */
export function SourcesList({
  sources,
}: {
  sources: readonly string[];
}): ReactElement | null {
  if (sources.length === 0) return null;

  return (
    <section aria-label="Fuentes consultadas" className="not-prose my-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">
        <GlobeIcon className="size-3.5 shrink-0" />
        <h3>Fuentes</h3>
      </div>

      <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        {sources.map((raw, index) => {
          const source = formatCitationSource(raw);
          const hostname = source.url === null ? null : hostnameOf(source.url);
          const favicon =
            hostname === null
              ? null
              : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;

          const body = (
            <>
              {favicon === null ? (
                <FileTextIcon className="size-4 shrink-0 text-fg-muted" />
              ) : (
                // Favicon remoto: `next/image` no aporta aquí y el spec pide <img>.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={favicon}
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 rounded-sm"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg-body">
                {source.displayTitle}
              </span>
              <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] font-medium text-fg-muted">
                {source.badge}
              </span>
            </>
          );

          const itemClass =
            "flex min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-white px-2.5 py-2 transition-colors outline-none motion-reduce:transition-none";

          return (
            <li key={`${source.url ?? source.displayTitle}-${index}`} className="min-w-0">
              {source.url === null ? (
                <div className={cn(itemClass, "text-fg-body")} title={source.subtitle}>
                  {body}
                </div>
              ) : (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={source.subtitle}
                  className={cn(
                    itemClass,
                    "hover:border-border-strong hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20",
                  )}
                >
                  {body}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type ToolState = "running" | "completed" | "error";

const TOOL_LABELS: Record<string, string> = {
  market_quote: "Precios de mercado",
  portfolio: "Cartera",
  web_search: "Búsqueda web",
  chart: "Gráfico",
};

const STATE_BADGE: Record<ToolState, { label: string; className: string }> = {
  running: { label: "En progreso", className: "bg-info-bg text-info" },
  completed: { label: "Completado", className: "bg-up-bg text-up" },
  error: { label: "Error", className: "bg-down-bg text-down" },
};

function friendlyToolName(name: string): string {
  const trimmed = name.trim();
  const known = TOOL_LABELS[trimmed];
  if (known !== undefined) return known;

  const pretty = trimmed.replace(/_/g, " ");
  return pretty.length > 0 ? pretty : "Herramienta";
}

function stringifyInput(input: Record<string, unknown> | undefined): string | null {
  if (input === undefined || input === null) return null;

  try {
    return JSON.stringify(input, null, 2);
  } catch {
    // Referencias circulares u otros valores no serializables.
    return null;
  }
}

/**
 * Acordeón de una llamada a herramienta del asistente: nombre legible, estado
 * y, al abrir, los parámetros (JSON) y el resultado en texto plano.
 */
export function ToolAccordion({
  name,
  state = "completed",
  input,
  output,
  defaultOpen = false,
}: {
  name: string;
  state?: ToolState;
  input?: Record<string, unknown>;
  output?: string;
  defaultOpen?: boolean;
}): ReactElement {
  // `null` = el usuario aún no decidió: se usa el default efectivo (los errores
  // se muestran abiertos, incluso si el estado cambia durante el streaming).
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const panelId = useId().replace(/:/g, "");
  const expanded = openOverride ?? (defaultOpen || state === "error");

  const badge = STATE_BADGE[state];
  const inputJson = stringifyInput(input);
  const outputText = typeof output === "string" ? output : "";
  const hasOutput = outputText.trim().length > 0;

  return (
    <div
      data-ai-tool={name}
      data-ai-tool-state={state}
      className="not-prose my-3 w-full overflow-hidden rounded-xl border border-border/60 bg-white"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setOpenOverride(!expanded)}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left select-none",
          "transition-colors outline-none motion-reduce:transition-none",
          "hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-surface-1 text-fg-muted">
            <WrenchIcon className="size-3.5" />
          </span>
          <span className="truncate text-xs font-semibold text-fg">
            {friendlyToolName(name)}
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              badge.className,
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full bg-current",
                state === "running" && "motion-safe:animate-pulse motion-reduce:animate-none",
              )}
            />
            {badge.label}
          </span>
        </span>
        <ChevronDownIcon open={expanded} />
      </button>

      <div id={panelId} hidden={!expanded} className="border-t border-border/60 text-xs">
        {inputJson !== null ? (
          <div className={cn("space-y-1.5 p-3", hasOutput && "border-b border-border/40")}>
            <h4 className="text-[10px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
              Parámetros
            </h4>
            <pre className="overflow-x-auto rounded-lg border border-border/60 bg-surface-1 p-2.5 font-mono text-[11.5px] leading-relaxed text-fg-body">
              {inputJson}
            </pre>
          </div>
        ) : null}

        {hasOutput ? (
          <div className="space-y-1.5 p-3">
            <h4 className="text-[10px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
              Resultado
            </h4>
            <pre className="overflow-x-auto rounded-lg border border-border/60 bg-surface-1 p-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-fg-body">
              {outputText}
            </pre>
          </div>
        ) : null}

        {inputJson === null && !hasOutput ? (
          <p className="p-3 text-[11.5px] leading-relaxed text-fg-muted">
            Sin detalles disponibles.
          </p>
        ) : null}
      </div>
    </div>
  );
}
