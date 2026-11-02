import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MAX_BODY_BYTES, parseJson } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";

const ENDPOINT = "https://maverlang.test/api/x";
const schema = z.object({ name: z.string() }).strict();
const encoder = new TextEncoder();

type StreamStats = { pulled: number; cancelled: boolean };

function splitEvery(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += size) {
    chunks.push(bytes.slice(offset, offset + size));
  }
  return chunks;
}

/**
 * Request con cuerpo en chunks y SIN `content-length` (como un envío chunked).
 * `duplex: "half"` lo exige Node al pasar un ReadableStream como body.
 */
function chunkedRequest(chunks: Uint8Array[], stats?: StreamStats): Request {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stats) stats.pulled += 1;
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index]);
      index += 1;
    },
    cancel() {
      if (stats) stats.cancelled = true;
    },
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  };
  return new Request(ENDPOINT, init);
}

describe("parseJson: cuerpos chunked sin Content-Length", () => {
  it("acepta un cuerpo de exactamente maxBytes y conserva UTF-8 partido entre chunks", async () => {
    const payload = { name: "Muñoz 🚀 acción" };
    const bytes = encoder.encode(JSON.stringify(payload));
    const maxBytes = bytes.byteLength;
    // Chunks de 3 bytes: varios caracteres multibyte quedan partidos.
    const req = chunkedRequest(splitEvery(bytes, 3));

    expect(req.headers.get("content-length")).toBeNull();
    await expect(parseJson(req, schema, { maxBytes })).resolves.toEqual(payload);
  });

  it("un byte sobre el límite configurado → 413 PAYLOAD_TOO_LARGE", async () => {
    const bytes = encoder.encode(JSON.stringify({ name: "límite" }));
    const stats: StreamStats = { pulled: 0, cancelled: false };
    const req = chunkedRequest(splitEvery(bytes, 2), stats);

    const failure = await parseJson(req, schema, { maxBytes: bytes.byteLength - 1 }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe("PAYLOAD_TOO_LARGE");
    expect(stats.cancelled).toBe(true);
  });

  it("corta el stream al superar el tope sin leer los chunks restantes", async () => {
    const json = encoder.encode(JSON.stringify({ name: "ok" }));
    const filler = encoder.encode("Z".repeat(8));
    const chunks = [...splitEvery(json, 4), filler, filler];
    const stats: StreamStats = { pulled: 0, cancelled: false };
    const req = chunkedRequest(chunks, stats);

    const failure = await parseJson(req, schema, { maxBytes: 10 }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe("PAYLOAD_TOO_LARGE");
    expect(stats.cancelled).toBe(true);
    expect(stats.pulled).toBeLessThan(chunks.length);
  });

  it("el tope por defecto (MAX_BODY_BYTES) también se aplica sin Content-Length", async () => {
    const chunks = Array.from({ length: 18 }, () => new Uint8Array(1024).fill(0x20));
    const stats: StreamStats = { pulled: 0, cancelled: false };
    const req = chunkedRequest(chunks, stats);

    const failure = await parseJson(req, schema).then(
      () => null,
      (error: unknown) => error,
    );

    expect(MAX_BODY_BYTES).toBe(16_384);
    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe("PAYLOAD_TOO_LARGE");
    expect(stats.cancelled).toBe(true);
    expect(stats.pulled).toBeLessThan(chunks.length);
  });
});
