import { describe, expect, it } from "vitest";

import {
  createSponsorUsageStore,
  mapFailureCode,
  type SponsorUsagePortInput,
  type SponsorUsagePortResult,
  type SponsorUsageStorePort,
} from "@/lib/solana/sponsorship/usage-store";
import type {
  SponsorAbuseLimits,
  SponsorReservation,
} from "@/lib/solana/sponsorship/contracts";

/**
 * T37: el almacén durable sólo repite el `true` de la base. Todo lo demás es
 * rechazo. Estas pruebas son en memoria: no tocan Supabase, ni RPC, ni red.
 */

const LIMITS: SponsorAbuseLimits = {
  maxPerUserPerHour: 2,
  maxPerUserPerDay: 3,
  maxPerSponsorPerDay: 100,
  maxLamportsPerUserPerDay: 20_000_000,
  maxLamportsPerSponsorPerDay: 100_000_000,
  cooldownMs: 0,
};

function reservation(overrides: Partial<SponsorReservation> = {}): SponsorReservation {
  return {
    requestId: "req-1",
    sponsorId: "acme",
    userId: "user-1",
    feeLamports: 10_000,
    now: 1_760_000_000_000,
    messageSha256: "a".repeat(64),
    limits: LIMITS,
    ...overrides,
  };
}

/** Cuotas reales en memoria, para probar el agotamiento del cupo. */
class MemoryQuotaStore implements SponsorUsageStorePort {
  calls = 0;
  releases = 0;
  private readonly buckets = new Map<string, { count: number; lamports: number }>();
  private readonly reserved = new Map<string, { key: string; fee: number }>();

  constructor(private readonly limits: SponsorAbuseLimits) {}

