import { DomainError } from "@/lib/api/result";
import type { Side } from "@/lib/types";

export const LIMIT_DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const USDC_SCALE = TEN ** BigInt(6);
const MAX_ATOMS = (ONE << BigInt(64)) - ONE;

function decimal(value: string) {
  if (!LIMIT_DECIMAL_PATTERN.test(value)) throw new DomainError("VALIDATION");
  const [whole, fraction = ""] = value.split(".");
  const numerator = BigInt(whole + fraction);
  if (numerator === ZERO) throw new DomainError("VALIDATION");
  return { numerator, denominator: TEN ** BigInt(fraction.length) };
}

/** SPL Token-2022 stores the multiplier as an IEEE 754 binary64. */
function multiplierRatio(multiplier: number) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new DomainError("UPSTREAM", "No pudimos verificar el multiplicador del activo.");
  }
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, multiplier);
  const bits = data.getBigUint64(0);
  const exponent = Number(bits >> BigInt(52));
  const fraction = bits & ((ONE << BigInt(52)) - ONE);
  const significand = exponent === 0 ? fraction : fraction + (ONE << BigInt(52));
  const shift = exponent === 0 ? -1074 : exponent - 1075;
  return shift < 0
    ? { numerator: significand, denominator: ONE << BigInt(-shift) }
    : { numerator: significand << BigInt(shift), denominator: ONE };
}

function checkAtoms(value: bigint): bigint {
  if (value <= ZERO || value > MAX_ATOMS) {
    throw new DomainError("VALIDATION", "El monto queda fuera de la precisión o del tamaño permitido.");
  }
  return value;
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - ONE) / denominator;
}

/**
 * Entrada fija: monto USDC al comprar o acciones mostradas al vender.
 * El mínimo se aplica al importe neto acreditado al usuario, con la misma escala
 * que se usó para calcularlo. La comisión de red en SOL queda fuera del par.
 */
export function stockLimitTerms(input: {
  side: Side;
  amount: string;
  limitPriceUsdc: string;
  stockDecimals: number;
  multiplier: number;
}): { inputAtoms: string; minimumOutputAtoms: string } {
  if (!Number.isInteger(input.stockDecimals) || input.stockDecimals < 0 || input.stockDecimals > 18) {
    throw new DomainError("UPSTREAM", "No pudimos verificar la precisión del activo.");
  }
  const amount = decimal(input.amount);
  const price = decimal(input.limitPriceUsdc);
  const scale = TEN ** BigInt(input.stockDecimals);
  const multiplier = multiplierRatio(input.multiplier);
  const shareDenominator = scale * multiplier.denominator;

  if (input.side === "buy") {
    const payment = amount.numerator * USDC_SCALE;
    if (payment % amount.denominator !== ZERO) {
      throw new DomainError("VALIDATION", "Usa hasta seis decimales para el monto en USDC.");
    }
    const usdcAtoms = checkAtoms(payment / amount.denominator);
    const stockAtoms = ceilDivide(
      usdcAtoms * price.denominator * shareDenominator,
      USDC_SCALE * price.numerator * multiplier.numerator,
    );
    return { inputAtoms: usdcAtoms.toString(), minimumOutputAtoms: checkAtoms(stockAtoms).toString() };
  }

  // La venta redondea la entrada hacia abajo para no entregar más acciones que las autorizadas.
  const stockAtoms = checkAtoms(
    (amount.numerator * shareDenominator) / (amount.denominator * multiplier.numerator),
  );
  const usdcAtoms = ceilDivide(
    stockAtoms * multiplier.numerator * price.numerator * USDC_SCALE,
    shareDenominator * price.denominator,
  );
  return { inputAtoms: stockAtoms.toString(), minimumOutputAtoms: checkAtoms(usdcAtoms).toString() };
}
