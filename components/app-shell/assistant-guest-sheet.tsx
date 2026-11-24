"use client";

import Link from "next/link";

import { Dialog } from "@/components/ui/dialog";
import { buttonClasses } from "@/components/ui/button";
import { ingresarPath, registroPath } from "@/lib/auth/paths";
import { useT } from "@/lib/hooks/use-t";

const ASSISTANT_PATH = "/app/asistente";

/** Hoja para quien no tiene sesión: explica el Asistente y lleva a crear cuenta o ingresar. */
export function AssistantGuestSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { language } = useT();
  const en = language === "en";
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={en ? "Your investing assistant" : "Tu asistente de inversión"}>
      <p className="text-sm leading-6 text-fg-body">
        {en
          ? "Create your free account to ask questions about stocks and your portfolio."
          : "Crea tu cuenta gratis para hacerle preguntas sobre acciones y tu cartera."}
      </p>
      <div className="mt-5 flex flex-col items-stretch gap-3">
        <Link href={registroPath(ASSISTANT_PATH)} className={buttonClasses({ variant: "primary", size: "lg" })} onClick={() => onOpenChange(false)}>
          {en ? "Create account" : "Crear cuenta"}
        </Link>
        <Link
          href={ingresarPath(ASSISTANT_PATH)}
          className="inline-flex h-11 items-center justify-center rounded-full text-sm font-medium text-fg underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-fg"
          onClick={() => onOpenChange(false)}
        >
          {en ? "I already have an account" : "Ya tengo cuenta"}
        </Link>
      </div>
    </Dialog>
  );
}
