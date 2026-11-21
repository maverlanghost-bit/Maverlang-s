import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const requireSdk = createRequire(import.meta.url);
const sdkFile = (path: string) => pathToFileURL(resolve("node_modules", path)).href;

const payment = {
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "10000",
  resource: "https://example.com/resource",
  description: "Example",
  mimeType: "application/json",
  payTo: "0x0000000000000000000000000000000000000001",
  maxTimeoutSeconds: 60,
  asset: "0x0000000000000000000000000000000000000002",
  outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
  extra: { name: "Demo", version: "2", optional: null },
};

const typedData = {
  type: "evmTypedDataField",
  types: {
    primaryType: "Order",
    types: { Order: [{ name: "asset", type: "Asset" }], Asset: [{ name: "symbol", type: "string" }] },
  },
  conditions: [{ path: "asset.symbol", match: "^DEMO$" }],
};

describe("wallet SDKs with Zod 4", () => {
  it.each(["import", "require"])("preserves x402 payment metadata via %s", async (entry) => {
    const sdk = entry === "require"
      ? requireSdk("x402/types")
      : await import("x402/types");
    const response = { x402Version: 1, accepts: [payment] };
    expect(sdk.x402ResponseSchema.parse(response)).toEqual(response);
    expect(sdk.PaymentRequirementsSchema.safeParse({ ...payment, outputSchema: [] }).success).toBe(false);
    expect(sdk.PaymentRequirementsSchema.safeParse({ ...payment, maxAmountRequired: "-1" }).success).toBe(false);
  }, 90_000);

  it.each(["_esm", "_cjs"])("preserves EIP-712 named definitions via %s", async (entry) => {
    const file = sdkFile(`@coinbase/cdp-sdk/${entry}/policies/evmSchema.js`);
    const sdk = await import(/* @vite-ignore */ file);
    const schema = sdk.SignEvmTypedDataFieldCriterionSchema;
    expect(schema.parse(typedData)).toEqual(typedData);
    expect(schema.safeParse({
      ...typedData,
      types: { ...typedData.types, types: { Order: [{ name: "asset", type: 123 }] } },
    }).success).toBe(false);
  });

  it("validates login and Solana messages in the wallet frame", async () => {
    const file = sdkFile("@reown/appkit-wallet/dist/esm/src/W3mFrameSchema.js");
    const frame = await import(/* @vite-ignore */ file);
    expect(frame.AppConnectEmailRequest.parse({ email: "demo@example.com" })).toEqual({
      email: "demo@example.com",
    });
    expect(frame.AppConnectEmailRequest.safeParse({ email: "invalid" }).success).toBe(false);
    const message = { method: "solana_signMessage", params: { message: "AA==", pubkey: "demo" } };
    expect(frame.RpcSolanaSignMessageRequest.parse(message)).toEqual(message);
    expect(frame.RpcSolanaSignMessageRequest.safeParse({ ...message, params: { message: "AA==" } }).success).toBe(false);
    expect(frame.RpcSolanaSignTransactionRequest.safeParse({
      method: "solana_signTransaction", params: { transaction: "AA==" },
    }).success).toBe(true);
  });
});
