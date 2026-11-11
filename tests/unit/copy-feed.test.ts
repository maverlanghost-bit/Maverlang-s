import { generateKeyPairSync, sign as edSign } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

// `feed.ts` envuelve sus lecturas en `unstable_cache`; en unitarios se usa la
// función tal cual para no depender del contexto de request de Next.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

import {
  canonicalIndexPayload,
  canonicalJson,
  digestMatches,
  sha256Hex,
  verifyEd25519,
  verifyFeedIndexSignature,
} from "@/lib/copy/signature";
import { FeedPayloadError, parseFeedDetail, parseFeedIndex } from "@/lib/copy/schema";
import { computeFeedHealth, isCopyFrozenByFeed } from "@/lib/copy/feed";
import type { CopyPortfolio, FeedHealth } from "@/lib/copy/types";

/**
 * Feed privado de Fraccion.si (§4): firma Ed25519, sha256, validación zod y
 * descarte de filas que no van en V1. Sin red y con claves de prueba
 * generadas acá; ningún secreto real.
 */

const VERSION_ID = `v1:${"a".repeat(64)}`;
const DETAIL_SHA = "b".repeat(64);
const SLUG = "berkshire-hathaway-13f";

function rawDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: "fraccion.si",
    legend: "tecnología de Fraccion.si",
    generated_at: "2026-11-10T11:00:00.000Z",
    version_id: VERSION_ID,
    example: true,
    portfolio: {
      slug: SLUG,
      aliases: ["berkshire-hathaway"],
      name: "Berkshire Hathaway",
      family: "13f",
      source: "sec_13f",
      manager: "Warren Buffett",
      country: "US",
      as_of: "2026-09-30",
      filed_at: "2026-11-01",
      published_at: "2026-11-01",
      lag_days: 32,
      lag_note: "Dato de ejemplo.",
      is_estimated: false,
      is_complete: true,
      is_frozen: false,
      coverage: "full_13f",
      verification: "official_filing",
      license: "SEC — atribución",
      attribution: "Fraccion.si (ejemplo)",
      source_url: "https://www.sec.gov/",
    },
    positions: [
      {
        symbol: "AAPL",
        name: "Apple",
        weight: 50,
        previous_weight: 48,
        side: "long",
        currency: "USD",
        as_of: "2026-09-30",
      },
      {
        symbol: "KO",
        name: "Coca-Cola",
        weight: 30,
        previous_weight: null,
        side: "long",
        currency: "USD",
        as_of: "2026-09-30",
      },
      {
        symbol: "AXP",
        name: "American Express",
        weight: 20,
        previous_weight: 22,
        side: "long",
        currency: "USD",
        as_of: "2026-09-30",
      },
    ],
    movements: [],
    performance: [],
    disclaimer: "Dato de ejemplo, no es recomendación.",
    ...overrides,
  };
}

function withPortfolio(patch: Record<string, unknown>): Record<string, unknown> {
  const raw = rawDetail();
  return { ...raw, portfolio: { ...(raw.portfolio as Record<string, unknown>), ...patch } };
}

function rawIndex(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: "fraccion.si",
    legend: "tecnología de Fraccion.si",
    generated_at: "2026-11-10T11:00:00.000Z",
    status: "ok",
    schema_version: 1,
    signature: { alg: "Ed25519", key_id: "test-key", sig: "firma-de-prueba" },
    portfolios: [
      {
        slug: SLUG,
        aliases: ["berkshire-hathaway"],
        name: "Berkshire Hathaway",
        family: "13f",
        source: "sec_13f",
        manager: "Warren Buffett",
        country: "US",
        as_of: "2026-09-30",
        filed_at: "2026-11-01",
        generated_at: "2026-11-10T11:00:00.000Z",
        version_id: VERSION_ID,
        coverage: "full_13f",
        is_frozen: false,
        is_estimated: false,
        is_complete: true,
        copyable_hint: "copy",
        detail_path: `portfolios/${SLUG}.json`,
        detail_sha256: DETAIL_SHA,
        positions_count: 3,
        top10: [{ symbol: "AAPL", name: "Apple", weight: 50 }],
      },
      {
        slug: "arkk",
        aliases: [],
        name: "ARK Innovation ETF",
        family: "etf",
        source: "issuer_etf",
        manager: "ARK Invest",
        country: "US",
        as_of: "2026-11-07",
        filed_at: null,
        version_id: VERSION_ID,
        coverage: "issuer_etf",
        is_frozen: false,
        is_estimated: false,
        is_complete: true,
        copyable_hint: "informational",
        detail_path: "portfolios/arkk.json",
        detail_sha256: DETAIL_SHA,
        positions_count: 40,
        top10: [],
      },
      {
        slug: "pelosi-tracker",
        aliases: [],
        name: "Pelosi tracker",
        family: "political_us",
        source: "sec_form4",
        manager: "—",
        country: "US",
        as_of: "2026-11-01",
        version_id: VERSION_ID,
        coverage: "editorial_model",
        copyable_hint: "copy",
        detail_path: "portfolios/pelosi-tracker.json",
        detail_sha256: DETAIL_SHA,
        positions_count: 4,
        top10: [],
      },
    ],
    ...overrides,
  };
}

