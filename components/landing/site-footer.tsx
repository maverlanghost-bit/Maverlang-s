import type { ReactNode } from "react";
import Link from "next/link";
import { esCL } from "@/content/i18n/es-CL";
import { site, supportMailto } from "@/config/site";

const columns: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Producto",
    links: [
      { href: "/#como-funciona", label: "Cómo funciona" },
      { href: "/#costos", label: "Costos" },
      { href: "/#seguridad", label: "Seguridad" },
      { href: "/#preguntas", label: "Preguntas" },
      { href: "/ayuda", label: "Ayuda" },
      { href: "/app", label: esCL.guest.seeStocks },
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
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
          <span className="text-sm font-medium text-fg">{site.name}</span>
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
                  <span className="flex min-h-11 items-center text-sm text-fg-muted">Correo de soporte por publicar.</span>
                )}
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 space-y-3 border-t border-border pt-8 text-sm leading-relaxed">
          <p className="text-fg-body">
            El token es tuyo y está en tu billetera. No te convierte en accionista registrado ni te da derecho a voto. Invertir implica riesgos.{" "}
            <span className="font-medium text-warn">[REVISIÓN ABOGADO]</span>
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
