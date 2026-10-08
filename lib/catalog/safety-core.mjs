/**
 * Criterios objetivos de seguridad del catálogo (M52).
 * JS puro con JSDoc: sin red, sin entorno y sin dependencias.
 * Lo importan el script de auditoría, vitest y más adelante la app.
 */

/**
 * Umbrales y valores canónicos de seguridad. Congelado.
 * Costos en puntos base (1 bp = 0,01 %).
 */
export const SAFETY_THRESHOLDS = Object.freeze({
  buy100MaxCostBps: 100,
  buy1000MaxCostBps: 150,
  sell100MaxCostBps: 150,
  maxDeviationBps: 300,
  allowedStockMics: ["XNYS", "XNAS"],
  allowedEtfMics: ["XNYS", "XNAS", "ARCX", "BATS"],
  mintAuthority: "7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj",
  freezeAuthority: "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs",
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  decimals: 8,
});

const LEVERAGED_RE = new RegExp(
  "\\b\\d(\\.\\d)?x\\b|2x|3x|\\bultra(pro)?\\b(?!-short)|\\bbull\\b|\\bbear\\b|leverag|inverse|\\bdaily\\b|\\bvix\\b|volatility|yieldmax|t-rex|\\bshort\\b",
  "i",
);

/** "Short" que es duración del bono, no inverso (M52b: NEAR, YEAR). */
const SHORT_DURATION_RE = new RegExp(
  "\\bshort[-\\s]?(duration|term|income|treasury|bond|note|govt|corporate)\\b",
  "i",
);

/** "Ultra-Short Income" con guion o espacios (M52b: "AB Ultra Short Income ETF"). */
const ULTRA_SHORT_INCOME_RE = new RegExp("ultra[-\\s]?short[-\\s]?income", "i");

/**
 * Sufijos de empresa operativa (M52b: "Ultra Clean Holdings" es una empresa,
 * no un ETF apalancado). Sólo aclaran un "ultra" suelto: cualquier señal
 * fuerte (multiplicador, bull/bear, daily, short, ...) sigue vetando.
 */
const OPERATING_COMPANY_RE = new RegExp(
  "\\b(holdings?|incorporated|corporation|limited|plc|technologies|therapeutics|pharmaceuticals?|industries|industrial|systems|networks|energy|foods|motors|labs|laboratories|airlines|railroad|chemicals|materials|mining|retail|hotels|resorts)\\b",
  "i",
);

/** Señales fuertes de apalancado/inverso: ni una empresa operativa las tiene. */
const STRONG_LEVERAGED_RE = new RegExp(
  "\\b\\d(\\.\\d)?x\\b|[23]x|\\bultra-?(pro|short|long)\\b|\\bbull\\b|\\bbear\\b|leverag|inverse|\\bdaily\\b|\\bvix\\b|volatility|yieldmax|t-rex|\\bshort\\b",
  "i",
);

const ETF_NAME_RE = new RegExp(
  "etf|fund|trust|ishares|spdr|vanguard|invesco|schwab|franklin|global\\s*x|vaneck|abrdn|roundhill|sprott|state\\s*street|janus\\s*henderson",
  "i",
);

/**
 * Clasifica el producto por nombre y MIC.
 * @param {unknown} name nombre del activo en xStocks
 * @param {unknown} mic MIC de la bolsa del subyacente
 * @returns {"stock" | "etf" | "leveraged"}
 */
