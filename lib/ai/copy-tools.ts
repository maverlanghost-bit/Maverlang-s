import "server-only";

import { COPY_EXAMPLE_DATA } from "@/content/copy-legal";
import { getCopyEntitlement, hasCopyAccess } from "@/lib/copy/access";
import { getCopyIndex, getCopyPortfolio, isCopyFrozenByFeed } from "@/lib/copy/feed";
import { isCopyEnabled } from "@/lib/copy/flags";
import { formatFeedDate, lagChip } from "@/lib/copy/lag";
import { coverageOf, mapPositions } from "@/lib/copy/mapping";
import { buildCopyPlan } from "@/lib/copy/plan";
import { canonicalSlug } from "@/lib/copy/slugs";
import { COPYABLE_FAMILIES, isCopyFamily, type CopyFamily, type CopyPortfolio } from "@/lib/copy/types";
import { getServices } from "@/lib/services";
import { fold } from "@/lib/market/browse";

import type { ToolResult } from "@/lib/ai/tools";
import type { XaiTool } from "@/lib/ai/xai";

/**
 * Herramientas del chat para «Copiar carteras» (encargo §1.13 y §3 S9).
 *
 * Todas son de SOLO LECTURA: leen el feed verificado por `lib/copy/feed.ts`,
 * aplican el paywall de `lib/copy/access.ts` y nunca crean un `planId` ni una
 * orden. `open_copy_mix` sólo devuelve el enlace a la pantalla que ya existe,
 * igual que `open_buy`.
 *
 * Reglas de redacción que sostienen estas herramientas:
 * - cada respuesta cita la fecha del dato y el atraso;
 * - cierra con «tecnología de Fraccion.si»;
 * - sin suscripción sólo viajan metadatos (nunca la composición, salvo las
 *   corredoras chilenas, que son públicas igual que en Fraccion.si);
 * - no se recomienda copiar ni se promete rendimiento.
 */

const SEAL = "tecnología de Fraccion.si";
const COPY_NOTE = "Copias lo último que se declaró, no la cartera de hoy.";

/** Tope de carteras que devuelve el listado. */
const MAX_LIST = 10;
/** Tope de detalles que se leen para el listado (el índice puede ser grande). */
const MAX_DETAIL_READS = 12;
/** Tope de posiciones y movimientos que viajan al modelo. */
const MAX_POSITIONS = 10;
const MAX_MOVEMENTS = 10;
/** Tope de piernas que se muestran de una mezcla simulada (el plan corta en 25). */
const MAX_LEGS = 15;
/** Mismo rango que `/api/copy/plan`: monto total en USD. */
const MIN_TOTAL_USD = 1;
const MAX_TOTAL_USD = 1_000_000;

type CopyIndex = Awaited<ReturnType<typeof getCopyIndex>>;
type IndexEntry = CopyIndex["entries"][number];
type FeedHealth = CopyIndex["health"];
type Movement = CopyPortfolio["movements"][number];
type Mapped = Awaited<ReturnType<typeof mapPositions>>[number];

const FAMILY_LABEL: Record<CopyFamily, string> = {
  "13f": "Fondo 13F",
  etf: "ETF",
  broker_cl: "Corredora chilena",
  afp: "AFP",
  thematic: "Temática de Fraccion",
};

const MOVEMENT_LABEL: Record<string, string> = {
  weight_change: "Cambio de peso",
  new: "Entró",
  exit: "Salió",
  increase: "Subió el peso",
  decrease: "Bajó el peso",
};

const PCT_1 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const NUM_2 = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