describe("signature: JSON canónico y sha256", () => {
  it("ordena claves en todos los niveles y conserva el orden de los arreglos", () => {
    const value = { b: 1, a: { d: 2, c: [3, 4] }, z: [{ y: 1, x: 2 }] };
    expect(canonicalJson(value)).toBe('{"a":{"c":[3,4],"d":2},"b":1,"z":[{"x":2,"y":1}]}');
  });

  it("sha256Hex coincide con el vector conocido de 'abc'", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("lo que se firma es el índice sin signature", () => {
    const index = rawIndex();
    const unsigned = { ...index };
    delete unsigned.signature;
    expect(canonicalIndexPayload(index).toString("utf8")).toBe(canonicalJson(unsigned));
  });
});

describe("signature: Ed25519 del índice", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const raw32 = Buffer.from(publicKey.export({ type: "spki", format: "der" }))
    .subarray(-32)
    .toString("base64");

  function signedIndex(): Record<string, unknown> {
    const base = rawIndex();
    const sig = edSign(null, canonicalIndexPayload(base), privateKey).toString("base64");
    return { ...base, signature: { alg: "Ed25519", key_id: "test-key", sig } };
  }

  it("acepta la firma válida con clave PEM y con 32 bytes base64", () => {
    const index = signedIndex();
    expect(verifyFeedIndexSignature(index, pem, "test-key")).toEqual({ ok: true, keyId: "test-key" });
    expect(verifyFeedIndexSignature(index, raw32)).toEqual({ ok: true, keyId: "test-key" });
  });

  it("rechaza un índice alterado después de firmar", () => {
    const index = signedIndex();
    const tampered = { ...index, status: "parcial" };
    expect(verifyFeedIndexSignature(tampered, pem)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rechaza otra clave, otro key_id, otro alg o la ausencia de firma", () => {
    const index = signedIndex();
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyFeedIndexSignature(index, other)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyFeedIndexSignature(index, pem, "otra-clave")).toEqual({
      ok: false,
      reason: "key_id_mismatch",
    });
    expect(
      verifyFeedIndexSignature(
        { ...index, signature: { ...(index.signature as object), alg: "RSA" } },
        pem,
      ),
    ).toEqual({ ok: false, reason: "bad_alg" });
    const unsigned = { ...index };
    delete unsigned.signature;
    expect(verifyFeedIndexSignature(unsigned, pem)).toEqual({ ok: false, reason: "no_signature" });
  });

  it("verifyEd25519 rechaza firma alterada y clave que no carga", () => {
    const payload = canonicalIndexPayload(rawIndex());
    const sig = edSign(null, payload, privateKey).toString("base64");
    expect(verifyEd25519(payload, sig, pem)).toBe(true);
    const bad = Buffer.from(sig, "base64");
    bad[0] ^= 0xff;
    expect(verifyEd25519(payload, bad.toString("base64"), pem)).toBe(false);
    expect(verifyEd25519(payload, sig, "no-es-una-clave")).toBe(false);
  });

  it("digestMatches compara el sha256 del archivo con el del índice", () => {
    const bytes = Buffer.from('{"hola":"mundo"}', "utf8");
    expect(digestMatches(bytes, sha256Hex(bytes))).toBe(true);
    expect(digestMatches(bytes, "c".repeat(64))).toBe(false);
    expect(digestMatches(bytes, "no-hex")).toBe(false);
  });
});

