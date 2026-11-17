"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogoImage } from "@/components/app-shell/brand-image";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconChevron, IconMenu } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";

/** Primer destino: el catálogo. Vive fuera del desplegable a propósito. */
const NAV_LEAD = { href: "/acciones", label: "Acciones" } as const;

/** Agrupado bajo «Explorar»: descubre el catálogo, no lo explica. Una línea factual por destino. */
const NAV_EXPLORE = [
  { href: "/categorias", label: "Categorías", description: "Acciones agrupadas por sector y tema." },
  { href: "/comparar", label: "Comparar", description: "Dos activos lado a lado." },
  { href: "/guias", label: "Guías", description: "Explicaciones cortas, sin asesoría." },
] as const;

/** Lo que explica el producto, en el orden de siempre. */
const NAV_PRODUCT = [
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/costos", label: "Costos" },
  { href: "/seguridad", label: "Seguridad" },
] as const;

const LOGIN_HREF = "/app/ingresar";
const DEMO_HREF = "/app/registro";
const DEMO_LABEL = "Probar la demo";

const SCROLL_OFFSET = 8;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isShown(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

/** `skipInert` omite regiones inertes. El header oculto está inerte: sus controles se listan aparte. */
function focusableWithin(root: ParentNode, skipInert: boolean): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (skipInert && el.closest("[inert]")) return false;
    return isShown(el);
  });
}

