/** Devuelve DATA_MODE y PRICES_MODE al valor de la shell, después de una suite en mock. */
export function restoreModes(saved: {
  DATA_MODE: string | undefined;
  PRICES_MODE: string | undefined;
}): void {
  if (saved.DATA_MODE === undefined) delete process.env.DATA_MODE;
  else process.env.DATA_MODE = saved.DATA_MODE;
  if (saved.PRICES_MODE === undefined) delete process.env.PRICES_MODE;
  else process.env.PRICES_MODE = saved.PRICES_MODE;
}
