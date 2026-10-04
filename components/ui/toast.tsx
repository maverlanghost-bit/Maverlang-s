"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/icon-button";
import { IconClose } from "@/components/ui/icons";

export type ToastTone = "neutral" | "up" | "down" | "warn";

type ToastInput = { title: string; description?: string; tone?: ToastTone };
type ToastItem = ToastInput & { id: string };

const toneClass: Record<ToastTone, string> = {
  neutral: "border-l-fg",
  up: "border-l-up",
  down: "border-l-down",
  warn: "border-l-warn",
};

const ToastContext = createContext<{ toast: (input: ToastInput) => void; dismiss: (id: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function dismiss(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function toast(input: ToastInput) {
    const id = `toast-${++seq.current}`;
    setItems((current) => [...current, { ...input, id }].slice(-3));
    const timer = window.setTimeout(() => dismiss(id), 4000);
    timers.current.push(timer);
  }

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 md:inset-x-auto md:right-4 md:w-80">
        <div aria-live="polite" aria-relevant="additions" className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto flex items-start gap-2 rounded-xl border border-border border-l-4 bg-bg p-3 shadow-float",
                toneClass[item.tone ?? "neutral"],
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{item.title}</p>
                {item.description ? <p className="mt-0.5 text-sm text-fg-muted">{item.description}</p> : null}
              </div>
              <IconButton label="Cerrar aviso" size="sm" onClick={() => dismiss(item.id)}>
                <IconClose />
              </IconButton>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast debe usarse dentro de ToastProvider");
  return context;
}