export function classifyProduct(name, mic) {
  const label = typeof name === "string" ? name : "";
  if (ULTRA_SHORT_INCOME_RE.test(label)) return "etf";
  let leveraged = LEVERAGED_RE.test(label);
  // "Short Duration/Term/Income/..." es duración del bono, no inverso.
  if (leveraged && SHORT_DURATION_RE.test(label) && !STRONG_LEVERAGED_RE.test(label.replace(SHORT_DURATION_RE, " "))) {
    leveraged = false;
  }
  // Una empresa operativa con un "ultra" suelto no es un apalancado.
  if (leveraged && OPERATING_COMPANY_RE.test(label) && !STRONG_LEVERAGED_RE.test(label)) {
    leveraged = false;
  }
  if (leveraged) return "leveraged";
  const micUp = typeof mic === "string" ? mic.trim().toUpperCase() : "";
  if (micUp === "ARCX" || micUp === "BATS") return "etf";
  if (ETF_NAME_RE.test(label)) return "etf";
  return "stock";
}

/**
 * Multiplicador vigente del scaledUiConfig de Jupiter.
 * Si newMultiplierEffectiveAt ya pasó, manda newMultiplier.
 * @param {unknown} scaledUiConfig { multiplier, newMultiplier, newMultiplierEffectiveAt }
 * @param {unknown} [nowIso] ISO actual; por defecto ahora
 * @returns {number}
 */
export function effectiveMultiplier(scaledUiConfig, nowIso) {
  if (typeof scaledUiConfig !== "object" || scaledUiConfig === null) return 1;
  const cfg = /** @type {Record<string, unknown>} */ (scaledUiConfig);
  const current = Number(cfg.multiplier);
  const next = Number(cfg.newMultiplier);
  const effectiveAt = cfg.newMultiplierEffectiveAt ?? cfg.newMultiplierEffectiveTimestamp;
  const nowMs = toMs(nowIso ?? Date.now());
  const effMs = toMs(effectiveAt);
  if (Number.isFinite(next) && next > 0 && Number.isFinite(effMs) && Number.isFinite(nowMs) && nowMs >= effMs) {
    return next;
  }
  if (Number.isFinite(current) && current > 0) return current;
  if (Number.isFinite(next) && next > 0) return next;
  return 1;
}

/**
 * @param {unknown} value ISO, Date o segundos/milisegundos unix
 * @returns {number} milisegundos o NaN
 */
function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/**
 * Costo de una cotización en puntos base.
 * Compra: precio por acción = (USDC_in/1e6) / (out/10^assetDecimals × mult); costo = (precio/ref − 1) × 10.000.
 * Venta: precio = (USDC_out/1e6) / (in/10^assetDecimals × mult); costo = (1 − precio/ref) × 10.000.
 * `assetDecimals` es 8 en xStocks; en Ondo son los decimales reales del token
 * (M52b: el costo se calcula sin multiplicador xStocks, con mult = 1).
 * @param {{ side: "buy" | "sell", inAmount: unknown, outAmount: unknown, multiplier: unknown, refPrice: unknown, assetDecimals?: unknown }} args
 * @returns {number} bps (NaN si los datos no son válidos)
 */
export function quoteCostBps({ side, inAmount, outAmount, multiplier, refPrice, assetDecimals = 8 }) {
  const inN = Number(inAmount);
  const outN = Number(outAmount);
  const mult = Number(multiplier);
  const ref = Number(refPrice);
  const decimals = Number(assetDecimals);
  if (![inN, outN, mult, ref].every((v) => Number.isFinite(v) && v > 0)) return NaN;
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) return NaN;
  const unit = 10 ** decimals;
  if (side === "buy") {
    const shares = (outN / unit) * mult;
    if (!(shares > 0)) return NaN;
    const price = inN / 1e6 / shares;
    return (price / ref - 1) * 10000;
  }
  const shares = (inN / unit) * mult;
  if (!(shares > 0)) return NaN;
  const price = outN / 1e6 / shares;
  return (1 - price / ref) * 10000;
}

/**
 * @param {unknown} node nodo xStocks (crudo o ya parseado)
 * @returns {string | null} mint en Solana o null
 */
