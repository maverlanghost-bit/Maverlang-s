"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Ocupa el área visible: bajo la barra superior, sobre las pestañas y
 * sobre el teclado (`visualViewport`). En escritorio deja la barra lateral.
 */
export function useChatViewport(panelRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const apply = () => {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const vv = window.visualViewport;
      const offsetTop = vv?.offsetTop ?? 0;
      const height = vv?.height ?? window.innerHeight;
      const keyboard = Math.max(0, window.innerHeight - offsetTop - height);
      const header = desktop ? 0 : headerHeight(panel);
      const left = desktop ? asideWidth(panel) : 0;
      const tabs = desktop || keyboard > 80 ? 0 : tabsHeight();
      panel.style.top = `${offsetTop}px`;
      panel.style.left = `${left}px`;
      panel.style.right = "0px";
      panel.style.height = `${Math.max(0, height)}px`;
      panel.style.paddingTop = `${header}px`;
      panel.style.paddingBottom = `${tabs}px`;
    };

    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    const query = window.matchMedia("(min-width: 1024px)");
    query.addEventListener("change", apply);
    const observer = new ResizeObserver(apply);
    const header = chromeHeader(panel);
    const aside = chromeAside(panel);
    if (header) observer.observe(header);
    if (aside) observer.observe(aside);

    return () => {
      root.style.overflow = previousOverflow;
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      query.removeEventListener("change", apply);
      observer.disconnect();
    };
  }, [panelRef]);
}

function chromeHeader(panel: HTMLElement): HTMLElement | null {
  for (const header of document.querySelectorAll("header")) {
    if (!panel.contains(header)) return header;
  }
  return null;
}

function chromeAside(panel: HTMLElement): HTMLElement | null {
  for (const aside of document.querySelectorAll("aside")) {
    if (!panel.contains(aside)) return aside;
  }
  return null;
}

function headerHeight(panel: HTMLElement): number {
  const header = chromeHeader(panel);
  if (!header) return 0;
  return Math.max(0, header.getBoundingClientRect().height);
}

function asideWidth(panel: HTMLElement): number {
  const aside = chromeAside(panel);
  if (!aside) return 0;
  return Math.max(0, aside.getBoundingClientRect().width);
}

function tabsHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--app-tabs-height");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}