function isBefore(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function revealHeader(header: HTMLElement) {
  header.inert = false;
  header.classList.remove("-translate-y-full");
  header.classList.add("translate-y-0");
}

function subscribeScroll(onStoreChange: () => void) {
  window.addEventListener("scroll", onStoreChange, { passive: true });
  return () => window.removeEventListener("scroll", onStoreChange);
}

function scrolledSnapshot() {
  return window.scrollY > SCROLL_OFFSET;
}

function scrolledServerSnapshot() {
  return false;
}

/** Activo también en las rutas hijas: `/acciones/aapl` mantiene vivo `/acciones`. */
function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const linkClass =
  "inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-2 text-sm text-fg-body transition duration-[140ms] ease-spring hover:text-fg active:scale-[0.98]";

const mobileLinkClass =
  "flex h-12 items-center rounded-xl px-3 text-base text-fg transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98]";

/**
 * «Explorar» con patrón disclosure (sin `role="menu"`): son enlaces de
 * navegación, así que Tab los recorre de forma natural y las flechas son un
 * extra. Escape cierra y devuelve el foco al disparador; salir con Tab o tocar
 * fuera también cierra, sin robar el foco.
 */
function ExploreMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = NAV_EXPLORE.some((item) => isCurrent(pathname, item.href));
  const pathRef = useRef(pathname);

  // Navegar cierra el panel; el foco ya se fue con el clic.
  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const links = useCallback(
    () => [...(panelRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])],
    [],
  );

  const closeAndRestore = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openAt = (edge: "first" | "last") => {
    setOpen(true);
    requestAnimationFrame(() => {
      const list = links();
      (edge === "first" ? list[0] : list[list.length - 1])?.focus();
    });
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      closeAndRestore();
      return;
    }
    if (!open) return;
    // El panel es una grilla: las flechas horizontales recorren igual que las verticales.
    const back = event.key === "ArrowUp" || event.key === "ArrowLeft";
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    if (!back && !forward && event.key !== "Home" && event.key !== "End") return;
    const list = links();
    if (list.length === 0) return;
    event.preventDefault();
    const index = list.indexOf(document.activeElement as HTMLAnchorElement);
    let next = 0;
    if (back) next = index < 0 ? list.length - 1 : (index + list.length - 1) % list.length;
    else if (event.key === "End") next = list.length - 1;
    else if (forward) next = index < 0 ? 0 : (index + 1) % list.length;
    list[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openAt("first");
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openAt("last");
          }
        }}
        className={cn(linkClass, "inline-flex items-center gap-1", (open || active) && "text-fg")}
      >
        Explorar
        <IconChevron
          className={cn(
            "size-3.5 text-fg-muted transition-transform duration-[140ms] ease-spring",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute top-full left-0 z-10 mt-3 w-[40rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border bg-bg p-2 shadow-float motion-safe:animate-pop-in motion-reduce:animate-none"
        >
          <ul className="grid grid-cols-3 gap-1">
            {NAV_EXPLORE.map((item) => (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className="group flex min-h-11 w-full flex-col gap-1 rounded-xl p-4 transition duration-[140ms] ease-spring hover:bg-surface-1 aria-[current=page]:bg-surface-1"
                >
                  <span className="text-sm font-medium text-fg">{item.label}</span>
                  <span className="text-[13px] leading-snug text-pretty text-fg-muted group-hover:text-fg-body">
                    {item.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const scrolled = useSyncExternalStore(subscribeScroll, scrolledSnapshot, scrolledServerSnapshot);
  /** Se oculta al bajar y reaparece al subir (con el menú abierto, siempre visible). */
  const [hidden, setHidden] = useState(false);
  const [focusedWithin, setFocusedWithin] = useState(false);
  const [keyboardReveal, setKeyboardReveal] = useState(false);
  const lastY = useRef(0);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const prev = lastY.current;
      lastY.current = y;
      const header = headerRef.current;
      const inside = !!header && header.contains(document.activeElement);
      if (y < 64 || y < prev - 2 || inside) setHidden(false);
      else if (y > prev + 2) {
        setHidden(true);
        setKeyboardReveal(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const header = headerRef.current;
      if (!header?.inert) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const items = focusableWithin(header, false);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const outside = focusableWithin(document.body, true).filter((el) => !header.contains(el));
      const index = outside.indexOf(active);
      if (index < 0) return;

      if (!event.shiftKey) {
        const next = outside[index + 1];
        if (!isBefore(active, first) || !(next === undefined || isBefore(last, next))) return;
        event.preventDefault();
        revealHeader(header);
        setKeyboardReveal(true);
        setFocusedWithin(true);
        first.focus();
        return;
      }

      const prev = index > 0 ? outside[index - 1] : undefined;
      if (!isBefore(last, active) || !(prev === undefined || isBefore(prev, first))) return;
      event.preventDefault();
      revealHeader(header);
      setKeyboardReveal(true);
      setFocusedWithin(true);
      last.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const show = !hidden || open || focusedWithin || keyboardReveal;

  return (
    <header
      ref={headerRef}
      inert={!show}
      onFocus={() => setFocusedWithin(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setFocusedWithin(false);
      }}
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-16 border-b transition-[background-color,border-color,backdrop-filter,transform] duration-500 ease-spring",
        // Al bajar: sólido por defecto; translúcido con desenfoque sólo si el navegador
        // soporta `backdrop-filter`, y sólido otra vez si se pide menos transparencia.
        scrolled
          ? "border-border bg-bg supports-[backdrop-filter]:bg-bg/75 supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150 [@media(prefers-reduced-transparency:reduce)]:bg-bg! [@media(prefers-reduced-transparency:reduce)]:backdrop-filter-none!"
          : "border-transparent bg-transparent",
        show ? "translate-y-0" : "-translate-y-full",
      )}
    >
      {/* 72rem + el px-5 de cada lado: el logo alinea con el contenido de las secciones. */}
      <div className="mx-auto flex h-full w-full max-w-[calc(72rem+2.5rem)] items-center px-5">
        <Link
          href="/"
          aria-label={site.name}
          className="flex min-h-11 min-w-0 shrink items-center rounded-full text-fg"
        >
          <BrandLogoImage priority />
        </Link>

        {/* Logo y navegación van juntos a la izquierda; las acciones, a la derecha.
            La navegación completa entra desde `lg`: con el CTA de la demo no cabe en 768 px. */}
        <nav aria-label="Principal" className="ml-6 hidden items-center gap-1 lg:flex xl:ml-8">
          <Link
            href={NAV_LEAD.href}
            aria-current={isCurrent(pathname, NAV_LEAD.href) ? "page" : undefined}
            className={cn(linkClass, "aria-[current=page]:text-fg")}
          >
            {NAV_LEAD.label}
          </Link>
          <ExploreMenu />
          {NAV_PRODUCT.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              className={cn(linkClass, "aria-[current=page]:text-fg")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 pl-3 sm:gap-2">
          <Button asChild variant="ghost" size="md" className="min-h-11 px-4 md:px-4">
            <Link href={LOGIN_HREF}>Entrar</Link>
          </Button>
          {/* Plan de rediseño §5: la demo es la píldora negra del header, visible en
              cualquier posición de scroll. En móvil vive fija al pie de la hoja. */}
          <Button asChild variant="primary" size="sm" className="hidden px-4 sm:inline-flex">
            <Link href={DEMO_HREF}>{DEMO_LABEL}</Link>
          </Button>
          <IconButton
            label={open ? "Cerrar menú" : "Abrir menú"}
            size="md"
            className="lg:hidden"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <IconMenu />
          </IconButton>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen} title="Menú" fill>
        <nav aria-label="Móvil" className="flex flex-col pb-4">
          <Link
            href={NAV_LEAD.href}
            aria-current={isCurrent(pathname, NAV_LEAD.href) ? "page" : undefined}
            className={mobileLinkClass}
            onClick={() => setOpen(false)}
          >
            {NAV_LEAD.label}
          </Link>

          {/* Grupo con rótulo: en móvil no hay desplegable, los tres destinos van a la vista. */}
          <h3 className="eyebrow mt-3 border-t border-border px-3 pt-5">Explorar</h3>
          <ul className="-mt-1">
            {NAV_EXPLORE.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  className="flex min-h-14 flex-col justify-center gap-0.5 rounded-xl px-3 py-2 transition duration-[140ms] ease-spring hover:bg-surface-2 active:scale-[0.98] aria-[current=page]:bg-surface-1"
                  onClick={() => setOpen(false)}
                >
                  <span className="text-[15px] text-fg">{item.label}</span>
                  <span className="text-[13px] leading-snug text-fg-muted">{item.description}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-col border-t border-border pt-2">
            {NAV_PRODUCT.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                className={cn(mobileLinkClass, "aria-[current=page]:font-medium")}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Acciones fijas al pie de la hoja: la demo primero, «Entrar» como secundaria. */}
        <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-col gap-2 border-t border-border bg-bg px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:-mx-7 md:px-7 md:pb-5">
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href={DEMO_HREF} onClick={() => setOpen(false)}>
              {DEMO_LABEL}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="md" className="min-h-11 w-full">
            <Link href={LOGIN_HREF} onClick={() => setOpen(false)}>
              Entrar
            </Link>
          </Button>
        </div>
      </Sheet>
    </header>
  );
}
