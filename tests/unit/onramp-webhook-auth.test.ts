import { beforeEach, describe, expect, it } from "vitest";

import {
  ONRAMP_WEBHOOK_WINDOW_MS,
  claimOnrampSignature,
  resetOnrampSignatureCache,
  signOnrampPayload,
  verifyOnrampWebhook,
} from "@/lib/onramp/webhook-auth";

const SECRET = "s".repeat(40);
const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);
const BODY = JSON.stringify({ sessionId: "onramp-1" });
const ts = (ms: number) => String(Math.floor(ms / 1000));

function verify(over: Partial<Parameters<typeof verifyOnrampWebhook>[0]> = {}) {
  const timestamp = ts(NOW);
  return verifyOnrampWebhook({
    secret: SECRET,
    signatureHeader: signOnrampPayload(SECRET, timestamp, BODY),
    timestampHeader: timestamp,
    rawBody: BODY,
    nowMs: NOW,
    ...over,
  });
}

describe("MON-9: autenticación del webhook on-ramp", () => {
  beforeEach(() => resetOnrampSignatureCache());

  it("acepta una firma válida (con y sin prefijo sha256=)", () => {
    expect(verify().ok).toBe(true);
    const sig = signOnrampPayload(SECRET, ts(NOW), BODY);
    expect(verify({ signatureHeader: `sha256=${sig}` }).ok).toBe(true);
  });

  it("rechaza una firma incorrecta o un cuerpo alterado", () => {
    expect(verify({ signatureHeader: "0".repeat(64) })).toMatchObject({ ok: false, reason: "SIGNATURE_INVALID" });
    expect(verify({ rawBody: `${BODY} ` })).toMatchObject({ ok: false, reason: "SIGNATURE_INVALID" });
    expect(verify({ signatureHeader: "zz" })).toMatchObject({ ok: false, reason: "SIGNATURE_INVALID" });
  });

  it("rechaza un timestamp fuera de la ventana de 5 minutos", () => {
    const old = ts(NOW - ONRAMP_WEBHOOK_WINDOW_MS - 2000);
    expect(
      verify({ timestampHeader: old, signatureHeader: signOnrampPayload(SECRET, old, BODY) }),
    ).toMatchObject({ ok: false, reason: "TIMESTAMP_STALE" });
    expect(verify({ timestampHeader: "abc" })).toMatchObject({ ok: false, reason: "TIMESTAMP_INVALID" });
  });

  it("falla cerrado sin secreto o sin cabeceras", () => {
    expect(verify({ secret: undefined })).toMatchObject({ ok: false, reason: "SECRET_MISSING" });
    expect(verify({ secret: "  " })).toMatchObject({ ok: false, reason: "SECRET_MISSING" });
    expect(verify({ signatureHeader: null })).toMatchObject({ ok: false, reason: "HEADERS_MISSING" });
    expect(verify({ timestampHeader: null })).toMatchObject({ ok: false, reason: "HEADERS_MISSING" });
  });

  it("repetición: la misma firma sólo se reclama una vez", () => {
    const v = verify();
    if (!v.ok) throw new Error("debía ser válida");
    expect(claimOnrampSignature(v.signature, NOW)).toBe(true);
    expect(claimOnrampSignature(v.signature, NOW + 1000)).toBe(false);
  });
});