function nodeMint(node) {
  if (typeof node !== "object" || node === null) return null;
  const n = /** @type {Record<string, unknown>} */ (node);
  for (const key of ["mint", "mintSolana", "solanaMint", "mint_solana"]) {
    if (typeof n[key] === "string" && n[key].trim().length > 0) return n[key].trim();
  }
  const deployments = n.deployments;
  if (Array.isArray(deployments)) {
    for (const item of deployments) {
      if (typeof item !== "object" || item === null) continue;
      const entry = /** @type {Record<string, unknown>} */ (item);
      if (entry.network !== "Solana") continue;
      if (typeof entry.address === "string" && entry.address.trim().length > 0) {
        return entry.address.trim();
      }
    }
  }
  return null;
}

/**
 * @param {unknown} node nodo xStocks (crudo o ya parseado)
 * @param {string} field campo a buscar
 * @returns {string | null}
 */
function nodeText(node, field) {
  if (typeof node !== "object" || node === null) return null;
  const n = /** @type {Record<string, unknown>} */ (node);
  const direct = n[field];
  if (typeof direct === "string" && direct.trim().length > 0) return direct.trim();
  return null;
}

/**
 * @param {unknown} node nodo xStocks (crudo o ya parseado)
 * @returns {string | null} MIC en mayúsculas o null
 */
function nodeMic(node) {
  const direct =
    nodeText(node, "exchangeMic") ?? nodeText(node, "exchange_mic") ?? nodeText(node, "mic");
  if (direct) return direct.toUpperCase();
  if (typeof node === "object" && node !== null) {
    const n = /** @type {Record<string, unknown>} */ (node);
    for (const key of ["underlying", "exchange"]) {
      const nested = n[key];
      if (typeof nested === "object" && nested !== null) {
        const inner = /** @type {Record<string, unknown>} */ (nested);
        const ex = key === "underlying" ? inner.exchange : inner;
        if (typeof ex === "object" && ex !== null) {
          const mic = /** @type {Record<string, unknown>} */ (ex).mic;
          if (typeof mic === "string" && mic.trim().length > 0) return mic.trim().toUpperCase();
        } else if (typeof ex === "string" && ex.trim().length > 0) {
          return ex.trim().toUpperCase();
        }
      }
    }
  }
  return null;
}

/**
 * @param {unknown} node nodo xStocks (crudo o ya parseado)
 * @returns {string | null} moneda del subyacente
 */
function nodeCurrency(node) {
  const direct =
    nodeText(node, "underlyingCurrency") ?? nodeText(node, "underlying_currency") ?? nodeText(node, "currency");
  if (direct) return direct.toUpperCase();
  if (typeof node === "object" && node !== null) {
    const underlying = /** @type {Record<string, unknown>} */ (node).underlying;
    if (typeof underlying === "object" && underlying !== null) {
      const currency = /** @type {Record<string, unknown>} */ (underlying).currency;
      if (typeof currency === "string" && currency.trim().length > 0) return currency.trim().toUpperCase();
    }
  }
  return null;
}

/**
 * @param {unknown} node nodo xStocks (crudo o ya parseado)
 * @returns {number} precio de referencia o NaN
 */
