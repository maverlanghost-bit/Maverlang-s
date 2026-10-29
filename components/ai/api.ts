import { aiChatResponseSchema, type AiEndpoint } from "@/components/ai/model";
import type { AiChatRequest, AiChatResponse } from "@/components/ai/contract";

export async function postAssistant(path: AiEndpoint, body: AiChatRequest): Promise<AiChatResponse> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "upstream", message: "" };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  const parsed = aiChatResponseSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  if (response.status === 429) return { ok: false, error: "rate_limited", message: "" };
  if (response.status === 400) return { ok: false, error: "bad_request", message: "" };
  return { ok: false, error: "upstream", message: "" };
}