describe("schema: detalle del portafolio", () => {
  it("normaliza a camelCase y marca los datos de ejemplo", () => {
    const portfolio: CopyPortfolio = parseFeedDetail(rawDetail(), SLUG);
    expect(portfolio.versionId).toBe(VERSION_ID);
    expect(portfolio.generatedAt).toBe("2026-11-10T11:00:00.000Z");
    expect(portfolio.portfolio.slug).toBe(SLUG);
    expect(portfolio.portfolio.family).toBe("13f");
    expect(portfolio.portfolio.asOf).toBe("2026-09-30");
    expect(portfolio.positions).toHaveLength(3);
    expect(portfolio.positions[0]).toMatchObject({
      symbol: "AAPL",
      weight: 50,
      previousWeight: 48,
      side: "long",
      currency: "USD",
    });
    expect(portfolio.example).toBe(true);
  });

  it("en producción (remoto) rechaza example: true", () => {
    expect(() => parseFeedDetail(rawDetail(), SLUG, { rejectExample: true })).toThrowError(
      FeedPayloadError,
    );
    try {
      parseFeedDetail(rawDetail(), SLUG, { rejectExample: true });
    } catch (error) {
      expect((error as FeedPayloadError).reason).toBe("example_not_allowed");
    }
    expect(parseFeedDetail(rawDetail(), SLUG, { rejectExample: false }).example).toBe(true);
  });

  it("descarta las posiciones short y deja sólo las largas", () => {
    const raw = rawDetail();
    raw.positions = [
      ...(raw.positions as unknown[]),
      { symbol: "INV", name: "Corto de ejemplo", weight: 0, previous_weight: null, side: "short" },
    ];
    const portfolio = parseFeedDetail(raw, SLUG);
    expect(portfolio.positions.map((position) => position.symbol)).toEqual(["AAPL", "KO", "AXP"]);
  });

  it("descarta los movimientos con verification pending", () => {
    const raw = rawDetail();
    raw.movements = [
      {
        type: "weight_change",
        symbol: "AAPL",
        tx_date: null,
        published_at: "2026-11-01",
        lag_days: 32,
        weight_from: 48,
        weight_to: 50,
        source_url: null,
        verification: "pending",
      },
      {
        type: "weight_change",
        symbol: "KO",
        tx_date: null,
        published_at: "2026-11-01",
        lag_days: 32,
        weight_from: 28,
        weight_to: 30,
        source_url: null,
        verification: "human_reviewed",
      },
    ];
    const portfolio = parseFeedDetail(raw, SLUG);
    expect(portfolio.movements).toHaveLength(1);
    expect(portfolio.movements[0].symbol).toBe("KO");
  });

  it("un portafolio con verification pending no entra", () => {
    const raw = withPortfolio({ verification: "pending" });
    expect(() => parseFeedDetail(raw, SLUG)).toThrowError(FeedPayloadError);
    try {
      parseFeedDetail(raw, SLUG);
    } catch (error) {
      expect((error as FeedPayloadError).reason).toBe("verification_pending");
    }
  });

  it("descarta familias excluidas (políticos y señales)", () => {
    for (const family of ["political_us", "signal"]) {
      const raw = withPortfolio({ family });
      try {
        parseFeedDetail(raw, SLUG);
        throw new Error("debía rechazar la familia");
      } catch (error) {
        expect((error as FeedPayloadError).reason).toBe("family_not_allowed");
      }
    }
  });

  it("rechaza pesos que no suman 99,5–100,5", () => {
    const raw = rawDetail();
    raw.positions = [
      { symbol: "AAPL", name: "Apple", weight: 40, previous_weight: null, side: "long" },
      { symbol: "KO", name: "Coca-Cola", weight: 22, previous_weight: null, side: "long" },
    ];
    try {
      parseFeedDetail(raw, SLUG);
      throw new Error("debía rechazar los pesos");
    } catch (error) {
      expect((error as FeedPayloadError).reason).toBe("weights_out_of_range");
    }
  });

  it("top50_of_full_book acepta suma menor a 100 y exige ≤ 50 posiciones e is_complete false", () => {
    const positions = Array.from({ length: 50 }, (_, index) => ({
      symbol: `T${index}`,
      name: `Empresa ${index}`,
      weight: 1,
      previous_weight: null,
      side: "long",
    }));
    const top50 = rawDetail({
      portfolio: {
        ...(rawDetail().portfolio as Record<string, unknown>),
        coverage: "top50_of_full_book",
        is_complete: false,
        lag_note: "Top 50 del libro completo.",
      },
      positions,
    });

    const parsed = parseFeedDetail(top50, SLUG);
    expect(parsed.positions).toHaveLength(50);
    expect(parsed.portfolio.coverage).toBe("top50_of_full_book");
    expect(parsed.portfolio.isComplete).toBe(false);

    const complete = rawDetail({
      portfolio: {
        ...(rawDetail().portfolio as Record<string, unknown>),
        coverage: "top50_of_full_book",
        is_complete: true,
      },
      positions,
    });
    try {
      parseFeedDetail(complete, SLUG);
      throw new Error("debía rechazar is_complete = true");
    } catch (error) {
      expect((error as FeedPayloadError).reason).toBe("top50_shape");
    }

    const tooMany = rawDetail({
      portfolio: {
        ...(rawDetail().portfolio as Record<string, unknown>),
        coverage: "top50_of_full_book",
        is_complete: false,
      },
      positions: Array.from({ length: 51 }, (_, index) => ({
        symbol: `T${index}`,
        name: `Empresa ${index}`,
        weight: 1,
        previous_weight: null,
        side: "long",
      })),
    });
    try {
      parseFeedDetail(tooMany, SLUG);
      throw new Error("debía rechazar 51 posiciones");
    } catch (error) {
      expect((error as FeedPayloadError).reason).toBe("top50_shape");
    }
  });

  it("exige que el detalle sea del slug pedido", () => {
    try {
      parseFeedDetail(rawDetail(), "arkk");
      throw new Error("debía rechazar el slug");
    } catch (error) {
      expect((error as FeedPayloadError).reason).toBe("slug_mismatch");
    }
  });
});