function nodeRefPrice(node) {
  if (typeof node !== "object" || node === null) return NaN;
  const n = /** @type {Record<string, unknown>} */ (node);
  const candidates = [n.refPrice, n.ref_price_usd, n.refPriceUsd, n.price];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const stockData = n.stockData;
  if (typeof stockData === "object" && stockData !== null) {
    const value = Number(/** @type {Record<string, unknown>} */ (stockData).price);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return NaN;
}

/**
 * @param {unknown} token token de Jupiter (lite-api v2 search)
 * @returns {string | null}
 */
function tokenText(token, ...keys) {
  if (typeof token !== "object" || token === null) return null;
  const t = /** @type {Record<string, unknown>} */ (token);
  for (const key of keys) {
    const value = t[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/**
 * @param {unknown} token token de Jupiter (lite-api v2 search)
 * @returns {boolean} true si verificado con tag xstocks
 */
function tokenIsXstocksVerified(token) {
  if (typeof token !== "object" || token === null) return false;
  const t = /** @type {Record<string, unknown>} */ (token);
  const verified = t.isVerified ?? t.verified ?? t.is_verified;
  if (verified !== true) return false;
  const tags = t.tags ?? t.tag ?? t.labels;
  if (Array.isArray(tags)) return tags.some((tag) => String(tag).toLowerCase() === "xstocks");
  if (typeof tags === "string") return tags.toLowerCase().includes("xstocks");
  return false;
}

/**
 * Etiqueta de ruta de una orden Jupiter: `swapType/etiquetas` AMM o
 * `swapType/router` (RFQ/JupiterZ). Pura.
 * @param {unknown} body cuerpo del order de Jupiter
 * @returns {string}
 */
export function orderRouteLabel(body) {
  if (typeof body !== "object" || body === null) return "";
  const root = /** @type {Record<string, unknown>} */ (body);
  const swapType = typeof root.swapType === "string" ? root.swapType : "";
  const plan = Array.isArray(root.routePlan) ? root.routePlan : [];
  const labels = [];
  for (const step of plan) {
    const label =
      typeof step === "object" && step !== null
        ? /** @type {Record<string, unknown>} */ (step).swapInfo !== null &&
          typeof /** @type {Record<string, unknown>} */ (step).swapInfo === "object"
          ? /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (step).swapInfo).label
          : null
        : null;
    if (typeof label === "string" && label.length > 0) labels.push(label);
  }
  if (swapType && labels.length > 0) return `${swapType}/${labels.join("+")}`;
  if (typeof root.router === "string" && root.router.length > 0) {
    return swapType ? `${swapType}/${root.router}` : root.router;
  }
  return swapType;
}

/**
 * Una orden de Jupiter `/order` cuenta como ruta si trae montos válidos y
 * (a) un `routePlan` AMM con etiquetas o (b) un router RFQ (JupiterZ, M52b:
 * así cotiza Ondo). Sin montos no hay ruta. Pura: la usan la auditoría, los
 * tests y (cuando se enchufe) el trade live.
 * @param {unknown} body cuerpo del order de Jupiter
 * @returns {{ ok: boolean, inAmount: number, outAmount: number, route: string, rfq: boolean }}
 */
export function parseOrderQuote(body) {
  const none = { ok: false, inAmount: NaN, outAmount: NaN, route: "", rfq: false };
  if (typeof body !== "object" || body === null) return none;
  const root = /** @type {Record<string, unknown>} */ (body);
  const inAmount = Number(root.inAmount);
  const outAmount = Number(root.outAmount);
  if (!(inAmount > 0) || !(outAmount > 0)) return none;
  const plan = Array.isArray(root.routePlan) ? root.routePlan : [];
  const hasAmmRoute = plan.some(
    (step) =>
      typeof step === "object" &&
      step !== null &&
      typeof /** @type {Record<string, unknown>} */ (step).swapInfo === "object" &&
      /** @type {Record<string, unknown>} */ (step).swapInfo !== null &&
      typeof /** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (step).swapInfo).label === "string" &&
      /** @type {string} */ (/** @type {Record<string, unknown>} */ (/** @type {Record<string, unknown>} */ (step).swapInfo).label).length > 0,
  );
  const router = typeof root.router === "string" ? root.router : "";
  const swapType = typeof root.swapType === "string" ? root.swapType : "";
  const rfq = /jupiterz/i.test(router) || /\brfq\b/i.test(`${swapType} ${router}`);
  if (!hasAmmRoute && !rfq) return none;
  return { ok: true, inAmount, outAmount, route: orderRouteLabel(body), rfq };
}

/**
 * Filtros estáticos: motivos en español con claves estables.
 * `issuer` es `xstocks` (default, sin cambios M52) u `ondo` (M52b: el mint
 * debe estar en `config/ondo.generated.ts`, sin constantes xStocks).
 * @param {{ node: unknown, jupToken: unknown, snapshotMint: unknown, issuer?: unknown, ondoMints?: unknown, ondoKind?: unknown }} args
 * @returns {string[]}
 */
export function staticChecks({ node, jupToken, snapshotMint, issuer = "xstocks", ondoMints = null, ondoKind = null }) {
  const reasons = [];
  const n = typeof node === "object" && node !== null ? /** @type {Record<string, unknown>} */ (node) : {};
  const name = nodeText(node, "name") ?? "";
  const mint = nodeMint(node);

  if (issuer === "ondo") {
    const registry = Array.isArray(ondoMints) ? ondoMints.map(String) : [];
    if (typeof mint !== "string" || !registry.includes(mint)) {
      reasons.push("mint_no_en_registro_ondo");
    }
    const kind = ondoKind === "etf" ? "etf" : ondoKind === "stock" ? "stock" : null;
    if (!kind) {
      reasons.push("tipo_no_stock_ni_etf");
    } else if (classifyProduct(name, kind === "etf" ? "ARCX" : "XNAS") === "leveraged") {
      reasons.push("producto_apalancado_inverso_o_volatilidad");
    }
    const halted =
      n.isTradingHalted === true ||
      n.is_trading_halted === true ||
      (typeof n.trading === "object" &&
        n.trading !== null &&
        /** @type {Record<string, unknown>} */ (n.trading).isTradingHalted === true);
    if (halted) {
      reasons.push("suspendido");
    }
    const currency = nodeCurrency(node);
    if (currency && currency !== "USD") {
      reasons.push("subyacente_no_usd");
    }
    if (!Number.isFinite(nodeRefPrice(node))) {
      reasons.push("sin_precio_de_referencia");
    }
    return reasons;
  }

  const symbol = nodeText(node, "symbol");
  const mic = nodeMic(node);
  const product = classifyProduct(name, mic);

  if (typeof mint !== "string" || !mint.startsWith("Xs") || mint.length < 32) {
    reasons.push("mint_formato_invalido");
  }
  if (typeof snapshotMint === "string" && snapshotMint.length > 0 && mint !== snapshotMint) {
    reasons.push("mint_distinto_al_snapshot_oficial");
  }
  if (jupToken === null || jupToken === undefined) {
    reasons.push("mint_no_en_jupiter");
  } else {
    const jupSymbol = tokenText(jupToken, "symbol");
    if (symbol && jupSymbol && jupSymbol.toUpperCase() !== symbol.toUpperCase()) {
      reasons.push("simbolo_jupiter_distinto");
    }
    if (!tokenIsXstocksVerified(jupToken)) {
      reasons.push("no_verificado_xstocks_en_jupiter");
    }
    const t = /** @type {Record<string, unknown>} */ (jupToken);
    const authoritiesOk =
      tokenText(jupToken, "mintAuthority", "mint_authority") === SAFETY_THRESHOLDS.mintAuthority &&
      tokenText(jupToken, "freezeAuthority", "freeze_authority") === SAFETY_THRESHOLDS.freezeAuthority &&
      tokenText(jupToken, "tokenProgram", "token_program", "program") === SAFETY_THRESHOLDS.tokenProgram &&
      Number(t.decimals) === SAFETY_THRESHOLDS.decimals;
    if (!authoritiesOk) {
      reasons.push("autoridades_no_canonicas");
    }
  }

  const trading = n.trading;
  if (typeof trading !== "object" || trading === null) {
    reasons.push("sin_datos_de_trading");
  }
  const halted =
    n.isTradingHalted === true ||
    n.is_trading_halted === true ||
    (typeof trading === "object" &&
      trading !== null &&
      /** @type {Record<string, unknown>} */ (trading).isTradingHalted === true);
  if (halted) {
    reasons.push("suspendido");
  }

  const currency = nodeCurrency(node);
  if (currency && currency !== "USD") {
    reasons.push("subyacente_no_usd");
  }
  if (product === "leveraged") {
    reasons.push("producto_apalancado_inverso_o_volatilidad");
  }
  if (!mic) {
    reasons.push("bolsa_no_informada");
  } else {
    const allowed =
      product === "etf"
        ? SAFETY_THRESHOLDS.allowedEtfMics
        : product === "stock"
          ? SAFETY_THRESHOLDS.allowedStockMics
          : [...SAFETY_THRESHOLDS.allowedStockMics, ...SAFETY_THRESHOLDS.allowedEtfMics];
    if (!allowed.includes(mic)) {
      reasons.push(`bolsa_no_permitida_${mic}`);
    }
  }
  if (!Number.isFinite(nodeRefPrice(node))) {
    reasons.push("sin_precio_de_referencia");
  }
  return reasons;
}

/**
 * @param {unknown} quote { ok, costBps }
 * @returns {number} costo o NaN
 */
function quoteCostOf(quote) {
  if (typeof quote !== "object" || quote === null) return NaN;
  return Number(/** @type {Record<string, unknown>} */ (quote).costBps);
}

/**
 * @param {unknown} quote { ok }
 * @returns {boolean} true si la cotización se intentó y no tuvo ruta
 */
function quoteAttemptedWithoutRoute(quote) {
  if (typeof quote !== "object" || quote === null) return false;
  return /** @type {Record<string, unknown>} */ (quote).ok !== true;
}

/**
 * Evalúa un activo: estáticos + cotizaciones + desviación. El tier es informativo.
 * @param {{ staticReasons?: unknown, buy100?: unknown, buy1000?: unknown, sell100?: unknown, jupUsdPrice?: unknown, refPrice?: unknown, liquidityUsd?: unknown, jupLiquidityUsd?: unknown, liquidity?: unknown, rfqOnly?: unknown }} args
 * @returns {{ result: "pass" | "fail", reasons: string[], tier: "A" | "B" | "C" | null }}
 */
export function evaluateAsset({
  staticReasons,
  buy100,
  buy1000,
  sell100,
  jupUsdPrice,
  refPrice,
  liquidityUsd,
  jupLiquidityUsd,
  liquidity,
  rfqOnly,
}) {
  const reasons = Array.isArray(staticReasons) ? [...staticReasons].map(String) : [];
  const t = SAFETY_THRESHOLDS;

  if (buy100 !== null && buy100 !== undefined) {
    if (quoteAttemptedWithoutRoute(buy100)) {
      reasons.push("sin_ruta_compra_100");
    } else {
      const cost = quoteCostOf(buy100);
      if (Number.isFinite(cost) && cost > t.buy100MaxCostBps) {
        reasons.push(`costo_compra_100_${Math.round(cost)}bps`);
      }
    }
  }
  if (buy1000 !== null && buy1000 !== undefined) {
    if (quoteAttemptedWithoutRoute(buy1000)) {
      reasons.push("sin_ruta_compra_1000");
    } else {
      const cost = quoteCostOf(buy1000);
      if (Number.isFinite(cost) && cost > t.buy1000MaxCostBps) {
        reasons.push(`costo_compra_1000_${Math.round(cost)}bps`);
      }
    }
  }
  if (sell100 !== null && sell100 !== undefined) {
    if (quoteAttemptedWithoutRoute(sell100)) {
      reasons.push("sin_ruta_venta_100");
    } else {
      const cost = quoteCostOf(sell100);
      if (Number.isFinite(cost) && cost > t.sell100MaxCostBps) {
        reasons.push(`costo_venta_100_${Math.round(cost)}bps`);
      }
    }
  }

  const buyCost = buy100 !== null && buy100 !== undefined && !quoteAttemptedWithoutRoute(buy100) ? quoteCostOf(buy100) : NaN;
  if (Number.isFinite(buyCost) && Math.abs(buyCost) > t.maxDeviationBps) {
    reasons.push(`desviacion_precio_${Math.round(buyCost)}bps`);
  } else {
    const usd = Number(jupUsdPrice);
    const ref = Number(refPrice);
    if (Number.isFinite(usd) && usd > 0 && Number.isFinite(ref) && ref > 0) {
      const deviation = (usd / ref - 1) * 10000;
      if (Math.abs(deviation) > t.maxDeviationBps) {
        reasons.push(`desviacion_precio_${Math.round(deviation)}bps`);
      }
    }
  }

  const liqRaw = liquidityUsd ?? jupLiquidityUsd ?? liquidity;
  const liq = Number(liqRaw);
  /** @type {"A" | "B" | "C" | null} */
  let tier = null;
  if (Number.isFinite(liq) && liqRaw !== null && liqRaw !== undefined && liqRaw !== "") {
    if (liq >= 100000) tier = "A";
    else if (liq >= 10000) tier = "B";
    else tier = "C";
  } else if (rfqOnly === true) {
    tier = "C";
  }

  return { result: reasons.length === 0 ? "pass" : "fail", reasons, tier };
}

/**
 * Prefijos de motivos SOLO de cotización (ruta, costo o desviación).
 * Todo lo demás (mint, autoridades, suspendido, bolsa, apalancado, etc.)
 * es estático: jamás lleva a listado, ni con force_list.
 */
const QUOTE_REASON_RES = [/^sin_ruta_/, /^costo_/, /^desviacion_precio_/];

/**
 * @param {unknown} reason motivo en español con clave estable
 * @returns {boolean} true si es sólo de cotización
 */
export function isQuoteSafetyReason(reason) {
  const text = String(reason ?? "");
  return QUOTE_REASON_RES.some((re) => re.test(text));
}

/**
 * @param {unknown} reasons lista de motivos de evaluateAsset
 * @returns {boolean} true si hay al menos un motivo estático
 */
export function hasStaticSafetyReason(reasons) {
  const list = Array.isArray(reasons) ? reasons.map(String) : [];
  return list.some((reason) => !isQuoteSafetyReason(reason));
}

/**
 * Normaliza la sesión de mercado a market | extended | overnight | closed.
 * Lo desconocido cae a "unknown" (conservador: nunca oculta).
 * @param {unknown} value sesión pedida o período del activo
 * @returns {"market" | "extended" | "overnight" | "closed" | "unknown"}
 */
export function normalizeSafetySession(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "market" || raw === "regular" || raw === "open") return "market";
  if (raw === "extended" || raw === "premarket" || raw === "postmarket" || raw === "pre" || raw === "post") {
    return "extended";
  }
  if (raw === "overnight" || raw === "night") return "overnight";
  if (raw === "closed" || raw === "close") return "closed";
  return "unknown";
}

/**
 * @param {unknown} value estado previo o candidato
 * @returns {"listed" | "watch" | "hidden" | "unknown"}
 */
function asSafetyStatus(value) {
  return value === "listed" || value === "watch" || value === "hidden" ? value : "unknown";
}

/**
 * @param {unknown} value contador previo
 * @returns {number} entero >= 0
 */
function asSafetyCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

/**
 * Máquina de estados de seguridad por activo (M53). Pura: sin red ni entorno.
 * Histéresis: el listado se gana con 2 pasadas (una en sesión market) y se
 * pierde con 2 fallas en market/extended; de noche un listado sólo baja a
 * watch, nunca a hidden.
 * @param {unknown} prev fila previa de assets { safety_status, consecutive_passes, consecutive_fails, manual_override, safety_session }
 * @param {unknown} evaluation { result: "pass" | "fail", reasons: string[] }
 * @param {unknown} session sesión de esta corrida (market | extended | overnight | closed)
 * @returns {{ status: "listed" | "watch" | "hidden" | "unknown", consecutive_passes: number, consecutive_fails: number }}
 */
export function nextSafetyState(prev, evaluation, session) {
  const before = asSafetyStatus(
    typeof prev === "object" && prev !== null
      ? /** @type {Record<string, unknown>} */ (prev).safety_status
      : "unknown",
  );
  const passes = asSafetyCount(
    typeof prev === "object" && prev !== null
      ? /** @type {Record<string, unknown>} */ (prev).consecutive_passes
      : 0,
  );
  const fails = asSafetyCount(
    typeof prev === "object" && prev !== null
      ? /** @type {Record<string, unknown>} */ (prev).consecutive_fails
      : 0,
  );
  const override =
    typeof prev === "object" && prev !== null
      ? /** @type {Record<string, unknown>} */ (prev).manual_override ?? null
      : null;
  const prevSession = normalizeSafetySession(
    typeof prev === "object" && prev !== null
      ? /** @type {Record<string, unknown>} */ (prev).safety_session
      : null,
  );
  const sess = normalizeSafetySession(session);
  const reasons =
    typeof evaluation === "object" && evaluation !== null && Array.isArray(/** @type {Record<string, unknown>} */ (evaluation).reasons)
      ? /** @type {Record<string, unknown>} */ (evaluation).reasons.map(String)
      : [];
  const evalResult =
    typeof evaluation === "object" && evaluation !== null
      ? /** @type {Record<string, unknown>} */ (evaluation).result
      : null;
  const result = evalResult === "pass" || evalResult === "fail" ? evalResult : reasons.length === 0 ? "pass" : "fail";
  const hasStatic = hasStaticSafetyReason(reasons);

  // 1. Forzar oculto manda sobre todo.
  if (override === "force_hide") {
    return { status: "hidden", consecutive_passes: passes, consecutive_fails: fails };
  }
  // 2. Un motivo estático oculta de inmediato (ni force_list lo lista).
  if (hasStatic) {
    return { status: "hidden", consecutive_passes: 0, consecutive_fails: fails + 1 };
  }
  // 3. Forzar listado vale sólo sin motivos estáticos (se revisó arriba).
  if (override === "force_list") {
    return { status: "listed", consecutive_passes: passes, consecutive_fails: 0 };
  }
  // 4. Pasa: racha de pasadas; listado con 2 si una fue en market.
  if (result === "pass") {
    const nextPasses = passes + 1;
    if (before === "listed") {
      return { status: "listed", consecutive_passes: nextPasses, consecutive_fails: 0 };
    }
    const sawMarket = sess === "market" || prevSession === "market";
    if (nextPasses >= 2 && sawMarket) {
      return { status: "listed", consecutive_passes: nextPasses, consecutive_fails: 0 };
    }
    return { status: "watch", consecutive_passes: nextPasses, consecutive_fails: 0 };
  }
  // 5. Falla sólo por cotización: de noche nunca oculta; en market/extended
  // con 2 fallas seguidas oculta, con 1 avisa en watch.
  const nextFails = fails + 1;
  if (sess === "overnight" || sess === "closed" || sess === "unknown") {
    if (before === "listed") {
      return { status: "watch", consecutive_passes: 0, consecutive_fails: nextFails };
    }
    return { status: before, consecutive_passes: 0, consecutive_fails: nextFails };
  }
  if (before === "hidden") {
    return { status: "hidden", consecutive_passes: 0, consecutive_fails: nextFails };
  }
  if (nextFails >= 2) {
    return { status: "hidden", consecutive_passes: 0, consecutive_fails: nextFails };
  }
  return { status: "watch", consecutive_passes: 0, consecutive_fails: nextFails };
}

/**
 * @param {unknown} status estado de seguridad
 * @returns {boolean} true si la app puede mostrar el activo
 */
export function isVisibleStatus(status) {
  return status === "listed" || status === "watch";
}

/**
 * @param {unknown} status estado de seguridad
 * @returns {boolean} true si la app puede operar el activo
 */
export function isTradableStatus(status) {
  return status === "listed";
}
