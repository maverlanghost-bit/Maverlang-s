import "server-only";

import { COPY_FOLLOW_MAX, type CopyFollowRow } from "@/lib/copy/contracts";
import { DomainError } from "@/lib/api/result";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const TABLE = "copy_follows";

function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache|no existe/i.test(message);
}

function isFollowLimit(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const details = "details" in error && typeof error.details === "string" ? error.details : "";
  const hint = "hint" in error && typeof error.hint === "string" ? error.hint : "";
  return /copy_follows_limit|Máximo 10 carteras/i.test(`${message} ${details} ${hint}`);
}

function weightsOf(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [symbol, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[symbol] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export type CopyFollowList = { follows: CopyFollowRow[]; max: number; available: boolean };

export async function listUserCopyFollows(userId: string): Promise<CopyFollowList> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { follows: [], max: COPY_FOLLOW_MAX, available: false };
  }
  const { data, error } = await admin
    .from(TABLE)
    .select("slug,version_id,weights,account,notify,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(COPY_FOLLOW_MAX);
  if (error) {
    if (isMissingTable(error)) return { follows: [], max: COPY_FOLLOW_MAX, available: false };
    throw new DomainError("UPSTREAM", "No pudimos leer tus carteras seguidas.");
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const follows: CopyFollowRow[] = rows
    .map((row) => ({
      slug: String(row.slug ?? ""),
      versionId: String(row.version_id ?? ""),
      weights: weightsOf(row.weights),
      account: row.account === "real" ? ("real" as const) : ("demo" as const),
      notify: row.notify !== false,
      createdAt: String(row.created_at ?? ""),
    }))
    .filter((row) => row.slug !== "" && row.versionId !== "");
  return { follows, max: COPY_FOLLOW_MAX, available: true };
}

export async function upsertUserCopyFollow(input: {
  userId: string;
  slug: string;
  versionId: string;
  weights: Record<string, number>;
  account: "demo" | "real";
  notify: boolean;
  already: boolean;
}): Promise<{ ok: true } | { ok: false; reason: "unavailable" }> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const row = {
    version_id: input.versionId,
    weights: input.weights,
    account: input.account,
    notify: input.notify,
  };
  const writeError = input.already
    ? (await admin.from(TABLE).update(row).eq("user_id", input.userId).eq("slug", input.slug)).error
    : (await admin.from(TABLE).insert({ user_id: input.userId, slug: input.slug, ...row })).error;
  if (writeError) {
    if (isMissingTable(writeError)) return { ok: false, reason: "unavailable" };
    if (isFollowLimit(writeError)) {
      throw new DomainError(
        "LIMIT_ORDER",
        `Puedes seguir hasta ${COPY_FOLLOW_MAX} carteras. Deja de seguir una para agregar otra.`,
      );
    }
    throw new DomainError("UPSTREAM", "No pudimos guardar esa cartera.");
  }
  return { ok: true };
}

export async function deleteUserCopyFollow(input: {
  userId: string;
  slug: string;
}): Promise<{ ok: true } | { ok: false; reason: "unavailable" }> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const { error } = await admin
    .from(TABLE)
    .delete()
    .eq("user_id", input.userId)
    .eq("slug", input.slug);
  if (error) {
    if (isMissingTable(error)) return { ok: false, reason: "unavailable" };
    throw new DomainError("UPSTREAM", "No pudimos actualizar tus carteras.");
  }
  return { ok: true };
}
