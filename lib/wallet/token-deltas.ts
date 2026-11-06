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
 * Fila con `owner` legible. Se usa SÓLO después de la validación fail-closed:
 * si cualquier balance del mint no trae dueño, la transacción completa se
 * descarta antes de llegar aquí.
 */
type OwnedBalance = TokenBalanceLike & { owner: string };

function withReadableOwner(row: TokenBalanceLike): OwnedBalance | null {
  return typeof row.owner === "string" && row.owner.trim() !== ""
    ? (row as OwnedBalance)
    : null;
}

/**
 * Delta neto del `mint` indicado exigiendo el decimal exacto en CADA balance
 * del dueño que participa de la transacción (previas y posteriores, incluidas
 * las cuentas que desaparecen). Devuelve `null` si el monto no se puede
 * atribuir con certeza: el llamador descarta el candidato en vez de inventar
 * un monto.
 *
 * Fail-closed:
 * - Cualquier balance del mint sin `owner` legible → `null`. No se puede
 *   descartar que sea del usuario, así que la transacción completa se omite.
 * - Una cuenta cuyo dueño cambió dentro de la misma transacción → `null`. Un
 *   cambio de autoridad no es una transferencia y contarlo como entrada
 *   regalaría el saldo completo de la cuenta.
 * - Algún balance con un decimal distinto o ausente → `null` (USDC = 6).
 *
 * El neto se suma sobre TODAS las cuentas del dueño en esa firma: las salidas
 * y las transferencias entre cuentas propias compensan a las entradas, así que
 * no se puede inflar un depósito moviendo USDC propio.
 */
export function netTokenDeltaWithExactDecimals(params: {
  owner: string;
  mint: string;
  decimals: number;
  pre: readonly TokenBalanceLike[];
  post: readonly TokenBalanceLike[];
}): number | null {
  const owner = params.owner.trim();
  if (owner === "") return null;

  const preMint = params.pre.filter((row) => row?.mint === params.mint);
  const postMint = params.post.filter((row) => row?.mint === params.mint);

  // Sin dueño no hay atribución posible: ni las filas nuestras ni las ajenas
  // se pueden clasificar. Se descarta la transacción completa. El tipo
  // estrechado de `pre`/`post` sólo refleja esta comprobación ya hecha.
  const pre: OwnedBalance[] = [];
  for (const row of preMint) {
    const owned = withReadableOwner(row);
    if (!owned) return null;
    pre.push(owned);
  }
  const post: OwnedBalance[] = [];
  for (const row of postMint) {
    const owned = withReadableOwner(row);
    if (!owned) return null;
    post.push(owned);
  }

  // Un cambio de dueño en la misma cuenta no es un depósito: la cuenta pudo
  // reasignarse (SetAuthority) y el saldo completo "aparecería" como entrada.
  const preByIndex = new Map<number, OwnedBalance>();
  for (const row of pre) preByIndex.set(row.accountIndex, row);
  for (const after of post) {
    const before = preByIndex.get(after.accountIndex);
    if (before && before.owner.trim() !== after.owner.trim()) return null;
  }

  let delta = 0;
  for (const after of post) {
    if (after.owner.trim() !== owner) continue;
    const afterUi = uiAmountWithExactDecimals(after, params.decimals);
    if (afterUi === null) return null;
    const before = preByIndex.get(after.accountIndex);
    const beforeUi = before ? uiAmountWithExactDecimals(before, params.decimals) : 0;
    if (beforeUi === null) return null;
    delta += afterUi - beforeUi;
  }
  for (const before of pre) {
    if (before.owner.trim() !== owner) continue;
    if (post.some((row) => row.accountIndex === before.accountIndex)) continue;
    const beforeUi = uiAmountWithExactDecimals(before, params.decimals);
    if (beforeUi === null) return null;
    delta -= beforeUi;
  }
  return delta;
}
