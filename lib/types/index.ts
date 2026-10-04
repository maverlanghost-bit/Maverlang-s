/**
 * Stub mínimo para que `config/tickers.ts` compile.
 * El modelo de dominio completo queda para la tarea de tipos.
 */
export type Ticker = {
  decimals: number;
  issuer: string;
  symbol: string;
  underlying: string;
  name: string;
  category: string;
  mint: string;
  logo: string;
  enabled: boolean;
};
