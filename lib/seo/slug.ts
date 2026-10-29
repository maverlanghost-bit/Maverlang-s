/** Slug legible de una empresa. Minúsculas, sin tildes, sin sufijo de token. */

export function companySlug(value: string): string {
  const folded = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\s+&\s+/g, " y ")
    .replace(/&/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return folded;
}

/**
 * Ticker de la empresa para el title (AAPL, no AAPLx).
 * Si el dato viene igual al símbolo del token, se quita el sufijo `x` u `on`.
 */
export function displayTicker(companyTicker: string, underlying: string, symbol: string): string {
  const raw = (companyTicker || underlying || symbol).trim();
  const token = symbol.trim();
  if (raw.toLowerCase() === token.toLowerCase()) {
    const stripped = raw.replace(/(?:on|x)$/i, "");
    return (stripped || raw).toUpperCase();
  }
  return raw.toUpperCase();
}

export function assignPublicSlugs<T extends { name: string; ticker: string; symbol: string }>(
  rows: readonly T[],
): (T & { slug: string })[] {
  const ordered = [...rows].sort(
    (a, b) => a.symbol.localeCompare(b.symbol) || a.name.localeCompare(b.name, "es"),
  );
  const bases = ordered.map((row) => {
    const base = companySlug(row.name) || companySlug(row.ticker) || "activo";
    return { row, base };
  });
  const counts = new Map<string, number>();
  for (const item of bases) counts.set(item.base, (counts.get(item.base) ?? 0) + 1);

  const used = new Set<string>();
  return bases.map(({ row, base }) => {
    let slug = base;
    if ((counts.get(base) ?? 0) > 1) {
      const extra = companySlug(row.ticker) || companySlug(row.symbol);
      slug = `${base}-${extra}`;
    }
    let n = 2;
    while (used.has(slug)) {
      const extra = companySlug(row.symbol) || companySlug(row.ticker) || String(n);
      slug = used.has(`${base}-${extra}`) ? `${base}-${extra}-${n}` : `${base}-${extra}`;
      n += 1;
    }
    used.add(slug);
    return { ...row, slug };
  });
}