  async reserve(input: SponsorUsagePortInput): Promise<SponsorUsagePortResult> {
    const key = `${input.userId}:${input.sponsorId}`;
    const current = this.buckets.get(key) ?? { count: 0, lamports: 0 };
    if (current.count >= this.limits.maxPerUserPerHour) {
      return { allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" };
    }
    if (current.count + 1 > this.limits.maxPerUserPerDay) {
      return { allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" };
    }
    if (current.lamports + input.feeLamports > this.limits.maxLamportsPerUserPerDay) {
      return { allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" };
    }
    const next = { count: current.count + 1, lamports: current.lamports + input.feeLamports };
    this.buckets.set(key, next);
    this.reserved.set(input.requestId, { key, fee: input.feeLamports });
    this.calls += 1;
    return { allowed: true, remaining: this.limits.maxPerUserPerDay - next.count };
  }

  async release(input: { requestId: string; sponsorId: string }): Promise<void> {
    const held = this.reserved.get(input.requestId);
    if (!held) return;
    this.reserved.delete(input.requestId);
    const current = this.buckets.get(held.key);
    if (!current) return;
    this.releases += 1;
    this.buckets.set(held.key, {
      count: Math.max(0, current.count - 1),
      lamports: Math.max(0, current.lamports - held.fee),
    });
  }
}

function portReturning(result: SponsorUsagePortResult): SponsorUsageStorePort & { seen: SponsorUsagePortInput[] } {
  const seen: SponsorUsagePortInput[] = [];
  return {
    seen,
    async reserve(input) {
      seen.push(input);
      return result;
    },
  };
}

describe("T37: almacén de cuotas fail-closed", () => {
  it("sólo repite el allowed:true de la base y conserva el cupo restante", async () => {
    const port = portReturning({ allowed: true, code: null, remaining: 2 });
    const store = createSponsorUsageStore({ port });
    const decision = await store.reserve(reservation());

    expect(decision).toEqual({ allowed: true, remaining: 2 });
    expect(port.seen).toHaveLength(1);
    expect(port.seen[0]).toMatchObject({
      requestId: "req-1",
      userId: "user-1",
      sponsorId: "acme",
      feeLamports: 10_000,
    });
  });

  it("una respuesta que no es un booleano literal true se rechaza (nunca cupo infinito)", async () => {
    for (const allowed of ["true", 1, undefined, null] as unknown[]) {
      const store = createSponsorUsageStore({
        port: portReturning({ allowed: allowed as boolean }),
      });
      const decision = await store.reserve(reservation());
      expect(decision.allowed, `allowed=${String(allowed)}`).toBe(false);
      expect(decision.code).toBe("SPONSOR_LIMITER_UNAVAILABLE");
    }
  });

  it("conserva los códigos conocidos de la base y neutraliza los desconocidos", async () => {
    const exceeded = createSponsorUsageStore({
      port: portReturning({ allowed: false, code: "SPONSOR_LIMIT_EXCEEDED" }),
    });
    expect(await exceeded.reserve(reservation())).toEqual({
      allowed: false,
      code: "SPONSOR_LIMIT_EXCEEDED",
    });

    const cooldown = createSponsorUsageStore({
      port: portReturning({ allowed: false, code: "SPONSOR_COOLDOWN" }),
    });
    expect((await cooldown.reserve(reservation())).code).toBe("SPONSOR_COOLDOWN");

    const unknown = createSponsorUsageStore({
      port: portReturning({ allowed: false, code: "MV_ALGO_NUEVO" }),
    });
    expect((await unknown.reserve(reservation())).code).toBe("SPONSOR_LIMITER_UNAVAILABLE");

    expect(mapFailureCode(null)).toBe("SPONSOR_LIMITER_UNAVAILABLE");
    expect(mapFailureCode("  ")).toBe("SPONSOR_LIMITER_UNAVAILABLE");
    expect(mapFailureCode("SPONSOR_POLICY_INVALID")).toBe("SPONSOR_POLICY_INVALID");
  });

  it("si la base falla o no está, el resultado es rechazo", async () => {
    const throwing = createSponsorUsageStore({
      port: {
        async reserve() {
          throw new Error("relation public.sponsor_usage does not exist");
        },
      },
    });
    expect(await throwing.reserve(reservation())).toEqual({
      allowed: false,
      code: "SPONSOR_LIMITER_UNAVAILABLE",
    });

    const empty = createSponsorUsageStore({ port: null });
    expect(await empty.reserve(reservation())).toEqual({
      allowed: false,
      code: "SPONSOR_LIMITER_UNAVAILABLE",
    });
  });

  it("una reserva malformada se rechaza antes de llamar a la base", async () => {
    const port = portReturning({ allowed: true, remaining: 1 });
    const store = createSponsorUsageStore({ port });

    const badSha = await store.reserve(reservation({ messageSha256: "no-es-un-hash" }));
    expect(badSha).toEqual({ allowed: false, code: "SPONSOR_REQUEST_INVALID" });

    const zeroFee = await store.reserve(reservation({ feeLamports: 0 }));
    expect(zeroFee).toEqual({ allowed: false, code: "SPONSOR_POLICY_INVALID" });

    const hugeFee = await store.reserve(reservation({ feeLamports: 10_000_001 }));
    expect(hugeFee).toEqual({ allowed: false, code: "SPONSOR_POLICY_INVALID" });

    const noUser = await store.reserve(reservation({ userId: "   " }));
    expect(noUser).toEqual({ allowed: false, code: "SPONSOR_USER_NOT_ELIGIBLE" });

    // Por sobre los techos duros de contracts.ts: jamás se delega a la base.
    const overHardCaps = await store.reserve(
      reservation({ limits: { ...LIMITS, maxPerUserPerDay: 31 } }),
    );
    expect(overHardCaps).toEqual({ allowed: false, code: "SPONSOR_POLICY_INVALID" });

    expect(port.seen).toHaveLength(0);
  });

  it("el cupo agotado en memoria se rechaza y el release lo devuelve", async () => {
    const quota = new MemoryQuotaStore({ ...LIMITS, maxPerUserPerHour: 1 });
    const store = createSponsorUsageStore({ port: quota });

    expect((await store.reserve(reservation({ requestId: "req-A" }))).allowed).toBe(true);
    expect(await store.reserve(reservation({ requestId: "req-B" }))).toEqual({
      allowed: false,
      code: "SPONSOR_LIMIT_EXCEEDED",
    });
    expect(quota.calls).toBe(1);

    await store.release?.(reservation({ requestId: "req-A" }));
    expect(quota.releases).toBe(1);
    expect((await store.reserve(reservation({ requestId: "req-C" }))).allowed).toBe(true);
    expect(quota.calls).toBe(2);
  });

  it("release reenvía el requestId y el sponsor exactos; sin release no falla", async () => {
    const seen: Array<{ requestId: string; sponsorId: string }> = [];
    const withRelease = createSponsorUsageStore({
      port: {
        async reserve() {
          return { allowed: true };
        },
        async release(input) {
          seen.push(input);
        },
      },
    });
    await withRelease.release?.(reservation({ requestId: " req-9 ", sponsorId: "acme" }));
    expect(seen).toEqual([{ requestId: "req-9", sponsorId: "acme" }]);

    const withoutRelease = createSponsorUsageStore({
      port: {
        async reserve() {
          return { allowed: true };
        },
      },
    });
    await expect(withoutRelease.release?.(reservation())).resolves.toBeUndefined();
  });
});
