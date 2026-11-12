import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogoImage } from "@/components/app-shell/brand-image";
import { site, supportMailto } from "@/config/site";

/**
 * Tres columnas en orden de lectura: descubrir → entender → cumplir.
 * El correo de soporte cierra «Producto» cuando está configurado; si no,
 * la columna termina en «Ayuda», que es el mismo destino de soporte.
 * El CTA «Entrar» no se repite aquí: vive sólo en el header.
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
        { href: "/#preguntas", label: "Preguntas" },
      ],
    },
    {
      title: "Producto",
      links: [
        { href: "/como-funciona", label: "Cómo funciona" },
        { href: "/costos", label: "Costos" },
        { href: "/seguridad", label: "Seguridad" },
        { href: "/ayuda", label: "Ayuda" },
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

/** Píldoras de arquitectura de la franja superior. Texto fijo, sin datos de negocio. */
const architecturePills: { label: string }[] = [
  { label: "Autocustodia SPL" },
  { label: "xStocks 1:1" },
  { label: "Sin custodia de terceros" },
];

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 items-center text-sm text-fg-body hover:text-fg md:min-h-8">
      {children}
    </Link>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const mailto = supportMailto();
  const columns = buildColumns(mailto);

  return (
    <footer className="border-t border-border px-5 py-12 lg:py-14">
      <div className="mx-auto w-full max-w-7xl">
        {/* Franja superior: marca a la izquierda, estado del sistema y arquitectura
            a la derecha. Con flex-wrap se apila sin romper en móvil. */}
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <BrandLogoImage />

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-up/15 bg-up-bg px-2.5 py-1 text-xs leading-tight font-medium text-up">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-up motion-safe:animate-pulse motion-reduce:animate-none"
              />
              <span className="min-w-0">Sistemas operativos · Solana Mainnet &amp; Precios 24/7</span>
            </span>

            <ul className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {architecturePills.map((pill) => (
                <li key={pill.label}>
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-1 px-2.5 py-1 text-xs leading-none font-medium whitespace-nowrap text-fg-body">
                    {pill.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-9 sm:gap-x-10 md:grid-cols-3 lg:gap-x-16">
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="eyebrow">{column.title}</h2>
              <ul className="mt-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("mailto:") ? (
                      <a
                        href={link.href}
                        className="flex min-h-11 items-center text-sm break-words text-fg-body hover:text-fg md:min-h-8"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <FooterLink href={link.href}>{link.label}</FooterLink>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-8">
          {/* Textos legales todavía en borrador. La marca interna [REVISIÓN ABOGADO]
              queda en el contenido, pero no se publica en el sitio.
              D1: 13px y dos columnas en lg para que el pie deje de pesar más
              que el contenido. Ninguna frase cambia. */}
          <div className="grid gap-x-10 gap-y-3 text-[13px] leading-relaxed lg:grid-cols-2">
            <p className="text-fg-body">
              El token es tuyo y está en tu billetera. No te convierte en accionista registrado ni te da derecho a voto. Invertir implica riesgos.
            </p>
            {/* M83: atribución de marcas. Los logos siguen encendidos
                (NEXT_PUBLIC_COMPANY_LOGOS=on por defecto) mientras el abogado
                no decida lo contrario (docs/legal/aprobados/logos.md). */}
            <p className="text-fg-body">
              Las marcas pertenecen a sus dueños; se usan solo para identificar el activo.
            </p>
            <p className="font-medium text-fg">No disponible para personas de EE.UU.</p>
            <p className="text-fg-muted">
              © {year} {site.name}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
