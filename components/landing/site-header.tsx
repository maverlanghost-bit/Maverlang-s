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

/** Agrupado bajo «Explorar»: descubre el catálogo, no lo explica. */
const NAV_EXPLORE = [
  { href: "/categorias", label: "Categorías" },
  { href: "/comparar", label: "Comparar" },
  { href: "/guias", label: "Guías" },
] as const;

/** Lo que explica el producto, en el orden de siempre. */
const NAV_PRODUCT = [
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/costos", label: "Costos" },
  { href: "/seguridad", label: "Seguridad" },
] as const;

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
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    const list = links();
    if (list.length === 0) return;
    event.preventDefault();
    const index = list.indexOf(document.activeElement as HTMLAnchorElement);
    let next = 0;
    if (event.key === "ArrowUp") next = index < 0 ? list.length - 1 : (index + list.length - 1) % list.length;
    else if (event.key === "End") next = list.length - 1;
    else if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % list.length;
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
          className="absolute top-full left-0 z-10 mt-4 w-56 rounded-xl border border-border bg-bg p-1.5 shadow-float motion-safe:animate-pop-in motion-reduce:animate-none"
        >
          <ul>
            {NAV_EXPLORE.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className="flex h-10 items-center rounded-xl px-3 text-sm text-fg-body transition duration-[140ms] ease-spring hover:bg-surface-2 hover:text-fg aria-[current=page]:font-medium aria-[current=page]:text-fg"
                >
                  {item.label}
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
        scrolled ? "border-border bg-bg/80 backdrop-blur-md" : "border-transparent bg-transparent",
        show ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-5 sm:gap-3">
        <Link href="/" aria-label={site.name} className="flex min-w-0 shrink items-center rounded-full text-fg">
          <BrandLogoImage priority />
        </Link>

        <nav aria-label="Principal" className="ml-auto hidden items-center gap-1 md:flex lg:gap-2">
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

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-4">
          {/* D1: el header no lleva `primary`; el único negro de la vista es el CTA del hero. */}
          <Button asChild variant="ghost" size="md" className="min-h-11 px-4">
            <Link href="/app/ingresar">Entrar</Link>
          </Button>
          <IconButton
            label={open ? "Cerrar menú" : "Abrir menú"}
            size="md"
            className="md:hidden"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <IconMenu />
          </IconButton>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen} title="Menú">
        <nav aria-label="Móvil" className="flex flex-col">
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
                  className={cn(mobileLinkClass, "text-[15px] text-fg-body aria-[current=page]:text-fg")}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
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

          {/* Único CTA de la vista pública: ghost, nunca negro (D1). */}
          <Button asChild variant="ghost" size="md" className="mt-4 min-h-11 w-full border border-control">
            <Link href="/app/ingresar" onClick={() => setOpen(false)}>
              Entrar
            </Link>
          </Button>
        </nav>
      </Sheet>
    </header>
  );
}
