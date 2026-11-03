import { describe, expect, it } from "vitest";

import {
  REDACTED,
  redactDeep,
  redactHeaders,
  redactText,
  redactUrl,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from "@/lib/observability/redact";

describe("M-02: redacción de PII y secretos para Sentry", () => {
  it("redacta el query param ?api-key de una URL y es idempotente", () => {
    const url = "https://mainnet.helius-rpc.com/?api-key=TEST-123&commitment=confirmed";

    const clean = redactUrl(url);

    expect(clean).toBe(
      `https://mainnet.helius-rpc.com/?api-key=${REDACTED}&commitment=confirmed`,
    );
    expect(clean).not.toContain("TEST-123");
    expect(redactUrl(clean)).toBe(clean);
  });

  it("redacta también token, secret, access_token y key en URLs y query strings", () => {
    const url =
      "https://api.ejemplo.cl/v1/data?token=a&secret=b&access_token=c&key=d&apikey=e&page=2";

    const clean = redactUrl(url);

    expect(clean).toBe(
      `https://api.ejemplo.cl/v1/data?token=${REDACTED}&secret=${REDACTED}&access_token=${REDACTED}&key=${REDACTED}&apikey=${REDACTED}&page=2`,
    );
    expect(clean).toContain("page=2");
  });

  it("redacta headers sensibles sin distinguir mayúsculas y conserva los demás", () => {
    const headers = {
      Authorization: "Bearer secreto.jwt.de.prueba",
      Cookie: "sb-auth-token=abc123",
      "X-Api-Key": "helius-key",
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const clean = redactHeaders(headers);

    expect(clean).toEqual({
      Authorization: REDACTED,
      Cookie: REDACTED,
      "X-Api-Key": REDACTED,
      "Content-Type": "application/json",
      Accept: "application/json",
    });
  });

  it("redacta email, rut y teléfono en extra, body y user", () => {
    const event = {
      message: "fallo al crear el perfil",
      user: { id: "user_123", email: "ana@ejemplo.cl", username: "ana" },
      extra: {
        email: "ana@ejemplo.cl",
        rut: "12.345.678-9",
        telefono: "+56 9 1234 5678",
        phone: "912345678",
        password: "clave-secreta",
        token: "tok_123",
        secret: "shhh",
        intentos: 2,
      },
      request: {
        data: { email: "ana@ejemplo.cl", rut: "12345678-9", plan: "pro" },
      },
    };

    const clean = scrubSentryEvent(event);

    expect(clean.extra).toEqual({
      email: REDACTED,
      rut: REDACTED,
      telefono: REDACTED,
      phone: REDACTED,
      password: REDACTED,
      token: REDACTED,
      secret: REDACTED,
      intentos: 2,
    });
    expect(clean.request.data).toEqual({ email: REDACTED, rut: REDACTED, plan: "pro" });
    expect(clean.user).toEqual({ id: "user_123", email: REDACTED, username: REDACTED });
  });

  it("un objeto limpio pasa intacto", () => {
    const cleanEvent = {
      level: "error",
      message: "No se pudo completar la orden",
      tags: { route: "/api/trade/build", asset: "AAPL", status: "500" },
      extra: { attempt: 2, retryable: false, elapsedMs: 1250, reason: null },
      contexts: { runtime: { name: "node", version: "22.14.0" } },
      request: {
        method: "POST",
        url: "https://maverlang.cl/api/trade/build",
        headers: { "content-type": "application/json" },
      },
    };

    expect(scrubSentryEvent(cleanEvent)).toEqual(cleanEvent);
  });

  it("sanea un evento completo: URL, query_string, cookies y mensaje", () => {
    const event = {
      message: "RPC falló en https://mainnet.helius-rpc.com/?api-key=SECRETO",
      request: {
        method: "POST",
        url: "https://mainnet.helius-rpc.com/?api-key=SECRETO&commitment=processed",
        headers: {
          authorization: "Bearer abc.def.ghi",
          cookie: "sb-auth-token=xyz",
          "x-api-key": "SECRETO",
          "content-type": "application/json",
        },
        query_string: [
          ["api-key", "SECRETO"],
          ["limit", "10"],
        ],
        cookies: { "sb-abc-auth-token": "jwt-de-sesion", preferencias: "tema" },
      },
      breadcrumbs: [
        {
          category: "fetch",
          data: { method: "POST", url: "https://api.jup.ag/swap?api-key=SECRETO", status_code: 500 },
        },
        {
          category: "console",
          message: "usuario ana@ejemplo.cl con RUT 12.345.678-9",
        },
      ],
    };

    const clean = scrubSentryEvent(event);

    expect(clean.message).not.toContain("SECRETO");
    expect(clean.message).toContain(`api-key=${REDACTED}`);
    expect(clean.request.url).toContain(`api-key=${REDACTED}`);
    expect(clean.request.url).toContain("commitment=processed");
    expect(clean.request.headers.authorization).toBe(REDACTED);
    expect(clean.request.headers.cookie).toBe(REDACTED);
    expect(clean.request.headers["x-api-key"]).toBe(REDACTED);
    expect(clean.request.headers["content-type"]).toBe("application/json");
    expect(clean.request.query_string).toEqual([
      ["api-key", REDACTED],
      ["limit", "10"],
    ]);
    expect(clean.request.cookies).toEqual({
      "sb-abc-auth-token": REDACTED,
      preferencias: REDACTED,
    });
    expect(clean.breadcrumbs[0]).toMatchObject({
      data: { url: `https://api.jup.ag/swap?api-key=${REDACTED}` },
    });
    expect(clean.breadcrumbs[1]).toMatchObject({
      message: `usuario ${REDACTED} con RUT ${REDACTED}`,
    });
  });

  it("beforeBreadcrumb de fetch/xhr y console no deja pasar secretos ni PII", () => {
    const fetchCrumb = {
      category: "xhr",
      data: { method: "GET", url: "https://api.ejemplo.cl/rpc?token=secreto", status_code: 401 },
    };
    const consoleCrumb = {
      category: "console",
      level: "error",
      message: "login falló para ana@ejemplo.cl, tel +56 9 1234 5678",
      data: { arguments: ["ana@ejemplo.cl", "12.345.678-9"] },
    };
    const cleanCrumb = { category: "ui.click", message: "click en Comprar", data: { selector: "#buy" } };

    const cleanFetch = scrubSentryBreadcrumb(fetchCrumb);
    const cleanConsole = scrubSentryBreadcrumb(consoleCrumb);

    expect(cleanFetch.data.url).toBe(`https://api.ejemplo.cl/rpc?token=${REDACTED}`);
    expect(cleanFetch.data.status_code).toBe(401);
    expect(cleanConsole.message).toBe(`login falló para ${REDACTED}, tel ${REDACTED}`);
    expect(cleanConsole.data.arguments).toEqual([REDACTED, REDACTED]);
    expect(scrubSentryBreadcrumb(cleanCrumb)).toEqual(cleanCrumb);
  });

  it("redacta secretos con patrón en texto libre (JWT, Bearer, correo, RUT, teléfono)", () => {
    const text =
      "Authorization: Bearer abc.def.ghi | jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.firma_larga_123 | " +
      "correo ana@ejemplo.cl rut 12.345.678-9 fono +56 9 8765 4321";

    const clean = redactText(text);

    expect(clean).not.toContain("abc.def.ghi");
    expect(clean).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(clean).not.toContain("ana@ejemplo.cl");
    expect(clean).not.toContain("12.345.678-9");
    expect(clean).not.toContain("8765 4321");
    expect(clean).toContain(REDACTED);
  });

  it("no muta el evento original y tolera ciclos", () => {
    const event = {
      extra: { email: "ana@ejemplo.cl" },
      request: { headers: { authorization: "Bearer x" } },
    };
    const original = JSON.parse(JSON.stringify(event));

    scrubSentryEvent(event);

    expect(event).toEqual(original);

    const cyclic: Record<string, unknown> = { email: "ana@ejemplo.cl" };
    cyclic.self = cyclic;
    expect(() => redactDeep(cyclic)).not.toThrow();
    expect(redactDeep(cyclic).self).toBe("[CIRCULAR]");
  });

  it("conserva números, booleanos y null al recorrer", () => {
    const value = { a: 1, b: true, c: null, d: ["x", 2] };
    expect(redactDeep(value)).toEqual(value);
  });
});
