import { describe, expect, it } from "vitest";

import { FIXTURE_DETAILS, FIXTURE_INDEX, FIXTURE_STATUS } from "@/lib/copy/fixtures";
import { FeedPayloadError, parseFeedDetail, parseFeedIndex, parseFeedStatus } from "@/lib/copy/schema";
import { canonicalJson, verifyFeedIndexSignature } from "@/lib/copy/signature";

/**
 * Contrato FINAL de Faro (docs/FRACCION_FEED_FORMATO.md, v1):
 * índice firmado Ed25519 sobre JSON canónico (sort_keys, separadores
 * compactos, UTF-8 sin escapar: `ensure_ascii=False` en feed_sign.py), detalle
 * plano sin performance, status con ok | partial | empty.
 *
 * El vector de abajo lo firmó Python (json.dumps con esos mismos parámetros)
 * con un par Ed25519 DESECHABLE generado solo para este test. No es la clave de
 * prueba de Faro ni ninguna clave real.
 */
const PY_VECTOR = {
  "publicKeyRaw": "bxK83O0lF0U1NXstCgR1xhsJIFdMIuCS9XHjWfotI/I=",
  "index": {
    "schema": "fraccion.feed.index.v1",
    "generated_at": "2026-11-10T11:00:00Z",
    "key_id": "vector-maverlang",
    "families": [
      "13f",
      "etf"
    ],
    "portfolio_count": 1,
    "portfolios": [
      {
        "slug": "norges-bank-13f",
        "aliases": [],
        "name": "Norges Bank (13F) — Fondo soberano de Noruega, «año» ñ",
        "family": "13f",
        "as_of": "2026-09-30",
        "filed_at": null,
        "version_id": "v1:abababababababababababababababababababababababababababababababab",
        "coverage": "top50_of_full_book",
        "is_frozen": false,
        "is_complete": false,
        "copyable_hint": "informational",
        "detail_path": "portfolios/norges-bank-13f.json",
        "detail_sha256": "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"
      }
    ],
    "aliases": {},
    "signature": {
      "alg": "ed25519",
      "key_id": "vector-maverlang",
      "sig": "OJ06zHXTp8D7tXpOy5t3JTW1drc60i3EYKNqzv3pUopyPtr7qe2RGarghKsW4ZT5LvclKsdsfvXdjerTuFX9BQ=="
    }
  }
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("feed v1 de Fraccion.si: firma compatible con Python", () => {
  it("verifica un índice firmado por feed_sign.py (con tildes y ñ sin escapar)", () => {
    const check = verifyFeedIndexSignature(PY_VECTOR.index, PY_VECTOR.publicKeyRaw, "vector-maverlang");
    expect(check.ok).toBe(true);
  });

  it("rechaza el índice si se altera un byte firmado", () => {
    const tampered = clone(PY_VECTOR.index) as { portfolios: { name: string }[] };
    tampered.portfolios[0]!.name = "Otro nombre";
    expect(verifyFeedIndexSignature(tampered, PY_VECTOR.publicKeyRaw).ok).toBe(false);
  });

  it("rechaza otra key_id cuando Maverlang fija la esperada", () => {
    const check = verifyFeedIndexSignature(PY_VECTOR.index, PY_VECTOR.publicKeyRaw, "otra-clave");
    expect(check.ok).toBe(false);
  });

  it("canonicaliza como Python: claves ordenadas, sin espacios y sin escapar UTF-8", () => {
    expect(canonicalJson({ b: 1, a: { d: "ñ", c: null } })).toBe('{"a":{"c":null,"d":"ñ"},"b":1}');
  });
});

describe("feed v1: esquema", () => {
  it("el índice firmado de Python cumple el esquema v1", () => {
    const parsed = parseFeedIndex(PY_VECTOR.index);
    expect(parsed.keyId).toBe("vector-maverlang");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]!.copyableHint).toBe("informational");
    expect(parsed.entries[0]!.coverage).toBe("top50_of_full_book");
  });

  it("los fixtures cumplen exactamente el contrato v1 y son de ejemplo", () => {
    const index = parseFeedIndex(FIXTURE_INDEX);
    expect(index.example).toBe(true);
    expect(index.aliases["berkshire-hathaway"]).toBe("berkshire-hathaway-13f");
    for (const entry of index.entries) {
      const detail = parseFeedDetail(FIXTURE_DETAILS[entry.slug], entry.slug);
      expect(detail.example).toBe(true);
      expect(detail.versionId).toBe(entry.versionId);
    }
    const status = parseFeedStatus(FIXTURE_STATUS);
    expect(status.status).toBe("ok");
  });

  it("en producción rechaza datos de ejemplo", () => {
    expect(() => parseFeedIndex(FIXTURE_INDEX, { rejectExample: true })).toThrow(FeedPayloadError);
  });

  it("lagged_disclosure = copiable; informational y congelada = solo mirar", () => {
    const { entries } = parseFeedIndex(FIXTURE_INDEX);
    const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
    expect(bySlug.get("berkshire-hathaway-13f")?.copyableHint).toBe("copy");
    expect(bySlug.get("arkk")?.copyableHint).toBe("copy");
    expect(bySlug.get("scion-13f")?.copyableHint).toBe("informational");
    expect(bySlug.get("norges-bank-13f")?.copyableHint).toBe("informational");
  });

  it("un detalle con performance se rechaza (gráfico con precios de Maverlang)", () => {
    const raw = { ...(clone(FIXTURE_DETAILS["arkk"]) as Record<string, unknown>), performance: [] };
    expect(() => parseFeedDetail(raw, "arkk")).toThrow(FeedPayloadError);
  });

  it("Norges (top50) no exige sumar 100; un 13F completo sí", () => {
    expect(() => parseFeedDetail(FIXTURE_DETAILS["norges-bank-13f"], "norges-bank-13f")).not.toThrow();
    const broken = clone(FIXTURE_DETAILS["berkshire-hathaway-13f"]) as {
      positions: { weight: number }[];
    };
    broken.positions[0]!.weight = 1;
    expect(() => parseFeedDetail(broken, "berkshire-hathaway-13f")).toThrow(FeedPayloadError);
  });

  it("position_count tiene que calzar con las posiciones", () => {
    const broken = clone(FIXTURE_DETAILS["arkk"]) as { position_count: number };
    broken.position_count += 1;
    expect(() => parseFeedDetail(broken, "arkk")).toThrow(FeedPayloadError);
  });

  it("status partial y empty se tratan como parcial (aviso ámbar)", () => {
    const base = clone(FIXTURE_STATUS) as Record<string, unknown>;
    expect(parseFeedStatus({ ...base, status: "partial" }).status).toBe("parcial");
    expect(parseFeedStatus({ ...base, status: "empty" }).status).toBe("parcial");
    expect(() => parseFeedStatus({ ...base, status: "parcial" })).toThrow(FeedPayloadError);
  });

  it("un índice sin schema v1 se rechaza", () => {
    const raw = clone(FIXTURE_INDEX) as Record<string, unknown>;
    delete raw.schema;
    expect(() => parseFeedIndex(raw)).toThrow(FeedPayloadError);
  });
});