const objectParams = (
  properties: Record<string, unknown>,
  required: string[],
): XaiTool["function"]["parameters"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const SLUG_PARAM = { type: "string", description: "Slug canónico de la cartera, por ejemplo berkshire-hathaway-13f." };

const AMOUNT_PARAM = {
  type: "number",
  minimum: MIN_TOTAL_USD,
  maximum: MAX_TOTAL_USD,
  description: "Monto total en USD que se repartiría entre las posiciones.",
};

/** Definiciones OpenAI-compatible; el servidor las ejecuta, el modelo no. */
export const COPY_TOOLS: readonly XaiTool[] = [
  {
    type: "function",
    function: {
      name: "list_copy_portfolios",
      description:
        "Lista hasta 10 carteras publicadas por Fraccion.si (fondos 13F, ETFs, corredoras chilenas, AFP y temáticas) con gestor, fecha del dato, atraso y cobertura en Maverlang. Sólo lectura: no copia nada.",
      parameters: objectParams(
        {
          family: {
            type: "string",
            enum: ["13f", "etf", "broker_cl", "afp", "thematic"],
            description: "Familia a filtrar. Si falta, todas.",
          },
          query: { type: "string", description: "Texto del nombre o del gestor para buscar." },
        },
        [],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "get_copy_portfolio",
      description:
        "Ficha de una cartera de Fraccion.si: gestor, familia, fecha del dato, atraso, cobertura, avisos (recorte, congelada, estimada) y, si la persona tiene suscripción, el top 10 de posiciones con su peso original y su peso en Maverlang. Sin suscripción sólo entrega metadatos.",
      parameters: objectParams({ slug: SLUG_PARAM }, ["slug"]),
    },
  },
  {
    type: "function",
    function: {
      name: "get_copy_movements",
      description:
        "Movimientos de la última versión de una cartera de Fraccion.si: qué entró, qué salió y qué peso cambió, con sus fechas y su verificación. Requiere suscripción a Copiar carteras; sin acceso no se entrega.",
      parameters: objectParams({ slug: SLUG_PARAM }, ["slug"]),
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_copy_mix",
      description:
        "Simula el reparto de un monto en USD entre las posiciones comprables de una cartera: piernas, cobertura, lo que queda sin comprar y avisos. Requiere suscripción. No crea un plan firmado ni ejecuta órdenes, y no proyecta rentabilidad.",
      parameters: objectParams(
        { slug: SLUG_PARAM, amountUsd: AMOUNT_PARAM },
        ["slug", "amountUsd"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "open_copy_mix",
      description:
        "Devuelve el enlace a la pantalla de la mezcla de una cartera (/app/copiar/{slug}/mezcla), opcionalmente con el monto. No ejecuta nada: la persona elige y confirma ahí.",
      parameters: objectParams({ slug: SLUG_PARAM, amountUsd: AMOUNT_PARAM }, ["slug"]),
    },
  },
];

const COPY_TOOL_NAMES = new Set(COPY_TOOLS.map((tool) => tool.function.name));

function textArg(value: unknown, max = 64): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function numberArg(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function familyOf(value: unknown): CopyFamily | null {
  return typeof value === "string" && isCopyFamily(value) ? value : null;
}

function familyLabel(family: CopyFamily): string {
  return FAMILY_LABEL[family];
}

function isCopyable(family: CopyFamily): boolean {
  return COPYABLE_FAMILIES.some((row) => row === family);
}

function pct(value: number): string {
  return `${PCT_1.format(Math.round(value * 10) / 10)} %`;
}

function usd(value: number): string {
  return `US$ ${NUM_2.format(Math.round(value * 100) / 100)}`;
}

function feedDate(value: string | null | undefined): string {
  if (!value) return "sin fecha";
  try {
    return formatFeedDate(value) || "sin fecha";
  } catch {
    return "sin fecha";
  }
}

/** Chip de atraso + fecha de presentación. Nunca se omite en una ficha. */
function dateLine(portfolio: CopyPortfolio): string {
  const meta = portfolio.portfolio;
  let base = "";
  try {
    base = lagChip(meta.asOf, meta.family, meta.isFrozen).label;
  } catch {
    base = "";
  }
  if (!base) {
    const lag = typeof meta.lagDays === "number" ? ` · ${meta.lagDays} días de atraso` : "";
    base = `Dato al ${feedDate(meta.asOf)}${lag}`;
  }
  const filed = meta.filedAt ? ` · declarado el ${feedDate(meta.filedAt)}` : "";
  return `${base}${filed}`;
}

function healthLine(health: FeedHealth): string {
  if (health.state === "none") return "Fraccion.si todavía no publicó datos.";
  const at = health.generatedAt ? ` (${feedDate(health.generatedAt)})` : "";
  if (health.state === "expired") {
    return `Los datos de Fraccion.si están vencidos${at}: se pueden mirar, pero no se puede copiar.`;
  }
  if (health.state === "invalid") {
    return `La firma de los datos de Fraccion.si no es válida${at}: se pueden mirar, pero no se puede copiar.`;
  }
  if (health.state === "stale") {
    return `Datos de Fraccion.si desactualizados${at}: la actualización está atrasada.`;
  }
  return `Datos de Fraccion.si actualizados${at}.`;
}

function notesOf(portfolio: CopyPortfolio): string[] {
  const meta = portfolio.portfolio;
  const notes: string[] = [];
  if (meta.isFrozen) notes.push("Cartera congelada: el fondo dejó de reportar; no es la cartera de hoy.");
  if (!meta.isComplete) notes.push("Recorte: no incluye todas las posiciones del libro completo, así que los pesos no suman 100.");
  if (meta.isEstimated) notes.push("Los pesos son una estimación de Fraccion.si, no una declaración oficial.");
  if (meta.family === "broker_cl") notes.push("Corredora chilena: en Maverlang es sólo para mirar, porque no se compran acciones chilenas.");
  if (meta.isFrozen || !isCopyable(meta.family)) notes.push("Esta cartera no ofrece «Copiar esta mezcla».");
  if (portfolio.example) notes.push(COPY_EXAMPLE_DATA);
  return notes;
}

function statusLabel(row: Mapped): string {
  if (row.status === "available") return "disponible";
  if (row.status === "review") return "en revisión";
  return row.reason ? `no disponible (${row.reason})` : "no disponible";
}

function priceLine(row: Mapped): string {
  const weight = `${pct(row.weightOriginal)} → ${pct(row.weightMaverlang)}`;
  const symbol = row.tradableSymbol ?? row.symbol;
  return `• ${symbol}${symbol !== row.symbol ? ` (${row.symbol})` : ""}: ${weight} · ${statusLabel(row)}`;
}

/** `CopyMovement` ya está tipado en el contrato: se lee directo, sin inventar. */
function movementText(movement: Movement): string {
  const type = MOVEMENT_LABEL[movement.type] ?? (movement.type || "Movimiento");
  const parts = [type, movement.symbol || "—"];
  if (movement.weightFrom !== null || movement.weightTo !== null) {
    const from = movement.weightFrom === null ? "—" : pct(movement.weightFrom);
    const to = movement.weightTo === null ? "—" : pct(movement.weightTo);
    parts.push(`${from} → ${to}`);
  }
  const published = movement.publishedAt ?? movement.txDate;
  if (published) parts.push(`publicado el ${feedDate(published)}`);
  if (movement.lagDays !== null) parts.push(`${movement.lagDays} días de atraso`);
  return `• ${parts.join(" · ")}`;
}

/** Campos del índice: el contrato `CopyIndexEntry` ya los fija en camelCase. */
function entrySlug(entry: IndexEntry): string | null {
  return textArg(entry.slug, 80);
}

function entryName(entry: IndexEntry): string | null {
  return textArg(entry.name, 120);
}

function entryFamily(entry: IndexEntry): CopyFamily | null {
  return familyOf(entry.family);
}

async function copyEnabled(): Promise<boolean> {
  try {
    return await isCopyEnabled();
  } catch {
    return false;
  }
}

async function readAccess(req: Request): Promise<boolean> {
  try {
    const session = await getServices().auth.getSession(req);
    if (!session) return false;
    return hasCopyAccess(await getCopyEntitlement(session.userId));
  } catch {
    return false;
  }
}

async function coverageOfPortfolio(portfolio: CopyPortfolio): Promise<number | null> {
  try {
    return Math.round(coverageOf(await mapPositions(portfolio.positions)));
  } catch {
    return null;
  }
}

async function topMapped(portfolio: CopyPortfolio, limit: number): Promise<Mapped[] | null> {
  try {
    const mapped = await mapPositions(portfolio.positions);
    return [...mapped].sort((a, b) => b.weightOriginal - a.weightOriginal).slice(0, limit);
  } catch {
    return null;
  }
}

function result(content: string, stockRelated = true): ToolResult {
  return { content, widgets: [], stockRelated };
}

function notAvailable(): ToolResult {
  return result("Copiar carteras todavía no está disponible en Maverlang. No hay datos que mostrar.", false);
}

function badRequest(message: string): ToolResult {
  return result(message, false);
}

function loadError(): ToolResult {
  return result("No pude leer los datos de Fraccion.si ahora. No los inventes: dilo y ofrece lo que sí venga de otras herramientas.", false);
}

async function loadPortfolio(slugInput: string): Promise<{ slug: string; portfolio: CopyPortfolio } | null> {
  const slug = canonicalSlug(slugInput) ?? slugInput.toLowerCase();
  if (!slug) return null;
  const portfolio = await getCopyPortfolio(slug);
  return portfolio ? { slug, portfolio } : null;
}

function missingPortfolio(name: string): ToolResult {
  return result(`No encontré la cartera «${name}» en Fraccion.si. Puedes listar las disponibles con list_copy_portfolios.`, false);
}

async function toolList(args: Record<string, unknown>): Promise<ToolResult> {
  if (!(await copyEnabled())) return notAvailable();
  const rawFamily = args.family;
  const family = familyOf(rawFamily);
  if (rawFamily !== undefined && rawFamily !== null && rawFamily !== "" && family === null) {
    return badRequest("La familia de list_copy_portfolios es 13f, etf, broker_cl, afp o thematic.");
  }
  const query = textArg(args.query, 60);

  let index: CopyIndex;
  try {
    index = await getCopyIndex();
  } catch {
    return loadError();
  }
  const entries = index.entries ?? [];
  if (entries.length === 0) {
    return result(`Todavía no hay carteras publicadas por Fraccion.si. ${SEAL}`);
  }

  const candidates: IndexEntry[] = [];
  for (const entry of entries) {
    const name = entryName(entry);
    const entryFam = entryFamily(entry);
    if (query && !fold(name ?? entrySlug(entry) ?? "").includes(fold(query))) continue;
    if (family && entryFam && entryFam !== family) continue;
    candidates.push(entry);
    if (candidates.length >= MAX_DETAIL_READS) break;
  }
  if (candidates.length === 0) {
    return result(`No hay carteras que calcen con ese filtro. ${healthLine(index.health)} ${SEAL}`, false);
  }

  const loaded = await Promise.all(
    candidates.map(async (entry) => {
      const slug = entrySlug(entry);
      if (!slug) return null;
      try {
        const portfolio = await getCopyPortfolio(canonicalSlug(slug) ?? slug);
        return portfolio ? { slug: canonicalSlug(slug) ?? slug, portfolio } : null;
      } catch {
        return null;
      }
    }),
  );

  const rows: string[] = [];
  for (const item of loaded) {
    if (rows.length >= MAX_LIST) break;
    if (!item) continue;
    const meta = item.portfolio.portfolio;
    if (family && meta.family !== family) continue;
    const coverage = await coverageOfPortfolio(item.portfolio);
    const pieces = [
      `• ${meta.name} — ${familyLabel(meta.family)}${meta.manager ? ` · ${meta.manager}` : ""}`,
      `  Dato al ${feedDate(meta.asOf)}${typeof meta.lagDays === "number" ? ` · ${meta.lagDays} días de atraso` : ""}`,
      `  Cobertura en Maverlang: ${coverage === null ? "sin dato" : pct(coverage)} · /app/copiar/${item.slug}`,
    ];
    if (!isCopyable(meta.family)) pieces.push("  Sólo para mirar: no se puede copiar.");
    if (meta.isFrozen) pieces.push("  Cartera congelada: no es la cartera de hoy.");
    rows.push(pieces.join("\n"));
  }

  if (rows.length === 0) {
    return result(`No hay carteras que calcen con ese filtro. ${healthLine(index.health)} ${SEAL}`, false);
  }

  const header = [
    `Carteras de Fraccion.si (${rows.length}):`,
    healthLine(index.health),
    "",
  ];
  return result([...header, ...rows, "", COPY_NOTE, SEAL].join("\n"));
}

async function toolPortfolio(args: Record<string, unknown>, req: Request): Promise<ToolResult> {
  if (!(await copyEnabled())) return notAvailable();
  const name = textArg(args.slug ?? args.query, 80);
  if (!name) return badRequest("Indica el slug de la cartera, por ejemplo berkshire-hathaway-13f.");

  let found: { slug: string; portfolio: CopyPortfolio } | null = null;
  try {
    found = await loadPortfolio(name);
  } catch {
    return loadError();
  }
  if (!found) return missingPortfolio(name);

  const { slug, portfolio } = found;
  const meta = portfolio.portfolio;
  const access = await readAccess(req);
  const visible = access || meta.family === "broker_cl";
  const coverage = await coverageOfPortfolio(portfolio);

  const lines = [
    `${meta.name} — ${familyLabel(meta.family)}${meta.manager ? ` · ${meta.manager}` : ""}`,
    dateLine(portfolio),
    `Cobertura en Maverlang: ${coverage === null ? "sin dato" : pct(coverage)}`,
    `Ficha: /app/copiar/${slug}`,
  ];
  if (meta.lagNote) lines.push(`Atraso: ${meta.lagNote}`);
  lines.push(...notesOf(portfolio));

  if (visible) {
    const top = await topMapped(portfolio, MAX_POSITIONS);
    if (top && top.length > 0) {
      lines.push("", `Top ${top.length} por peso (original → Maverlang):`, ...top.map(priceLine));
    } else {
      lines.push("", "No pude mapear las posiciones a activos de Maverlang.");
    }
  } else {
    lines.push(
      "",
      "La composición y los movimientos son parte de la suscripción a Copiar carteras. Sin acceso sólo se muestran metadatos; el plan está en /app/copiar/planes. No inventes posiciones ni pesos.",
    );
  }

  if (portfolio.disclaimer) lines.push("", `Aviso: ${portfolio.disclaimer}`);
  lines.push("", COPY_NOTE, SEAL);
  return result(lines.join("\n"));
}

async function toolMovements(args: Record<string, unknown>, req: Request): Promise<ToolResult> {
  if (!(await copyEnabled())) return notAvailable();
  const name = textArg(args.slug ?? args.query, 80);
  if (!name) return badRequest("Indica el slug de la cartera, por ejemplo berkshire-hathaway-13f.");

  let found: { slug: string; portfolio: CopyPortfolio } | null = null;
  try {
    found = await loadPortfolio(name);
  } catch {
    return loadError();
  }
  if (!found) return missingPortfolio(name);

  const { slug, portfolio } = found;
  const meta = portfolio.portfolio;
  const access = await readAccess(req);
  if (!access) {
    return result(
      [
        `${meta.name} — ${familyLabel(meta.family)}`,
        dateLine(portfolio),
        "",
        "Los movimientos son parte de la suscripción a Copiar carteras y no se entregan sin acceso. El plan está en /app/copiar/planes.",
        `Ficha: /app/copiar/${slug}`,
        "",
        SEAL,
      ].join("\n"),
      false,
    );
  }

  const movements = Array.isArray(portfolio.movements) ? portfolio.movements : [];
  const lines = [`Movimientos de ${meta.name} (${familyLabel(meta.family)})`, dateLine(portfolio), ""];
  if (movements.length === 0) {
    lines.push("Esta versión no trae movimientos publicados por Fraccion.si.");
  } else {
    const shown = movements.slice(0, MAX_MOVEMENTS);
    lines.push(`Última versión (${shown.length} de ${movements.length}):`, ...shown.map(movementText));
  }
  lines.push("", "El 13F y las demás fuentes pueden corregirse después; un cambio de versión aparece como ajuste, no como una operación del fondo.", COPY_NOTE, SEAL);
  return result(lines.join("\n"));
}

async function toolSimulate(args: Record<string, unknown>, req: Request): Promise<ToolResult> {
  if (!(await copyEnabled())) return notAvailable();
  const name = textArg(args.slug ?? args.query, 80);
  if (!name) return badRequest("Indica el slug de la cartera, por ejemplo berkshire-hathaway-13f.");
  const amount = numberArg(args.amountUsd ?? args.amount ?? args.usd);
  if (amount === null || amount < MIN_TOTAL_USD || amount > MAX_TOTAL_USD) {
    return badRequest(`El monto de simulate_copy_mix es en USD, entre ${MIN_TOTAL_USD} y ${MAX_TOTAL_USD}.`);
  }

  let found: { slug: string; portfolio: CopyPortfolio } | null = null;
  let health: FeedHealth | null = null;
  try {
    const index = await getCopyIndex();
    health = index.health;
    found = await loadPortfolio(name);
  } catch {
    return loadError();
  }
  if (!found) return missingPortfolio(name);

  const { slug, portfolio } = found;
  const meta = portfolio.portfolio;
  const access = await readAccess(req);
  if (!access) {
    return result(
      [
        `Simular la mezcla de ${meta.name} requiere la suscripción a Copiar carteras.`,
        dateLine(portfolio),
        "El plan está en /app/copiar/planes. No inventes piernas, montos ni cobertura.",
        SEAL,
      ].join("\n"),
      false,
    );
  }
  if (health && isCopyFrozenByFeed(health)) {
    return result(
      [`No se puede armar la mezcla: ${healthLine(health)}`, dateLine(portfolio), SEAL].join("\n"),
      false,
    );
  }
  if (meta.isFrozen) {
    return result(
      [
        `${meta.name} está congelada: el fondo dejó de reportar. Se puede mirar, pero no se arma una mezcla como si fuera la cartera de hoy.`,
        dateLine(portfolio),
        SEAL,
      ].join("\n"),
      false,
    );
  }
  if (!isCopyable(meta.family)) {
    return result(
      [
        `${meta.name} es ${familyLabel(meta.family)} y en esta versión es sólo para mirar: no se puede copiar.`,
        dateLine(portfolio),
        SEAL,
      ].join("\n"),
      false,
    );
  }

  let plan: Awaited<ReturnType<typeof buildCopyPlan>>;
  try {
    // `spreadUnavailable: true` = repartir lo no comprable (opción principal §1.5).
    plan = await buildCopyPlan({ portfolio, totalUsd: amount, account: "demo", spreadUnavailable: true });
  } catch {
    return result(
      [
        `No pude armar la mezcla de ${meta.name} con ${usd(amount)}. Si la cobertura es baja, esta cartera no se puede replicar bien en Maverlang.`,
        dateLine(portfolio),
        SEAL,
      ].join("\n"),
      false,
    );
  }

  const legs = plan.legs.slice(0, MAX_LEGS);
  const lines = [
    `Simulación de ${meta.name} con ${usd(amount)}`,
    dateLine(portfolio),
    `Cobertura: replicas el ${pct(plan.coveragePct)} del portafolio original.`,
    `Queda sin comprar: ${usd(plan.unavailableUsd)}.`,
  ];
  if (legs.length === 0) {
    lines.push("", "Con este monto no se arma una mezcla: la cobertura no alcanza el mínimo o ninguna posición se puede comprar.");
  } else {
    lines.push(
      "",
      "Piernas (las calcula el servidor; el monto del cliente no entra acá):",
      ...legs.map(
        (leg) => `• ${leg.symbol}: ${usd(leg.usd)} · ${pct(leg.weightOriginal)} → ${pct(leg.weightMaverlang)}`,
      ),
    );
    if (plan.legs.length > legs.length) lines.push(`• y ${plan.legs.length - legs.length} piernas más.`);
  }
  const warnings = plan.warnings.slice(0, 5);
  if (warnings.length > 0) lines.push("", "Avisos:", ...warnings.map((warning) => `• ${warning}`));
  lines.push(
    "",
    "Es un reparto informativo: no se creó ningún plan firmado ni ninguna orden, y no es una proyección de rentabilidad.",
    `Pantalla de la mezcla: /app/copiar/${slug}/mezcla`,
    COPY_NOTE,
    SEAL,
  );
  return result(lines.join("\n"));
}

async function toolOpenMix(args: Record<string, unknown>): Promise<ToolResult> {
  if (!(await copyEnabled())) return notAvailable();
  const name = textArg(args.slug ?? args.query, 80);
  if (!name) return badRequest("Indica el slug de la cartera, por ejemplo berkshire-hathaway-13f.");

  let found: { slug: string; portfolio: CopyPortfolio } | null = null;
  try {
    found = await loadPortfolio(name);
  } catch {
    return loadError();
  }
  if (!found) return missingPortfolio(name);

  const { slug, portfolio } = found;
  const meta = portfolio.portfolio;
  const amount = numberArg(args.amountUsd ?? args.amount ?? args.usd);
  const validAmount = amount !== null && amount >= MIN_TOTAL_USD && amount <= MAX_TOTAL_USD ? amount : null;
  const href = `/app/copiar/${encodeURIComponent(slug)}/mezcla${validAmount === null ? "" : `?monto=${Math.round(validAmount * 100) / 100}`}`;

  const lines = [
    `Abre la mezcla de ${meta.name}: ${href}`,
    dateLine(portfolio),
    "Ahí eliges el monto, revisas la cobertura y confirmas orden por orden. Esta herramienta sólo entrega el enlace: no ejecuta ninguna orden.",
  ];
  if (!isCopyable(meta.family)) lines.push("En esta versión es sólo para mirar: no se puede copiar.");
  if (meta.isFrozen) lines.push("La cartera está congelada: el fondo dejó de reportar.");
  lines.push(SEAL);
  return result(lines.join("\n"));
}

/**
 * Despacha una herramienta de Copiar carteras. Devuelve `null` si el nombre no
 * es de este grupo, para que `executeToolCall` siga con las suyas.
 */
export async function executeCopyTool(
  name: string,
  args: Record<string, unknown>,
  req: Request,
): Promise<ToolResult | null> {
  if (!COPY_TOOL_NAMES.has(name)) return null;
  try {
    if (name === "list_copy_portfolios") return await toolList(args);
    if (name === "get_copy_portfolio") return await toolPortfolio(args, req);
    if (name === "get_copy_movements") return await toolMovements(args, req);
    if (name === "simulate_copy_mix") return await toolSimulate(args, req);
    if (name === "open_copy_mix") return await toolOpenMix(args);
    return null;
  } catch {
    // Nunca se filtra el error: el chat responde que no pudo leer el dato.
    console.error(`ai chat copy tool ${/^[a-z0-9_-]{1,40}$/i.test(name) ? name : "unknown"}`);
    return loadError();
  }
}
