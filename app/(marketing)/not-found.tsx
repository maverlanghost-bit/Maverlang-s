import { NotFoundView } from "@/components/ui/not-found-view";

/**
 * 404 de un slug de marketing. El layout ya trae el único `<main>` y `lang`;
 * acá sólo va el contenedor, que repite el inset de 20px y el ritmo vertical
 * de las páginas públicas (antes el texto arrancaba pegado al borde en 360px).
 */
export default function MarketingNotFound() {
  return (
    <section className="px-5 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-7xl">
        <NotFoundView kind="page" />
      </div>
    </section>
  );
}
