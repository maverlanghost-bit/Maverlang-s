import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogoImage } from "@/components/app-shell/brand-image";
import { esCL } from "@/content/i18n/es-CL";
import { site, supportMailto } from "@/config/site";

const columns: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Producto",
    links: [
      { href: "/como-funciona", label: "Cómo funciona" },
      { href: "/costos", label: "Costos" },
      { href: "/seguridad", label: "Seguridad" },
      { href: "/acciones", label: esCL.guest.seeStocks },
      { href: "/#preguntas", label: "Preguntas" },
      { href: "/ayuda", label: "Ayuda" },
      { href: "/app/ingresar", label: "Entrar" },
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

/** Píldoras de arquitectura de la franja superior. Texto fijo, sin datos de negocio. */
const architecturePills: { label: string }[] = [
  { label: "Autocustodia SPL" },
  { label: "xStocks 1:1" },
  { label: "Sin custodia de terceros" },
];

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 items-center text-sm text-fg-body hover:text-fg">
      {children}
    </Link>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const mailto = supportMailto();

  return (
    <footer className="border-t border-border px-5 py-16">
      <div className="mx-auto w-full max-w-7xl">
        {/* Franja superior: marca a la izquierda, estado del sistema y arquitectura
            a la derecha. Con flex-wrap se apila sin romper en móvil. */}
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <BrandLogoImage />

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-up/15 bg-up-bg px-2.5 py-1 text-[11px] leading-tight font-medium text-up">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-up motion-safe:animate-pulse motion-reduce:animate-none"
              />
              <span className="min-w-0">Sistemas operativos · Solana Mainnet &amp; Precios 24/7</span>
            </span>

            <ul className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {architecturePills.map((pill) => (
                <li key={pill.label}>
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-1 px-2.5 py-1 text-[11px] leading-none font-medium whitespace-nowrap text-fg-body">
                    {pill.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 grid gap-10 sm:grid-cols-3">
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="label">{column.title}</h2>
              <ul className="mt-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <FooterLink href={link.href}>{link.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Contacto">
            <h2 className="label">Contacto</h2>
            <ul className="mt-3">
              <li>
                <FooterLink href="/ayuda">Centro de ayuda</FooterLink>
              </li>
              <li>
                {mailto ? (
                  <a href={mailto} className="flex min-h-11 items-center text-sm text-fg-body hover:text-fg">
                    {site.supportEmail}
                  </a>
                ) : (
                  <FooterLink href="/ayuda">Soporte en el centro de ayuda</FooterLink>
                )}
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 space-y-3 border-t border-border pt-8 text-sm leading-relaxed">
          {/* Textos legales todavía en borrador. La marca interna [REVISIÓN ABOGADO]
              queda en el contenido, pero no se publica en el sitio. */}
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
    </footer>
  );
}
