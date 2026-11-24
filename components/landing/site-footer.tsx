import Link from "next/link";
import { BrandLogoImage } from "@/components/app-shell/brand-image";
import { FooterWordmark } from "@/components/landing/footer-wordmark";
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
  "inline-flex min-h-11 items-center text-base break-words text-fg transition-colors duration-[140ms] hover:text-fg-muted md:min-h-10";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const mailto = supportMailto();
  const columns = buildColumns(mailto);

  const shortName = site.name.trim().split(/\s+/)[0] || site.name;

  return (
    <footer className="border-t border-border pt-16 pb-[max(2rem,env(safe-area-inset-bottom))] lg:pt-24">
      <div className="mx-auto w-full max-w-[calc(72rem+2.5rem)] px-5">
        {/* Frase a la izquierda; las cuatro columnas de enlaces a la derecha. */}
        <div className="grid gap-x-10 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="max-w-md text-[28px] leading-[1.15] font-medium tracking-[-0.02em] text-fg lg:text-[32px]">
              Acciones de EE.UU., desde Chile y en tu billetera
            </p>

            <p className="mt-5 max-w-xs text-[13px] leading-relaxed text-fg-muted">
              Solana Mainnet &amp; Precios 24/7
            </p>

            <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-muted">
              {architectureNotes.map((note) => (
                <li key={note.label}>{note.label}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:col-span-7">
            {columns.map((column) => (
              <nav key={column.title} aria-label={column.title} className="min-w-0">
                <h2 className="eyebrow">{column.title}</h2>
                <ul className="mt-3">
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

        {/* Cierre: nombre de la marca a todo el ancho, ligado al scroll. */}
        <div className="mt-16 lg:mt-24">
          <FooterWordmark text={shortName} />
          <div className="mt-4 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <BrandLogoImage />
              <p className="text-[13px] text-fg-muted">
                © {year} {site.name}
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
