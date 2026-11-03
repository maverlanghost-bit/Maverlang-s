/**
 * Dirección de Solana: base58 y exactamente 32 bytes.
 * No consulta la cadena ni exige que la clave esté sobre la curva.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const INDEX: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i += 1) {
  INDEX[ALPHABET.charAt(i)] = i;
}

/** `null` si hay un carácter fuera del alfabeto base58. */
export function decodeBase58(value: string): Uint8Array | null {
  if (value.length === 0) return null;
  const bytes = [0];
  for (const char of value) {
    const digit = INDEX[char];
    if (digit === undefined) return null;
    let carry = digit;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += (bytes[j] ?? 0) * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; value[i] === "1" && i < value.length - 1; i += 1) bytes.push(0);
  return Uint8Array.from(bytes).reverse();
}

/** Base58 del alfabeto de Bitcoin/Solana. Bytes vacíos → cadena vacía. */
export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && (bytes[zeros] ?? 0) === 0) zeros += 1;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i] ?? 0;
    for (let j = 0; j < digits.length; j += 1) {
      carry += (digits[j] ?? 0) * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET.charAt(digits[i] ?? 0);
  return out;
}

/** Acepta espacios al borde. El resto tiene que decodificar a 32 bytes. */
export function isValidSolanaAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const decoded = decodeBase58(trimmed);
  return decoded !== null && decoded.length === 32;
}

/** Mismo chequeo. Lo usan envío y on-ramp desde T15. */
export function isSolanaAddress(value: string): boolean {
  return isValidSolanaAddress(value);
}

/** Misma clave, aunque el texto traiga espacios. Si alguna no es dirección, false. */
export function addressesEqual(left: string, right: string): boolean {
  const a = decodeBase58(left.trim());
  const b = decodeBase58(right.trim());
  if (!a || !b || a.length !== 32 || b.length !== 32) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
