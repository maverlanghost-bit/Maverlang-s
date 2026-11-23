import Link from "next/link";
import { BrandLogoImage } from "@/components/app-shell/brand-image";
import { site, supportMailto } from "@/config/site";

/**
 * Cuatro columnas en orden de lectura: descubrir → entender → resolver → cumplir.
 * El correo de soporte cierra «Ayuda» cuando está configurado; si no, la columna
 * termina en «Preguntas», que es el mismo destino de soporte.
 * Los CTA («Entrar», «Conoce la plataforma») no se repiten aquí: viven en el header.
 */
type FooterColumn = { title: string; links: { href: string; label: string }[] };

function buildColumns(mailto: string | null): FooterColumn[] {
  return [
    {
      title: "Explorar",
      links: [
        { href: "/acciones", label: "Acciones" },
        { href: "/categorias", label: "Categorías" },
        { href: "/comparar", label: "Comparar" },
        { href: "/guias", label: "Guías" },
      ],
    },
    {
      title: "Producto",
      links: [
        { href: "/como-funciona", label: "Cómo funciona" },
        { href: "/costos", label: "Costos" },
        { href: "/seguridad", label: "Seguridad" },
      ],
    },
    {
      title: "Ayuda",
      links: [
        { href: "/ayuda", label: "Ayuda" },
        { href: "/#preguntas", label: "Preguntas" },
        ...(mailto ? [{ href: mailto, label: site.supportEmail }] : []),
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/legal/terminos", label: "Términos" },
        { href: "/legal/privacidad", label: "Privacidad" },
        { href: "/legal/riesgos", label: "Riesgos" },
        { href: "/legal/comisiones", label: "Comisiones" },
      ],
    },
  ];
}

/** Notas de arquitectura junto a la marca. Texto fijo, sin datos de negocio. */
const architectureNotes: { label: string }[] = [
  { label: "Autocustodia SPL" },
  { label: "xStocks 1:1" },
  { label: "Sin custodia de terceros" },
];

/* El subrayado lo pone `footer nav a` en globals.css (C-08): el enlace se
   distingue sin depender del color. Aquí sólo tamaño táctil y tinta. */
const footerLinkClass =
  "inline-flex min-h-11 items-center text-sm break-words text-fg-body transition-colors duration-[140ms] hover:text-fg md:min-h-9";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const mailto = supportMailto();
  const columns = buildColumns(mailto);

  return (
    <footer className="border-t border-border pt-14 pb-[max(2.5rem,env(safe-area-inset-bottom))] lg:pt-20">
      <div className="mx-auto w-full max-w-[calc(72rem+2.5rem)] px-5">
        {/* Marca y notas a la izquierda; las cuatro columnas de enlaces a la derecha. */}
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <BrandLogoImage />

            {/* Monocromo: el color queda reservado para datos. */}
            <p className="mt-5 flex max-w-xs items-start gap-2 text-[13px] leading-relaxed text-fg-muted">
              <span aria-hidden="true" className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-fg" />
              <span className="min-w-0">Sistemas operativos · Solana Mainnet &amp; Precios 24/7</span>
            </p>

            <ul className="mt-4 flex flex-wrap items-center gap-1.5">
              {architectureNotes.map((note) => (
                <li key={note.label}>
                  <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs leading-none font-medium whitespace-nowrap text-fg-body">
                    {note.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:col-span-8">
            {columns.map((column) => (
              <nav key={column.title} aria-label={column.title} className="min-w-0">
                <h2 className="eyebrow">{column.title}</h2>
                <ul className="mt-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      {link.href.startsWith("mailto:") ? (
                        <a href={link.href} className={footerLinkClass}>
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} className={footerLinkClass}>
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* Una sola franja con el aviso legal general.
            Textos legales todavía en borrador. La marca interna [REVISIÓN ABOGADO]
            queda en el contenido, pero no se publica en el sitio. Ninguna frase cambia. */}
        <div className="mt-14 rounded-2xl border border-border bg-surface-1 px-5 py-5 sm:px-6 lg:mt-16">
          <div className="grid gap-x-10 gap-y-2 text-[13px] leading-relaxed lg:grid-cols-2">
            <p className="text-fg-body">
              El token es tuyo y está en tu billetera. No te convierte en accionista registrado ni te da derecho a voto. Invertir implica riesgos.
            </p>
            <div className="space-y-2">
              {/* M83: atribución de marcas. Los logos siguen encendidos
                  (NEXT_PUBLIC_COMPANY_LOGOS=on por defecto) mientras el abogado
                  no decida lo contrario (docs/legal/aprobados/logos.md). */}
              <p className="text-fg-body">
                Las marcas pertenecen a sus dueños; se usan solo para identificar el activo.
              </p>
              <p className="font-medium text-fg">No disponible para personas de EE.UU.</p>
            </div>
          </div>
        </div>

        {/* Cierre: nombre de la marca en grande. Es decorativo
            (el logo de arriba ya nombra la marca), por eso queda fuera del árbol accesible. */}
        <div className="mt-12 lg:mt-16">
          <p
            aria-hidden="true"
            className="overflow-hidden pb-[0.14em] text-[clamp(2rem,10.5vw,8rem)] leading-none font-semibold tracking-[-0.05em] whitespace-nowrap text-fg-subtle select-none"
          >
            {site.name}
          </p>
          <p className="mt-6 border-t border-border pt-5 text-[13px] text-fg-muted">
            © {year} {site.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
