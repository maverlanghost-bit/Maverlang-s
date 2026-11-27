import { describe, expect, it } from "vitest";

import {
  parseSidebarState,
  parseSidebarWidth,
  serializeSidebarCookie,
  serializeSidebarWidthCookie,
  shouldIgnoreSidebarShortcut,
  shouldToggleSidebarClick,
  SIDEBAR_COOKIE,
} from "@/lib/app-shell/sidebar";

describe("parseSidebarState", () => {
  it("ausente o inválido -> expandido", () => {
    expect(parseSidebarState(undefined)).toBe("expanded");
    expect(parseSidebarState(null)).toBe("expanded");
    expect(parseSidebarState("")).toBe("expanded");
    expect(parseSidebarState("expandido")).toBe("expanded");
    expect(parseSidebarState("COLLAPSED")).toBe("expanded");
  });

  it("collapsed -> colapsado, expanded -> expandido", () => {
    expect(parseSidebarState("collapsed")).toBe("collapsed");
    expect(parseSidebarState("expanded")).toBe("expanded");
  });
});

describe("serializeSidebarCookie", () => {
  it("usa la cookie mv_sidebar con path raíz y un año", () => {
    expect(serializeSidebarCookie("collapsed")).toBe(`${SIDEBAR_COOKIE}=collapsed; path=/; max-age=31536000; SameSite=Lax`);
    expect(serializeSidebarCookie("expanded")).toBe(`${SIDEBAR_COOKIE}=expanded; path=/; max-age=31536000; SameSite=Lax`);
  });
});

describe("parseSidebarWidth", () => {
  it("ausente o inválido -> defecto; fuera de rango se acota", () => {
    expect(parseSidebarWidth(undefined)).toBe(200);
    expect(parseSidebarWidth("abc")).toBe(200);
    expect(parseSidebarWidth("-5")).toBe(200);
    expect(parseSidebarWidth("50")).toBe(176);
    expect(parseSidebarWidth("9999")).toBe(320);
    expect(parseSidebarWidth("240")).toBe(240);
  });

  it("serializa acotado en su propia cookie", () => {
    expect(serializeSidebarWidthCookie(1000)).toBe("mv_sidebar_w=320; path=/; max-age=31536000; SameSite=Lax");
  });
});

describe("shouldToggleSidebarClick", () => {
  it("el fondo (sin interactivo cerca) alterna", () => {
    expect(shouldToggleSidebarClick({ closest: () => null })).toBe(true);
    expect(shouldToggleSidebarClick(null)).toBe(true);
  });

  it("sobre links, botones e inputs no alterna", () => {
    const interactive = { closest: () => ({}) };
    expect(shouldToggleSidebarClick(interactive)).toBe(false);
  });

  it("sobre menús ([role='menu']) y superficies estáticas ([data-sidebar-static]) no alterna", () => {
    const matching = (attr: string) => ({
      closest: (selector: string) => (selector.includes(attr) ? {} : null),
    });
    expect(shouldToggleSidebarClick(matching("[role='menu']"))).toBe(false);
    expect(shouldToggleSidebarClick(matching("[data-sidebar-static]"))).toBe(false);
  });
});

describe("shouldIgnoreSidebarShortcut", () => {
  it("ignora inputs, textareas, selects y editables", () => {
    expect(shouldIgnoreSidebarShortcut({ tagName: "INPUT" })).toBe(true);
    expect(shouldIgnoreSidebarShortcut({ tagName: "textarea" })).toBe(true);
    expect(shouldIgnoreSidebarShortcut({ tagName: "SELECT" })).toBe(true);
    expect(shouldIgnoreSidebarShortcut({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("no ignora el cuerpo ni enlaces", () => {
    expect(shouldIgnoreSidebarShortcut({ tagName: "BODY", isContentEditable: false })).toBe(false);
    expect(shouldIgnoreSidebarShortcut({ tagName: "A" })).toBe(false);
    expect(shouldIgnoreSidebarShortcut(null)).toBe(false);
  });
});
