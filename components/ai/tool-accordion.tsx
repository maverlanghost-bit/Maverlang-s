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
  badge: "Web" | "Doc";
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

function ChevronDownIcon({ open, className }: { open: boolean; className?: string }) {
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
        "shrink-0 text-zinc-400 transition-transform duration-200",
        open ? "rotate-180" : "rotate-0",
        className,
      )}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
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
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function SourceCard({
  source,
  index,
}: {
  source: ReturnType<typeof formatCitationSource>;
  index: number;
}) {
  const hostname = source.url === null ? null : hostnameOf(source.url);
  const favicon =
    hostname === null
      ? null
      : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
          hostname.replace(/^www\./, ""),
        )}&sz=32`;

  const body = (
    <>
      <span className="w-[18px] h-[18px] rounded-full bg-white text-[9px] font-bold border border-zinc-200 text-zinc-500 flex shrink-0 items-center justify-center">
        {index + 1}
      </span>
      <span className="w-4 h-4 rounded-md bg-white border border-zinc-200/70 flex shrink-0 items-center justify-center overflow-hidden">
        {favicon === null ? (
          <FileTextIcon className="h-3 w-3 text-zinc-400" />
        ) : (
          // Favicon remoto: `next/image` no aporta aquí y el spec pide <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={favicon}
            alt=""
            width={16}
            height={16}
            className="h-3 w-3 object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[11px] font-semibold leading-tight text-zinc-800 transition-colors group-hover:text-[#1890FF]">
          {source.displayTitle}
        </span>
        <span className="mt-0.5 truncate text-[9px] text-zinc-400">{source.subtitle}</span>
      </span>
      <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-1.5 py-px text-[9px] font-semibold text-zinc-500">
        {source.badge}
      </span>
      <ExternalLinkIcon className="h-3 w-3 shrink-0 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </>
  );

  const cardClass =
    "group flex min-w-0 items-center gap-2 rounded-xl border border-zinc-200/70 bg-white p-2 shadow-2xs transition-all duration-200";

  return source.url === null ? (
    <div className={cn(cardClass, "cursor-default")} title={source.subtitle}>
      {body}
    </div>
  ) : (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer noopener"
      title={source.subtitle}
      className={cn(cardClass, "cursor-pointer hover:border-zinc-300 hover:bg-zinc-50/80")}
    >
      {body}
    </a>
  );
}

/**
 * Lista de fuentes citadas por una respuesta. Muestra las tres primeras en
 * grilla y permite desplegar el resto. Devuelve `null` sin fuentes.
 */
export function SourcesList({
  sources,
}: {
  sources: readonly string[];
}): ReactElement | null {
  const [showAll, setShowAll] = useState(false);

  if (sources.length === 0) return null;

  const maxInitial = 3;
  const visible = showAll ? sources : sources.slice(0, maxInitial);
  const remaining = sources.length - maxInitial;

  return (
    <section aria-label="Fuentes consultadas" className="not-prose mb-3 min-w-0 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
        <GlobeIcon className="w-3.5 h-3.5 shrink-0 text-[#1890FF]" />
        <h3>Fuentes consultadas ({sources.length})</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {visible.map((raw, index) => (
          <SourceCard key={`${raw}-${index}`} source={formatCitationSource(raw)} index={index} />
        ))}

        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll((previous) => !previous)}
            className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-2 text-[11px] font-medium text-zinc-500 transition-all hover:border-[#1890FF]/40 hover:bg-zinc-50 hover:text-zinc-800"
          >
            <PlusIcon
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                showAll && "rotate-45",
              )}
            />
            <span>{showAll ? "Mostrar menos" : `+${remaining} más`}</span>
          </button>
        ) : null}
      </div>
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

function StatusBadge({ state }: { state: ToolState }): ReactElement {
  if (state === "running") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600">
        <SpinnerIcon className="size-3 animate-spin" />
        <span>En progreso</span>
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
        <XCircleIcon className="size-3" />
        <span>Error</span>
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
      <CheckCircleIcon className="size-3" />
      <span>Completado</span>
    </span>
  );
}

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

  const inputJson = stringifyInput(input);
  const outputText = typeof output === "string" ? output : "";
  const hasOutput = outputText.trim().length > 0;

  return (
    <div
      data-ai-tool={name}
      data-ai-tool-state={state}
      className="not-prose my-3 w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-2xs"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setOpenOverride(!expanded)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left select-none transition-colors hover:bg-zinc-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-md border border-zinc-200/70 bg-zinc-100">
            <WrenchIcon className="size-3.5 text-zinc-500" />
          </span>
          <span className="truncate text-xs font-semibold text-zinc-800">
            {friendlyToolName(name)}
          </span>
          <StatusBadge state={state} />
        </span>
        <ChevronDownIcon open={expanded} className="size-4" />
      </button>

      <div id={panelId} hidden={!expanded} className="border-t border-zinc-200/70 text-xs">
        {inputJson !== null ? (
          <div className={cn("space-y-1.5 p-3", hasOutput && "border-b border-zinc-200/60")}>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Parámetros
            </h4>
            <pre className="overflow-x-auto rounded-lg border border-zinc-200/60 bg-zinc-50 p-2.5 font-mono text-[11.5px] leading-relaxed text-zinc-700">
              {inputJson}
            </pre>
          </div>
        ) : null}

        {hasOutput ? (
          <div className="space-y-1.5 p-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {state === "error" ? "Error en ejecución" : "Resultado"}
            </h4>
            <pre
              className={cn(
                "overflow-x-auto whitespace-pre-wrap rounded-lg border p-2.5 font-mono text-[11.5px] leading-relaxed",
                state === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-zinc-200/60 bg-zinc-50 text-zinc-700",
              )}
            >
              {outputText}
            </pre>
          </div>
        ) : null}

        {inputJson === null && !hasOutput ? (
          <p className="p-3 text-[11.5px] leading-relaxed text-zinc-500">
            Sin detalles disponibles.
          </p>
        ) : null}
      </div>
    </div>
  );
}