describe("schema: índice del feed", () => {
  it("normaliza metadatos, top10 y el sha256 del detalle", () => {
    const parsed = parseFeedIndex(rawIndex());
    expect(parsed.status).toBe("ok");
    expect(parsed.example).toBe(false);
    expect(parsed.entries).toHaveLength(2);
    const berkshire = parsed.entries.find((entry) => entry.slug === SLUG);
    expect(berkshire).toMatchObject({
      slug: SLUG,
      family: "13f",
      versionId: VERSION_ID,
      detailPath: `portfolios/${SLUG}.json`,
      detailSha256: DETAIL_SHA,
      positionsCount: 3,
      copyableHint: "copy",
    });
    expect(berkshire?.top10).toEqual([{ symbol: "AAPL", name: "Apple", weight: 50 }]);
  });

  it("descarta familias excluidas y marca las congeladas como informativas", () => {
    const raw = rawIndex();
    const entries = raw.portfolios as Array<Record<string, unknown>>;
    entries[1] = { ...entries[1], is_frozen: true };
    const parsed = parseFeedIndex(raw);
    expect(parsed.entries.map((entry) => entry.slug)).not.toContain("pelosi-tracker");
    expect(parsed.entries.find((entry) => entry.slug === "arkk")?.copyableHint).toBe(
      "informational",
    );
  });

  it("rechaza el índice de ejemplo cuando viene del feed remoto", () => {
    const raw = { ...rawIndex(), example: true };
    try {
      parseFeedIndex(raw, { rejectExample: true });
      throw new Error("debía rechazar el índice de ejemplo");
    } catch (error) {
      expect((error as FeedPayloadError).reason).toBe("example_not_allowed");
    }
  });
});

describe("feed: frescura 36 h / 7 días", () => {
  const NOW_MS = Date.parse("2026-11-10T12:00:00.000Z");
  const hoursAgo = (hours: number) => new Date(NOW_MS - hours * 3_600_000).toISOString();

  function healthAt(hours: number, status: "ok" | "parcial" | null = "ok"): FeedHealth {
    return computeFeedHealth({
      generatedAt: hoursAgo(hours),
      status,
      source: "remote",
      now: NOW_MS,
    });
  }

  it("menos de 36 h es normal", () => {
    expect(healthAt(2).state).toBe("fresh");
    expect(healthAt(35).state).toBe("fresh");
  });

  it("entre 36 h y 7 días avisa pero deja copiar", () => {
    expect(healthAt(37).state).toBe("stale");
    expect(healthAt(6 * 24).state).toBe("stale");
    expect(isCopyFrozenByFeed(healthAt(37))).toBe(false);
    expect(isCopyFrozenByFeed(healthAt(6 * 24))).toBe(false);
  });

  it("más de 7 días apaga copiar aunque la información siga visible", () => {
    const health = healthAt(8 * 24);
    expect(health.state).toBe("expired");
    expect(isCopyFrozenByFeed(health)).toBe(true);
  });

  it("status parcial avisa aunque el dato sea reciente", () => {
    expect(healthAt(2, "parcial").state).toBe("stale");
  });

  it("sin feed es none; una fecha imposible es invalid", () => {
    const none = computeFeedHealth({
      generatedAt: null,
      status: null,
      source: "none",
      now: NOW_MS,
    });
    expect(none).toEqual({ state: "none", generatedAt: null, status: null, source: "none" });
    expect(isCopyFrozenByFeed(none)).toBe(false);

    const invalid = computeFeedHealth({
      generatedAt: "no-es-fecha",
      status: null,
      source: "remote",
      now: NOW_MS,
    });
    expect(invalid.state).toBe("invalid");
    expect(isCopyFrozenByFeed(invalid)).toBe(true);
  });
});
