import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

/**
 * 404 de una ficha (`/acciones/[slug]`). El layout de marketing ya trae el
 * único `<main>`, `lang` y el header: acá sólo va el contenido. Sin
 * ilustración: una dirección que no existe no necesita decoración.
 */
export default function AccionNoEncontrada() {
  return (
    <section className="px-5 py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl">
        <p className="label">404</p>
        <h1 className="mt-3 text-3xl text-balance sm:text-4xl">No encontramos esa acción</h1>
        <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-fg-body">
          La dirección no existe o cambió. En el catálogo está cada ficha pública, con el precio del token y los
          datos de la empresa según la SEC.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/acciones" className={buttonClasses({ variant: "primary" })}>
            Ver todas las acciones
          </Link>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Ir al inicio
          </Link>
        </div>
      </div>
    </section>
  );
}
