import Link from "next/link";

import { PageHero } from "@/components/landing/page-hero";
import { buttonClasses } from "@/components/ui/button";

/**
 * 404 de una ficha (`/acciones/[slug]`). El layout de marketing ya trae el
 * único `<main>`, `lang` y el header: acá sólo va el contenido. Sin
 * ilustración: una dirección que no existe no necesita decoración.
 */
export default function AccionNoEncontrada() {
  return (
    <PageHero
      titleId="accion-404-title"
      eyebrow="404"
      title="No encontramos esa acción"
      actions={
        <>
          <Link href="/acciones" className={buttonClasses({ variant: "primary", size: "lg" })}>
            Ver todas las acciones
          </Link>
          <Link href="/" className={buttonClasses({ variant: "secondary", size: "lg" })}>
            Ir al inicio
          </Link>
        </>
      }
      className="border-b-0 pb-20 md:pb-28"
    >
      <p>
        La dirección no existe o cambió. En el catálogo está cada ficha pública, con el precio del token y los datos
        de la empresa según la SEC.
      </p>
    </PageHero>
  );
}
