import { describe, expect, it } from "vitest";

import {
  buildSafetyUpsert,
  parseAuditArgs,
  resolveAuditSession,
  SAFETY_UPSERT_COLUMNS,
} from "../../scripts/audit-catalog.mjs";
import {
  isTradableStatus,
  isVisibleStatus,
  nextSafetyState,
} from "../../lib/catalog/safety-core.mjs";

type Prev = {
  safety_status?: string;
  consecutive_passes?: number;
  consecutive_fails?: number;
  manual_override?: string | null;
  safety_session?: string | null;
};

function prev(over: Prev = {}): Prev {
  return {
    safety_status: "unknown",
    consecutive_passes: 0,
    consecutive_fails: 0,
    manual_override: null,
    safety_session: null,
    ...over,
  };
}

const PASS = { result: "pass" as const, reasons: [] as string[] };
function quoteFail(): { result: "fail"; reasons: string[] } {
  return { result: "fail", reasons: ["sin_ruta_compra_100"] };
}

describe("M53: nextSafetyState", () => {
  it("primera pasada en market deja watch (no listado)", () => {
    expect(nextSafetyState(prev(), PASS, "market")).toEqual({
      status: "watch",
      consecutive_passes: 1,
      consecutive_fails: 0,
    });
  });

  it("promoción tras 2 pasadas con una en market", () => {
    const next = nextSafetyState(
      prev({ consecutive_passes: 1, safety_session: "overnight" }),
      PASS,
      "market",
    );
    expect(next.status).toBe("listed");
    expect(next.consecutive_passes).toBe(2);
    expect(next.consecutive_fails).toBe(0);
  });

  it("NO promociona con 2 pasadas solo overnight", () => {
    const next = nextSafetyState(
      prev({ consecutive_passes: 1, safety_session: "overnight" }),
      PASS,
      "overnight",
    );
    expect(next).toEqual({ status: "watch", consecutive_passes: 2, consecutive_fails: 0 });
  });

  it("listed sigue listed al pasar (aunque sea overnight)", () => {
    const next = nextSafetyState(
      prev({ safety_status: "listed", consecutive_passes: 5, safety_session: "market" }),
      PASS,
      "overnight",
    );
    expect(next.status).toBe("listed");
    expect(next.consecutive_passes).toBe(6);
  });

  it("falla overnight con listed baja a watch", () => {
    const next = nextSafetyState(
      prev({ safety_status: "listed", consecutive_fails: 0 }),
      quoteFail(),
      "overnight",
    );
    expect(next).toEqual({ status: "watch", consecutive_passes: 0, consecutive_fails: 1 });
  });

  it("overnight nunca oculta aunque la racha sea larga", () => {
    const next = nextSafetyState(
      prev({ safety_status: "watch", consecutive_fails: 4 }),
      quoteFail(),
      "closed",
    );
    expect(next.status).toBe("watch");
    expect(next.consecutive_fails).toBe(5);
  });

  it("1 falla en market deja watch", () => {
    const next = nextSafetyState(prev({ safety_status: "listed" }), quoteFail(), "market");
    expect(next).toEqual({ status: "watch", consecutive_passes: 0, consecutive_fails: 1 });
  });

  it("2 fallas en market ocultan", () => {
    const next = nextSafetyState(
      prev({ safety_status: "watch", consecutive_fails: 1 }),
      { result: "fail", reasons: ["costo_compra_100_120bps"] },
      "market",
    );
    expect(next).toEqual({ status: "hidden", consecutive_passes: 0, consecutive_fails: 2 });
  });

  it("2 fallas en extended también ocultan", () => {
    const next = nextSafetyState(
      prev({ safety_status: "watch", consecutive_fails: 1 }),
      quoteFail(),
      "extended",
    );
    expect(next.status).toBe("hidden");
  });

  it("motivo estático oculta de inmediato", () => {
    const next = nextSafetyState(
      prev({ safety_status: "listed" }),
      { result: "fail", reasons: ["mint_distinto_al_snapshot_oficial"] },
      "market",
    );
    expect(next.status).toBe("hidden");
    expect(next.consecutive_passes).toBe(0);
  });

  it("suspendido en extended también es hidden inmediato", () => {
    const next = nextSafetyState(prev(), { result: "fail", reasons: ["suspendido"] }, "extended");
    expect(next.status).toBe("hidden");
  });

  it("force_list con motivo estático sigue hidden", () => {
    const next = nextSafetyState(
      prev({ safety_status: "watch", manual_override: "force_list" }),
      { result: "fail", reasons: ["autoridades_no_canonicas"] },
      "market",
    );
    expect(next.status).toBe("hidden");
  });

  it("force_list sin estático lista aunque falle la cotización", () => {
    const next = nextSafetyState(
      prev({ safety_status: "watch", manual_override: "force_list" }),
      quoteFail(),
      "market",
    );
    expect(next.status).toBe("listed");
    expect(next.consecutive_fails).toBe(0);
  });

  it("force_hide oculta aunque pase", () => {
    const next = nextSafetyState(
      prev({ safety_status: "listed", manual_override: "force_hide", consecutive_passes: 5 }),
      PASS,
      "market",
    );
    expect(next.status).toBe("hidden");
  });

  it("recuperación watch → listed con 2 pasadas", () => {
    const next = nextSafetyState(
      prev({ safety_status: "watch", consecutive_passes: 1, safety_session: "market" }),
      PASS,
      "overnight",
    );
    expect(next.status).toBe("listed");
    expect(next.consecutive_passes).toBe(2);
  });

  it("hidden previo no se desoculta con una falla en market", () => {
    const next = nextSafetyState(
      prev({ safety_status: "hidden", consecutive_fails: 2 }),
      quoteFail(),
      "market",
    );
    expect(next.status).toBe("hidden");
    expect(next.consecutive_fails).toBe(3);
  });

  it("sesión desconocida es conservadora: no lista ni oculta", () => {
    const next = nextSafetyState(prev(), quoteFail(), "madrugada");
    expect(next.status).toBe("unknown");
  });

  it("ningún camino lista un activo con motivo estático", () => {
    const statics = [
      "mint_formato_invalido",
      "mint_distinto_al_snapshot_oficial",
      "autoridades_no_canonicas",
      "suspendido",
      "bolsa_no_informada",
      "bolsa_no_permitida_XLON",
      "producto_apalancado_inverso_o_volatilidad",
      "motivo_futuro_desconocido",
    ];
    const sessions = ["market", "extended", "overnight", "closed", "unknown"];
    const overrides: Array<string | null> = [null, "force_list"];
    for (const reason of statics) {
      for (const session of sessions) {
        for (const manual_override of overrides) {
          const next = nextSafetyState(
            prev({ safety_status: "listed", manual_override }),
            { result: "fail", reasons: [reason] },
            session,
          );
          expect(next.status, `${reason}/${session}/${manual_override}`).toBe("hidden");
        }
      }
    }
  });
});

