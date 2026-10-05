export function roundDigits(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
