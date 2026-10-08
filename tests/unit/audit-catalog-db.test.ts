import { describe, expect, it, vi } from "vitest";

import { syncSafetyToDb } from "../../scripts/audit-catalog.mjs";

type Call = { table: string; op: string; args: unknown[] };

/**
 * Cliente falso encadenable estilo supabase-js (sin red). Cada llamada a
 * from() devuelve un builder thenable: `await` resuelve según `resolve`.
 */
function makeFakeAdmin(resolve: (table: string, calls: Call[]) => { data?: unknown; error?: { message: string } | null }) {
  const log: Call[] = [];
  const tableOf = (builder: FakeBuilder) => builder.table;
  class FakeBuilder {
    table: string;
    calls: Call[] = [];
    constructor(table: string) {
      this.table = table;
    }
    private push(op: string, args: unknown[]): this {
      const call = { table: tableOf(this), op, args };
      this.calls.push(call);
      log.push(call);
      return this;
    }
    select(...args: unknown[]) { return this.push("select", args); }
    insert(...args: unknown[]) { return this.push("insert", args); }
    update(...args: unknown[]) { return this.push("update", args); }
    upsert(...args: unknown[]) { return this.push("upsert", args); }
    eq(...args: unknown[]) { return this.push("eq", args); }
    in(...args: unknown[]) { return this.push("in", args); }
    limit(...args: unknown[]) { return this.push("limit", args); }
    single(...args: unknown[]) { return this.push("single", args); }
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      try {
        return Promise.resolve(resolve(this.table, this.calls)).then(onFulfilled, onRejected);
      } catch (err) {
        return Promise.reject(err).then(onFulfilled, onRejected);
      }
    }
  }
  const admin = { from: (table: string) => new FakeBuilder(table) };
  return { admin, log };
}

function prevRow(symbol: string) {
  return {
    symbol,
    safety_status: "unknown",
    consecutive_passes: 0,
    consecutive_fails: 0,
    manual_override: null,
    safety_session: null,
    listed_at: null,
    hidden_at: null,
  };
}

function outcome(symbol: string, result: "pass" | "fail" = "pass") {
  return {
    symbol,
    verdict: { result, reasons: result === "pass" ? [] : ["sin_ruta_compra_100"], tier: null },
    usdPrice: 100,
    refPrice: 100,
    deviationBps: 0,
    buy100CostBps: 10,
    buy100Route: "AMM",
    buy1000CostBps: 20,
    sell100CostBps: 10,
    liquidityUsd: 1_000_000,
    holders: 100,
  };
}

function withExitCode() {
  const prev = process.exitCode;
  process.exitCode = undefined;
  return () => {
    process.exitCode = prev;
  };
}

describe("M53b-fix: syncSafetyToDb", () => {
  it("lee assets con .in(symbol, lote) en lotes de 200", async () => {
    const restore = withExitCode();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const symbols = Array.from({ length: 450 }, (_, i) => `S${String(i).padStart(3, "0")}x`);
      const { admin, log } = makeFakeAdmin((table, calls) => {
        const last = calls[calls.length - 1]?.op;
        if (table === "asset_safety_runs" && last === "single") return { data: { id: 7 }, error: null };
        if (table === "assets" && calls.some((c) => c.op === "in")) {
          const inCall = calls.find((c) => c.op === "in");
          const batch = inCall?.args[1] as string[];
          return { data: batch.map(prevRow), error: null };
        }
        return { data: null, error: null };
      });
      await syncSafetyToDb({
        outcomes: symbols.map((s) => outcome(s)),
        session: "market",
        runStartedAt: new Date().toISOString(),
        source: "audit-catalog",
        admin,
      });
      const inCalls = log.filter((c) => c.table === "assets" && c.op === "in");
      expect(inCalls.length).toBe(3);
      expect(inCalls.map((c) => (c.args[1] as string[]).length)).toEqual([200, 200, 50]);
      for (const c of inCalls) expect(c.args[0]).toBe("symbol");
      expect(log.some((c) => c.op === "in_")).toBe(false);
      expect(process.exitCode).not.toBe(1);
    } finally {
      errSpy.mockRestore();
      restore();
    }
  });

  it("si la lectura falla, cierra la corrida con finished_at y notes", async () => {
    const restore = withExitCode();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { admin, log } = makeFakeAdmin((table, calls) => {
        const last = calls[calls.length - 1]?.op;
        if (table === "asset_safety_runs" && last === "single") return { data: { id: 1 }, error: null };
        if (table === "assets" && calls.some((c) => c.op === "select")) {
          return { data: null, error: { message: "boom lectura" } };
        }
        return { data: null, error: null };
      });
      await syncSafetyToDb({
        outcomes: [outcome("AAPLx")],
        session: "market",
        runStartedAt: new Date().toISOString(),
        source: "audit-catalog",
        admin,
      });
      expect(process.exitCode).toBe(1);
      const updates = log.filter((c) => c.table === "asset_safety_runs" && c.op === "update");
      expect(updates.length).toBe(1);
      const patch = updates[0].args[0] as Record<string, unknown>;
      expect(typeof patch.finished_at).toBe("string");
      expect(typeof patch.notes).toBe("string");
      expect(String(patch.notes).length).toBeGreaterThan(0);
      const eqCall = log.find((c) => c.table === "asset_safety_runs" && c.op === "eq");
      expect(eqCall?.args).toEqual(["id", 1]);
      // No escribe activos ni eventos tras el fallo de lectura.
      expect(log.some((c) => c.op === "upsert")).toBe(false);
      expect(log.some((c) => c.table === "asset_safety_events" && c.op === "insert")).toBe(false);
    } finally {
      errSpy.mockRestore();
      restore();
    }
  });

  it("caso feliz: actualiza assets, inserta eventos y cierra la corrida", async () => {
    const restore = withExitCode();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { admin, log } = makeFakeAdmin((table, calls) => {
        const last = calls[calls.length - 1]?.op;
        if (table === "asset_safety_runs" && last === "single") return { data: { id: 9 }, error: null };
        if (table === "assets" && calls.some((c) => c.op === "in")) {
          const inCall = calls.find((c) => c.op === "in");
          const batch = inCall?.args[1] as string[];
          return { data: batch.map(prevRow), error: null };
        }
        return { data: null, error: null };
      });
      await syncSafetyToDb({
        outcomes: [outcome("AAPLx", "pass"), outcome("NVDAx", "fail")],
        session: "market",
        runStartedAt: new Date().toISOString(),
        source: "audit-catalog",
        allEvents: true,
        admin,
      });
      expect(process.exitCode).not.toBe(1);
      const upserts = log.filter((c) => c.table === "assets" && c.op === "upsert");
      expect(upserts.length).toBe(1);
      const payload = (upserts[0].args[0] as Record<string, unknown>[]).find((p) => p.symbol === "AAPLx");
      expect(payload).toMatchObject({ symbol: "AAPLx" });
      expect(payload).toHaveProperty("safety_status");
      const eventsInsert = log.find((c) => c.table === "asset_safety_events" && c.op === "insert");
      const events = eventsInsert?.args[0] as Record<string, unknown>[];
      expect(events.length).toBe(2);
      expect(events[0]).toMatchObject({ run_id: 9, symbol: "AAPLx", result: "PASA" });
      expect(events[1]).toMatchObject({ run_id: 9, symbol: "NVDAx", result: "NO PASA" });
      const doneUpdate = log.find((c) => c.table === "asset_safety_runs" && c.op === "update");
      const patch = doneUpdate?.args[0] as Record<string, unknown>;
      expect(typeof patch.finished_at).toBe("string");
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
      restore();
    }
  });
});
