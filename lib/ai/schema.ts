import "server-only";

import { z } from "zod";

/** Tope del data URL (jpg/png). El cuerpo deja un margen para los mensajes. */
export const AI_MAX_IMAGE_CHARS = 4 * 1024 * 1024;
export const AI_MAX_BODY_BYTES = AI_MAX_IMAGE_CHARS + 96 * 1024;

const DATA_IMAGE = /^data:image\/(png|jpe?g);base64,[a-z0-9+/=]+$/i;

/** jpg o png en data URL, como máximo ~4 MB. Rechaza gif y texto suelto. */
export function isAiImageDataUrl(value: string): boolean {
  if (value.length === 0 || value.length > AI_MAX_IMAGE_CHARS) return false;
  if (!DATA_IMAGE.test(value)) return false;
  const payload = value.slice(value.indexOf(",") + 1);
  if (payload.length < 8) return false;
  const bytes = Math.floor((payload.length * 3) / 4);
  return bytes > 0 && bytes <= AI_MAX_IMAGE_CHARS;
}

/**
 * Cuerpo de POST /api/ai/chat. `tickerSchema` es el de `lib/api/contracts`
 * (la ruta lo pasa) para el mismo criterio de símbolo que el resto de la API.
 */
export function aiChatRequestSchema<T extends string>(tickerSchema: z.ZodType<T>) {
  return z
    .object({
      messages: z
        .array(
          z
            .object({
              role: z.enum(["user", "assistant"]),
              content: z.string().trim().min(1).max(4_000),
            })
            .strict(),
        )
        .min(1)
        .max(20),
      image: z.preprocess(
        (value) => (value === null || value === "" ? undefined : value),
        z.string().max(AI_MAX_IMAGE_CHARS).refine(isAiImageDataUrl).optional(),
      ),
      context: z.preprocess(
        (value) => (value === null ? undefined : value),
        z
          .object({
            ticker: tickerSchema.optional(),
          })
          .strict()
          .optional(),
      ),
    })
    .strict()
    .refine((body) => body.messages.some((message) => message.role === "user"));
}

export type AiChatBody = z.infer<ReturnType<typeof aiChatRequestSchema>>;
