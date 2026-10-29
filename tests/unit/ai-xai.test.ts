import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { aiMessages } from "@/content/i18n/extra-b";
import {
  XAI_DEFAULT_MODEL,
  XAI_TIMEOUT_MS,
  XAI_URL,
  XaiNotConfiguredError,
  XaiUpstreamError,
  callXai,
  readXaiSettings,
} from "@/lib/ai/xai";

const KEY = "unit-test-ai-key";
const ROOT = path.resolve(__dirname, "..", "..");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("xAI: ajustes", () => {
  it("sin clave no hay modelo inventado ni clave, y el default es grok-4.3", () => {
    expect(XAI_TIMEOUT_MS).toBe(25_000);
    expect(XAI_DEFAULT_MODEL).toBe("grok-4.3");
    expect(readXaiSettings({}).model).toBe("grok-4.3");
    expect(readXaiSettings({ XAI_API_KEY: "  " }).apiKey).toBeUndefined();
    expect(readXaiSettings({ XAI_API_KEY: "abc", XAI_MODEL: "grok-3" })).toEqual({
      apiKey: "abc",
      model: "grok-3",
    });
    expect(readXaiSettings({ XAI_MODEL: "https://evil.example" }).model).toBe("grok-4.3");
  });

  it("la clave vive en el esquema de servidor y en .env.example, vacía", () => {
    const env = readFileSync(path.join(ROOT, "lib", "env.ts"), "utf8");
    const publicBlock = env.slice(env.indexOf("const publicSchema"), env.indexOf("function buildServerSchema"));
    expect(publicBlock.includes("XAI_API_KEY")).toBe(false);
    expect(publicBlock.includes("XAI_MODEL")).toBe(false);
    expect(env.includes("XAI_API_KEY: optionalText()")).toBe(true);
    expect(env.includes("XAI_MODEL: optionalText()")).toBe(true);
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    expect(example.includes("XAI_API_KEY=")).toBe(true);
    expect(example.includes("XAI_MODEL=")).toBe(true);
    expect(/XAI_API_KEY=\S/.test(example)).toBe(false);
  });
});

describe("xAI: callXai", () => {
  it("sin clave no llama a fetch", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(callXai([{ role: "user", content: "hola" }])).rejects.toBeInstanceOf(XaiNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("manda la clave, el modelo y el formato, sin registrar el cuerpo", async () => {
    vi.stubEnv("XAI_API_KEY", KEY);
    vi.stubEnv("XAI_MODEL", "");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input) === XAI_URL).toBe(true);
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization") === `Bearer ${KEY}`).toBe(true);
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        stream: boolean;
        tools?: unknown;
        tool_choice?: string;
        response_format?: { type: string };
        messages: { role: string; content: string }[];
      };
      expect(body.model).toBe("grok-4.3");
      expect(body.stream).toBe(false);
      expect(body.messages[0]?.content).toBe("sistema");
      expect(body.tools).toBeUndefined();
      expect(body.response_format).toEqual({ type: "json_object" });
      return Response.json({
        choices: [{ message: { role: "assistant", content: "listo" } }],
      });
    });
    const result = await callXai([{ role: "system", content: "sistema" }, { role: "user", content: "hola secreto" }], {
      responseFormat: { type: "json_object" },
    });
    expect(result.content).toBe("listo");
    expect(result.toolCalls).toEqual([]);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged.includes(KEY)).toBe(false);
    expect(logged.includes("hola secreto")).toBe(false);
  });

  it("respeta XAI_MODEL y reenvía las tools", async () => {
    vi.stubEnv("XAI_API_KEY", KEY);
    vi.stubEnv("XAI_MODEL", "grok-test-model");
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string; tool_choice?: string; tools?: { function: { name: string } }[] };
      expect(body.model).toBe("grok-test-model");
      expect(body.tool_choice).toBe("auto");
      expect(body.tools?.[0]?.function.name).toBe("get_stock");
      return Response.json({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "get_stock", arguments: "{\"query\":\"tesla\"}" },
                },
              ],
            },
          },
        ],
      });
    });
    const result = await callXai([{ role: "user", content: "tesla" }], {
      tools: [
        {
          type: "function",
          function: {
            name: "get_stock",
            description: "precio",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        },
      ],
    });
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "get_stock", arguments: "{\"query\":\"tesla\"}" }]);
  });

  it("un 500 del proveedor es upstream y no copia el cuerpo", async () => {
    vi.stubEnv("XAI_API_KEY", KEY);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response("CUERPO-SECRETO-UPSTREAM", { status: 500 }));
    await expect(callXai([{ role: "user", content: "hola" }])).rejects.toBeInstanceOf(XaiUpstreamError);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged.includes("CUERPO-SECRETO-UPSTREAM")).toBe(false);
    expect(logged.includes(KEY)).toBe(false);
  });

  it("aborta a los 25 s", async () => {
    vi.stubEnv("XAI_API_KEY", KEY);
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      });
    });
    const pending = callXai([{ role: "user", content: "hola" }], { timeoutMs: XAI_TIMEOUT_MS });
    const settled = pending.then(
      () => "ok" as const,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(24_000);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(signal?.aborted).toBe(true);
    const error = await settled;
    expect(error).toBeInstanceOf(XaiUpstreamError);
    expect(error instanceof XaiUpstreamError && error.message === aiMessages.esCL.timeout).toBe(true);
  });
});
