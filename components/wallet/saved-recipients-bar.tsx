"use client";

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/**
 * Destinatarios frecuentes de la billetera.
 *
 * Vive sólo en el cliente: hasta 5 direcciones Solana con alias en
 * `localStorage` (`mv_saved_recipients_v1`). No toca el servidor ni la sesión,
 * así que un JSON corrupto o un navegador sin almacenamiento simplemente deja
 * la lista vacía. Las direcciones se validan por formato Base58 antes de
 * guardarlas o de ofrecerlas como destino.
 */
const STORAGE_KEY = "mv_saved_recipients_v1";
const MAX_SAVED = 5;
/** Base58 de Solana: sin 0, O, I ni l; entre 32 y 44 caracteres. */
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type SavedRecipient = {
  address: string;
  alias: string;
};

function isSolanaAddress(value: string): boolean {
  return BASE58_ADDRESS.test(value.trim());
}

function shortAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 11) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/** Lee la lista tolerando JSON corrupto, claves raras y direcciones inválidas. */
function readSaved(): SavedRecipient[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const out: SavedRecipient[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const address = typeof record.address === "string" ? record.address.trim() : "";
      if (!isSolanaAddress(address)) continue;
      if (out.some((saved) => saved.address === address)) continue;
      const alias = typeof record.alias === "string" ? record.alias.trim().slice(0, 24) : "";
      out.push({ address, alias });
      if (out.length >= MAX_SAVED) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Persistencia best-effort: modo privado o cuota llena no rompen la pantalla. */
function writeSaved(list: readonly SavedRecipient[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Sin almacenamiento disponible la lista queda sólo en memoria.
  }
}

export function SavedRecipientsBar({
  currentRecipient,
  onSelect,
}: {
  currentRecipient: string;
  onSelect: (address: string) => void;
}) {
  const { language } = useT();
  const isEn = language === "en";

  const copy = isEn
    ? {
        title: "Frequent recipients",
        listLabel: "Saved addresses",
        paste: "Paste",
        pasteInvalid: "The clipboard doesn't hold a valid Solana address.",
        pasteBlocked: "We couldn't read the clipboard. Paste the address with the keyboard.",
        pasted: "Address pasted.",
        empty: "No saved addresses yet. Save one to send faster next time.",
        aliasLabel: "Alias (optional)",
        aliasPlaceholder: "e.g. My Phantom",
        save: "Save",
        saved: "Address saved.",
        duplicate: "That address is already saved.",
        limit: `You can save up to ${MAX_SAVED} addresses. Delete one to add another.`,
        invalid: "The address isn't valid Base58.",
        remove: "Remove",
        useAddress: "Use this address",
      }
    : {
        title: "Destinatarios frecuentes",
        listLabel: "Direcciones guardadas",
        paste: "Pegar",
        pasteInvalid: "El portapapeles no tiene una dirección Solana válida.",
        pasteBlocked: "No pudimos leer el portapapeles. Pega la dirección con el teclado.",
        pasted: "Dirección pegada.",
        empty: "Aún no guardas direcciones. Guarda una para enviar más rápido.",
        aliasLabel: "Alias (opcional)",
        aliasPlaceholder: "Ej. Mi Phantom",
        save: "Guardar",
        saved: "Dirección guardada.",
        duplicate: "Esa dirección ya está guardada.",
        limit: `Puedes guardar hasta ${MAX_SAVED} direcciones. Borra una para agregar otra.`,
        invalid: "La dirección no tiene un formato Base58 válido.",
        remove: "Quitar",
        useAddress: "Usar esta dirección",
      };

  const aliasId = useId();
  const [saved, setSaved] = useState<SavedRecipient[]>([]);
  const [mounted, setMounted] = useState(false);
  const [alias, setAlias] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // El almacenamiento sólo existe en el navegador: se lee después de montar
  // para no romper la hidratación del servidor.
  useEffect(() => {
    // En el primer frame tras pintar: sin setState síncrono dentro del efecto.
    const frame = requestAnimationFrame(() => {
      setSaved(readSaved());
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const current = currentRecipient.trim();
  const currentIsValid = isSolanaAddress(current);
  const alreadySaved = saved.some((item) => item.address === current);
  const atLimit = saved.length >= MAX_SAVED;
  const canSave = currentIsValid && !alreadySaved && !atLimit;
  // Pista visible cuando el botón está deshabilitado, para que no quede mudo.
  const hint =
    feedback ??
    (current.length === 0
      ? ""
      : !currentIsValid
        ? copy.invalid
        : alreadySaved
          ? copy.duplicate
          : atLimit
            ? copy.limit
            : "");

  function handleSave() {
    if (!currentIsValid) {
      setFeedback(copy.invalid);
      return;
    }
    if (alreadySaved) {
      setFeedback(copy.duplicate);
      return;
    }
    if (saved.length >= MAX_SAVED) {
      setFeedback(copy.limit);
      return;
    }
    const next: SavedRecipient[] = [{ address: current, alias: alias.trim().slice(0, 24) }, ...saved];
    setSaved(next);
    writeSaved(next);
    setAlias("");
    setFeedback(copy.saved);
  }

  function handleRemove(address: string) {
    const next = saved.filter((item) => item.address !== address);
    setSaved(next);
    writeSaved(next);
    setFeedback(null);
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      const candidate = text.trim();
      if (!isSolanaAddress(candidate)) {
        setFeedback(copy.pasteInvalid);
        return;
      }
      onSelect(candidate);
      setFeedback(copy.pasted);
    } catch {
      // Portapapeles bloqueado o inexistente: se dice, no se falla en silencio.
      setFeedback(copy.pasteBlocked);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="label">{copy.title}</p>
        <button
          type="button"
          onClick={() => void handlePaste()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-control bg-bg px-3 text-[13px] font-medium text-fg transition-colors duration-150 hover:bg-surface-2 sm:min-h-8"
        >
          <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="8" y="8" width="11" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M15.5 5.5A1.5 1.5 0 0 0 14 4H6.5A1.5 1.5 0 0 0 5 5.5V15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {copy.paste}
        </button>
      </div>

      {!mounted ? (
        <div className="h-8" aria-hidden="true" />
      ) : saved.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={copy.listLabel}>
          {saved.map((item) => {
            const isActive = item.address === current;
            return (
              <li key={item.address} className="flex items-stretch">
                <button
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`${copy.useAddress}: ${item.alias || shortAddress(item.address)}`}
                  onClick={() => {
                    onSelect(item.address);
                    setFeedback(null);
                  }}
                  className={cn(
                    "inline-flex min-h-11 max-w-52 items-center gap-2 rounded-l-full border border-r-0 py-1 pr-2 pl-3 text-xs transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-inset sm:max-w-56",
                    isActive
                      ? "border-control bg-surface-3 text-fg"
                      : "border-border bg-bg text-fg hover:border-control hover:bg-surface-2",
                  )}
                >
                  <span className="truncate font-medium text-fg">{item.alias || shortAddress(item.address)}</span>
                  {item.alias ? (
                    <span className="num shrink-0 truncate text-fg-muted">{shortAddress(item.address)}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.address)}
                  aria-label={`${copy.remove}: ${item.alias || shortAddress(item.address)}`}
                  className={cn(
                    "inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-r-full border py-1 text-fg-muted transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-inset hover:text-down sm:w-9",
                    isActive ? "border-control bg-surface-3" : "border-border bg-bg hover:border-control",
                  )}
                >
                  <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] leading-relaxed text-fg-muted">{copy.empty}</p>
      )}

      <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={aliasId} className="text-[13px] font-medium text-fg">
            {copy.aliasLabel}
          </label>
          <Input
            id={aliasId}
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            maxLength={24}
            placeholder={copy.aliasPlaceholder}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={handleSave} disabled={!canSave} className="shrink-0 whitespace-nowrap">
          {copy.save}
        </Button>
      </div>

      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs leading-relaxed text-fg-muted">
        {hint}
      </p>
    </div>
  );
}
