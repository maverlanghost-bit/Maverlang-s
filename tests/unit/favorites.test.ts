import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  FAVORITES_MAX,
  favoritesNeedUpload,
  mergeFavoriteSymbols,
  sanitizeFavoriteSymbols,
} from "@/lib/favorites/merge";

describe("N12: mezcla de favoritas (servidor + local)", () => {
  it("sanea, mayúsculas y sin duplicados", () => {
    expect(sanitizeFavoriteSymbols(["aaplx", " AAPLx ", "nvda x", "", 12, "aaplx"])).toEqual(["AAPLX"]);
  });
  it("une servidor primero y respeta el tope", () => {
    const merged = mergeFavoriteSymbols(["A", "B"], ["B", "C"]);
    expect(merged).toEqual(["A", "B", "C"]);
    expect(mergeFavoriteSymbols(Array.from({ length: 300 }, (_, i) => `S${i}`), ["Z"]).length).toBe(
      FAVORITES_MAX,
    );
  });
  it("detecta si hay algo que subir", () => {
    expect(favoritesNeedUpload(["A"], ["A", "B"])).toBe(true);
    expect(favoritesNeedUpload(["A", "B"], ["A", "B"])).toBe(false);
  });
});

describe("N12: migración 0006 de favoritas", () => {
  const sql = readFileSync(
    path.resolve(__dirname, "..", "..", "supabase/migrations/0006_user_favorites.sql"),
    "utf8",
  );
  it("tabla por usuario con RLS sólo propia", () => {
    expect(sql).toContain("create table if not exists public.user_favorites");
    expect(sql).toContain("primary key (user_id, symbol)");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("for select");
    expect(sql).toContain("for insert");
    expect(sql).toContain("for delete");
    expect(sql).toContain("(select auth.uid()) = user_id");
  });
  it("sin escrituras públicas y sin update", () => {
    expect(sql).toContain("grant select, insert, delete on table public.user_favorites to authenticated");
    expect(sql).not.toContain(" to anon");
    expect(sql).not.toContain("for update");
  });
});

describe("N12: contratos y ruta de favoritas", () => {
  it("contratos exponen GET/PUT /api/me/favorites", () => {
    const source = readFileSync(
      path.resolve(__dirname, "..", "..", "lib/api/contracts.ts"),
      "utf8",
    );
    expect(source).toContain("favoritesRequestSchema");
    expect(source).toContain("favoritesResponseSchema");
    expect(source).toContain('"GET /api/me/favorites"');
    expect(source).toContain('"PUT /api/me/favorites"');
  });
  it("la ruta usa sesión y el servicio de usuarios", () => {
    const source = readFileSync(
      path.resolve(__dirname, "..", "..", "app/api/me/favorites/route.ts"),
      "utf8",
    );
    expect(source).toContain("requireSession");
    expect(source).toContain("listFavorites");
    expect(source).toContain("saveFavorites");
  });
});
