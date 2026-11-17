"use client";

export function ActiveFilters({ filters, onClear, language = "es-CL" }: { language?: "es-CL" | "en"; filters: readonly { id: string; label: string; remove: () => void }[]; onClear: () => void }) {
  if (!filters.length) return null;
  return <div className="flex flex-wrap items-center gap-2" aria-label={language === "en" ? "Active filters" : "Filtros activos"}>{filters.map((filter) => <button key={filter.id} type="button" onClick={filter.remove} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-surface-1 px-3 text-xs text-fg sm:min-h-9" aria-label={`${language === "en" ? "Remove filter" : "Quitar filtro"}: ${filter.label}`}><span className="truncate">{filter.label}</span><span aria-hidden="true">×</span></button>)}<button type="button" onClick={onClear} className="min-h-11 px-2 text-xs text-fg-muted underline sm:min-h-9">{language === "en" ? "Clear all" : "Limpiar todo"}</button></div>;
}
