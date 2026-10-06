import { describe, expect, it } from "vitest";

import {
  parseSidebarState,
  serializeSidebarCookie,
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

describe("shouldToggleSidebarClick", () => {
  it("el fondo (sin interactivo cerca) alterna", () => {
    expect(shouldToggleSidebarClick({ closest: () => null })).toBe(true);
    expect(shouldToggleSidebarClick(null)).toBe(true);
  });

  it("sobre links, botones e inputs no alterna", () => {
    const interactive = { closest: () => ({}) };
    expect(shouldToggleSidebarClick(interactive)).toBe(false);
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
