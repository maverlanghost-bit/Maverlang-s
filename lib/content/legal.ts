import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { site } from "@/config/site";

export const LEGAL_SLUGS = ["terminos", "privacidad", "riesgos", "comisiones"] as const;

export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "link"; label: string; href: string };

export type Block =
  | { type: "h2"; text: string; id: string }
  | { type: "h3"; text: string; id: string }
  | { type: "p"; inlines: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "table"; headers: Inline[][]; rows: Inline[][][] };

export type LegalDocument = {
  slug: LegalSlug;
  title: string;
  version: string;
  updated: string;
  blocks: Block[];
};

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export function formatLegalDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}

export const getLegalDocument = cache(async (slug: string): Promise<LegalDocument | null> => {
  if (!isLegalSlug(slug)) return null;
  const filePath = path.join(process.cwd(), "content", "legal", `${slug}.md`);
  const raw = await readFile(filePath, "utf8");
  return parseLegalMarkdown(slug, raw);
});

export function parseLegalMarkdown(slug: LegalSlug, raw: string): LegalDocument {
  const { meta, body } = splitFrontmatter(raw);
  const title = meta.title?.trim();
  const version = meta.version?.trim();
  const updated = meta.updated?.trim();

  if (!title) throw new Error(`content/legal/${slug}.md sin title`);
  if (!version) throw new Error(`content/legal/${slug}.md sin version`);
  if (!updated || !isIsoDate(updated)) {
    throw new Error(`content/legal/${slug}.md: updated debe ser YYYY-MM-DD`);
  }

  return { slug, title, version, updated, blocks: parseBlocks(body) };
}

function splitFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) throw new Error("Falta el frontmatter");
  const end = text.indexOf("\n---", 3);
  if (end === -1) throw new Error("El frontmatter no cierra");

  const meta: Record<string, string> = {};
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;
    const separator = trimmed.indexOf(":");
    if (separator === -1) throw new Error(`Frontmatter inválido: ${trimmed}`);
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    meta[key] = value;
  }

  return { meta, body: text.slice(end + 4).replace(/^\r?\n/, "") };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 1) - 1 && date.getUTCDate() === day;
}

function withBrand(value: string): string {
  return value.split("{{brand}}").join(site.name);
}

function parseInlines(input: string): Inline[] {
  const source = withBrand(input);
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  const inlines: Inline[] = [];
  let last = 0;

  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) inlines.push({ type: "text", value: source.slice(last, index) });
    if (match[1] && match[2]) {
      const href = safeHref(match[2]);
      if (href) inlines.push({ type: "link", label: match[1], href });
      else inlines.push({ type: "text", value: match[0] });
    } else if (match[3]) {
      inlines.push({ type: "strong", value: match[3] });
    }
    last = index + match[0].length;
  }

  if (last < source.length) inlines.push({ type: "text", value: source.slice(last) });
  return inlines;
}

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (href.startsWith("mailto:") && !/[\s<>]/.test(href)) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}

function slugify(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "seccion";
}

function isSpecial(line: string): boolean {
  return /^#{2,3}\s+\S/.test(line) || line.startsWith("- ") || line.startsWith("|");
}

function parseBlocks(body: string): Block[] {
  const lines = body.split(/\r?\n/);
  const blocks: Block[] = [];
  const ids = new Set<string>();
  let index = 0;

  function uniqueId(text: string): string {
    const base = slugify(text);
    let id = base;
    let n = 2;
    while (ids.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    ids.add(id);
    return id;
  }

  while (index < lines.length) {
    const trimmed = (lines[index] ?? "").trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        tableLines.push((lines[index] ?? "").trim());
        index += 1;
      }
      const table = parseTable(tableLines);
      if (table) blocks.push(table);
      continue;
    }

    const heading = /^(#{2,3})\s+(.+)$/.exec(trimmed);
    if (heading?.[1] && heading[2]) {
      const text = withBrand(heading[2].trim());
      blocks.push({ type: heading[1].length === 2 ? "h2" : "h3", text, id: uniqueId(text) });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items: Inline[][] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("- ")) {
        items.push(parseInlines((lines[index] ?? "").trim().slice(2)));
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = (lines[index] ?? "").trim();
      if (!current || isSpecial(current)) break;
      paragraph.push(current);
      index += 1;
    }
    if (paragraph.length > 0) blocks.push({ type: "p", inlines: parseInlines(paragraph.join(" ")) });
  }

  return blocks;
}

function splitRow(line: string): string[] {
  const cells = line.split("|").map((cell) => cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function isSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function parseTable(lines: string[]): Block | null {
  const rows = lines.map(splitRow).filter((row) => row.length > 0 && !isSeparator(row));
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  if (!header) return null;
  return {
    type: "table",
    headers: header.map(parseInlines),
    rows: body.map((row) => row.map(parseInlines)),
  };
}
