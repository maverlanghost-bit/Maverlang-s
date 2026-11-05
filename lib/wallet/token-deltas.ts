/**
 * Deltas de saldos de token por dueño (puro, sin red ni base).
 *
 * Un mismo dueño puede tener varias cuentas de token (ATA) del mismo mint.
 * Mirar sólo los saldos que suben permite inflar un depósito moviendo fondos
 * entre cuentas propias: la cuenta destino sube y la de origen baja. Por eso
 * el delta se calcula NETO por mint sumando las subidas y las bajadas de todas
 * las cuentas del dueño en la misma transacción.
 */

export interface TokenBalanceLike {
  accountIndex: number;
  mint: string;
  owner?: string | null;
  uiTokenAmount: {
    uiAmount?: number | null;
    amount?: string | null;
    decimals?: number | null;
  };
}

/** Monto UI del balance; `null` si no se puede leer con seguridad. */
export function uiAmountOf(balance: TokenBalanceLike): number | null {
  // El RPC es una fuente externa: un balance incompleto no debe tumbar el
  // barrido ni interpretarse como un monto.
  const tokenAmount = balance?.uiTokenAmount;
  if (!tokenAmount || typeof tokenAmount !== "object") return null;
  const { uiAmount, amount, decimals } = tokenAmount;
  if (typeof uiAmount === "number" && Number.isFinite(uiAmount)) return uiAmount;
  if (typeof amount === "string" && /^\d+$/.test(amount)) {
    const raw = Number(amount);
    const places = typeof decimals === "number" && decimals >= 0 ? decimals : 6;
    if (Number.isFinite(raw)) return raw / 10 ** places;
  }
  return null;
}

/**
 * Delta neto por mint para las cuentas de `owner`. Positivo = el dueño ganó
 * tokens; negativo = perdió. Incluye cuentas que existían antes y ya no están
 * en `post` (cerradas o reasignadas), restándolas.
 *
 * OJO: `uiAmountOf` asume 6 decimales cuando el RPC no los trae. Eso sirve
 * para mostrar saldos, NO para acreditar dinero: un depósito usa
 * `netTokenDeltaWithExactDecimals`.
 */
export function netTokenDeltasByMint(params: {
  owner: string;
  pre: readonly TokenBalanceLike[];
  post: readonly TokenBalanceLike[];
}): Map<string, number> {
  const owner = params.owner.trim();
  const deltas = new Map<string, number>();
  const add = (mint: string, value: number) => {
    deltas.set(mint, (deltas.get(mint) ?? 0) + value);
  };

  for (const after of params.post) {
    if (after.owner !== owner) continue;
    const afterUi = uiAmountOf(after);
    if (afterUi === null) continue;
    const before = params.pre.find(
      (row) =>
        row.accountIndex === after.accountIndex &&
        row.mint === after.mint &&
        row.owner === owner,
    );
    const beforeUi = before ? uiAmountOf(before) : null;
    add(after.mint, afterUi - (beforeUi ?? 0));
  }

  for (const before of params.pre) {
    if (before.owner !== owner) continue;
    const stillOurs = params.post.some(
      (row) =>
        row.accountIndex === before.accountIndex &&
        row.mint === before.mint &&
        row.owner === owner,
    );
    if (stillOurs) continue;
    const beforeUi = uiAmountOf(before);
    if (beforeUi === null) continue;
    add(before.mint, -beforeUi);
  }

  return deltas;
}

/**
 * Monto UI con el decimal EXACTO. `null` si el balance no trae `decimals` o
 * no coincide con el esperado: para acreditar un depósito no se asume un
 * decimal por defecto (USDC = 6, ver `USDC_DECIMALS`).
 */
export function uiAmountWithExactDecimals(
  balance: TokenBalanceLike,
  decimals: number,
): number | null {
  const tokenAmount = balance?.uiTokenAmount;
  if (!tokenAmount || typeof tokenAmount !== "object") return null;
  if (tokenAmount.decimals !== decimals) return null;
  const { uiAmount, amount } = tokenAmount;
  if (typeof amount === "string" && /^\d+$/.test(amount)) {
    return Number(BigInt(amount)) / 10 ** decimals;
  }
  if (typeof uiAmount === "number" && Number.isFinite(uiAmount)) return uiAmount;
  return null;
}

/**
 * Delta neto del `mint` indicado exigiendo el decimal exacto en CADA balance
 * del dueño que participa de la transacción (previas y posteriores, incluidas
 * las cuentas que desaparecen). Devuelve `null` si algún balance no se puede
 * leer con ese decimal: el llamador descarta el candidato en vez de inventar
 * un monto. Los balances de otros mints no bloquean el cálculo.
 */
export function netTokenDeltaWithExactDecimals(params: {
  owner: string;
  mint: string;
  decimals: number;
  pre: readonly TokenBalanceLike[];
  post: readonly TokenBalanceLike[];
}): number | null {
  const owner = params.owner.trim();
  const ours = (rows: readonly TokenBalanceLike[]) =>
    rows.filter((row) => row.owner === owner && row.mint === params.mint);
  const pre = ours(params.pre);
  const post = ours(params.post);

  let delta = 0;
  for (const after of post) {
    const afterUi = uiAmountWithExactDecimals(after, params.decimals);
    if (afterUi === null) return null;
    const before = pre.find((row) => row.accountIndex === after.accountIndex);
    const beforeUi = before ? uiAmountWithExactDecimals(before, params.decimals) : 0;
    if (beforeUi === null) return null;
    delta += afterUi - beforeUi;
  }
  for (const before of pre) {
    if (post.some((row) => row.accountIndex === before.accountIndex)) continue;
    const beforeUi = uiAmountWithExactDecimals(before, params.decimals);
    if (beforeUi === null) return null;
    delta -= beforeUi;
  }
  return delta;
}