describe("M53: visibilidad y operación", () => {
  it("visible es listed o watch; operable es sólo listed", () => {
    expect(isVisibleStatus("listed")).toBe(true);
    expect(isVisibleStatus("watch")).toBe(true);
    expect(isVisibleStatus("hidden")).toBe(false);
    expect(isVisibleStatus("unknown")).toBe(false);
    expect(isTradableStatus("listed")).toBe(true);
    expect(isTradableStatus("watch")).toBe(false);
    expect(isTradableStatus("hidden")).toBe(false);
    expect(isTradableStatus("unknown")).toBe(false);
  });
});

describe("M53: el upsert --db sólo toca columnas de seguridad", () => {
  it("SAFETY_UPSERT_COLUMNS no trae mint_solana, name ni curated", () => {
    const cols = [...SAFETY_UPSERT_COLUMNS] as string[];
    expect(cols).toContain("safety_status");
    expect(cols).toContain("consecutive_passes");
    for (const forbidden of ["mint_solana", "symbol", "name", "curated", "enabled"]) {
      expect(cols, forbidden).not.toContain(forbidden);
    }
  });

  it("buildSafetyUpsert arma symbol + sólo columnas de seguridad", () => {
    const payload = buildSafetyUpsert(
      prev({ safety_status: "watch", consecutive_passes: 1, safety_session: "overnight" }),
      { status: "listed", consecutive_passes: 2, consecutive_fails: 0 },
      { result: "pass", reasons: [], tier: "A" },
      { checkedAt: "2026-10-07T12:00:00.000Z", session: "market", metrics: { usd_price: 10 } },
    ) as Record<string, unknown>;
    const cols = [...SAFETY_UPSERT_COLUMNS] as string[];
    for (const key of Object.keys(payload)) {
      expect(cols, key).toContain(key);
    }
    expect(payload.safety_status).toBe("listed");
    expect(payload.listed_at).toBe("2026-10-07T12:00:00.000Z");
    expect(payload).not.toHaveProperty("mint_solana");
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("curated");
  });

  it("conserva listed_at previo y marca hidden_at al ocultar", () => {
    const listed = buildSafetyUpsert(
      prev({ safety_status: "listed" }),
      { status: "listed", consecutive_passes: 6, consecutive_fails: 0 },
      { result: "pass", reasons: [], tier: "A" },
      { checkedAt: "2026-10-07T12:00:00.000Z", session: "market", metrics: {} },
    ) as Record<string, unknown>;
    expect(listed).not.toHaveProperty("listed_at");

    const withPrev = buildSafetyUpsert(
      { safety_status: "listed", listed_at: "2026-10-01T00:00:00.000Z" },
      { status: "listed", consecutive_passes: 6, consecutive_fails: 0 },
      { result: "pass", reasons: [], tier: "A" },
      { checkedAt: "2026-10-07T12:00:00.000Z", session: "market", metrics: {} },
    ) as Record<string, unknown>;
    expect(withPrev.listed_at).toBe("2026-10-01T00:00:00.000Z");

    const hidden = buildSafetyUpsert(
      prev({ safety_status: "watch" }),
      { status: "hidden", consecutive_passes: 0, consecutive_fails: 2 },
      { result: "fail", reasons: ["costo_compra_100_120bps"], tier: null },
      { checkedAt: "2026-10-07T12:00:00.000Z", session: "market", metrics: {} },
    ) as Record<string, unknown>;
    expect(hidden.hidden_at).toBe("2026-10-07T12:00:00.000Z");
  });
});

describe("M53: flags del script", () => {
  it("parsea --db, --session y --all-events", () => {
    expect(parseAuditArgs(["--db"])).toMatchObject({ db: true, allEvents: false });
    expect(parseAuditArgs(["--symbols", "AAPLx", "--db", "--session", "market"])).toMatchObject({
      db: true,
      session: "market",
      symbols: ["AAPLx"],
    });
    expect(parseAuditArgs(["--db", "--all-events"])).toMatchObject({ db: true, allEvents: true });
    expect(parseAuditArgs(["--symbols", "AAPLx"])).toMatchObject({ db: false });
  });

  it("la sesión: flag manda, si no el período mayoritario, si no unknown", () => {
    expect(resolveAuditSession("market", new Map([["overnight", 10]]))).toBe("market");
    expect(resolveAuditSession(null, new Map([["regular", 8], ["overnight", 2]]))).toBe("market");
    expect(resolveAuditSession(null, new Map([["overnight", 8]]))).toBe("overnight");
    expect(resolveAuditSession(null, new Map())).toBe("unknown");
  });
});
