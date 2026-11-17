import type { ReactNode } from "react";
import Link from "next/link";

import { BrandLogoImage } from "@/components/app-shell/brand-image";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";

/**
 * Plantilla única de las pantallas previas al ingreso (ingresar, verificar,
 * registro, recuperar, restablecer). Sólo presentación: no conoce la sesión ni
 * los formularios.
 *
 * - Escritorio (`lg`+): formulario a la izquierda y panel sobrio a la derecha.
 * - Móvil: sólo la columna del formulario.
 *
 * La columna del formulario ajusta, por descendencia, las piezas compartidas
 * que también usa la plataforma (`AuthCard`, `Input`, `Select`): acá la tarjeta
 * va sin borde ni relleno, el logo lo pone la plantilla y los campos son
 * blancos con borde de control. Fuera de la plantilla esas piezas no cambian.
 */
const FORM_COLUMN_OVERRIDES = cn(
  // La tarjeta de acceso se aplana: la columna ya es el contenedor.
  "[&_[data-auth-card]]:my-0 [&_[data-auth-card]]:max-w-none [&_[data-auth-card]]:rounded-none",
  "[&_[data-auth-card]]:border-0 [&_[data-auth-card]]:bg-transparent [&_[data-auth-card]]:p-0",
  // El logo de la tarjeta se oculta: lo muestra la cabecera de la plantilla.
  "[&_[data-auth-logo]]:hidden",
  // Campos blancos con borde de control (el relleno gris se leía deshabilitado).
  "[&_input:not([type=checkbox]):not([type=radio])]:bg-bg",
  "[&_button[aria-haspopup=listbox]]:bg-bg",
  // Títulos de la familia: peso 600.
  "[&_h1]:font-semibold",
);

const footLinkClass =
  "inline-flex min-h-11 items-center rounded-sm px-1.5 text-[13px] text-fg-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-fg hover:decoration-fg";

/**
 * Hechos del producto ya publicados en la portada (`components/landing`).
 * No agregar cifras, testimonios ni promesas de rentabilidad.
 */
const FACTS: { title: string; note?: string }[] = [
  { title: "Comisión 0% en el lanzamiento" },
  {
    title: "Opera 24/7",
    note: "Fuera del horario regular de la bolsa de EE.UU., el precio puede variar más.",
  },
  {
    title: "El token queda en tu propia billetera",
    note: "Nosotros no custodiamos tus activos.",
  },
];

function AuthAside() {
  return (
    <aside
      aria-labelledby="auth-aside-title"
      className="hidden border-l border-border bg-surface-1 lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-16"
    >
      <div className="w-full max-w-md">
        <p className="label">{site.name}</p>
        <h2
          id="auth-aside-title"
          className="mt-4 text-[1.75rem] leading-[1.15] font-semibold tracking-tight text-balance text-fg xl:text-[2rem]"
        >
          Acciones de EE.UU. tokenizadas, en tu billetera
        </h2>
        <ul className="mt-8 divide-y divide-border border-y border-border">
          {FACTS.map((fact, index) => (
            <li key={fact.title} className="flex gap-4 py-4">
              <span aria-hidden="true" className="num w-5 shrink-0 pt-0.5 text-[13px] text-fg-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-base leading-snug font-medium text-fg">{fact.title}</p>
                {fact.note ? (
                  <p className="mt-1 text-[15px] leading-relaxed text-pretty text-fg-muted">{fact.note}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-2">
      <div className={cn("flex min-h-dvh min-w-0 flex-col px-5 py-4 sm:px-8 lg:px-12", FORM_COLUMN_OVERRIDES)}>
        <header>
          <Link href="/" aria-label={site.name} className="inline-flex min-h-11 items-center rounded-sm">
            <BrandLogoImage />
          </Link>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center py-8 sm:py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="mx-auto w-full max-w-sm border-t border-border pt-2">
          <nav aria-label="Ayuda y documentos legales" className="-mx-1.5 flex flex-wrap gap-x-2">
            <Link href="/ayuda" className={footLinkClass}>
              Ayuda
            </Link>
            <Link href="/legal/terminos" className={footLinkClass}>
              Términos
            </Link>
            <Link href="/legal/privacidad" className={footLinkClass}>
              Privacidad
            </Link>
          </nav>
        </footer>
      </div>
      <AuthAside />
    </div>
  );
}
