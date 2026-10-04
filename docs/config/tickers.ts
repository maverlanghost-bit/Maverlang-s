// Fuente de verdad de mints permitidos. Verificados en Jupiter (tag "xstocks", isVerified) el 2026-10-04.
// TODO [VERIFICAR] contra https://xstocks.fi antes de producción.
import type { Ticker } from "@/lib/types";

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const base = { decimals: 8 as const, issuer: "Backed (xStocks)" as const };

export const TICKERS: Ticker[] = [
  { ...base, symbol: "AAPLx", underlying: "AAPL", name: "Apple", category: "tech", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", logo: "/logos/aapl.svg", enabled: true },
  { ...base, symbol: "NVDAx", underlying: "NVDA", name: "NVIDIA", category: "tech", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", logo: "/logos/nvda.svg", enabled: true },
  { ...base, symbol: "TSLAx", underlying: "TSLA", name: "Tesla", category: "consumer", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", logo: "/logos/tsla.svg", enabled: true },
  { ...base, symbol: "SPYx", underlying: "SPY", name: "S&P 500 ETF", category: "etf", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", logo: "/logos/spy.svg", enabled: true },
  { ...base, symbol: "QQQx", underlying: "QQQ", name: "Nasdaq 100 ETF", category: "etf", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", logo: "/logos/qqq.svg", enabled: true },
  { ...base, symbol: "GOOGLx", underlying: "GOOGL", name: "Alphabet", category: "tech", mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", logo: "/logos/googl.svg", enabled: true },
  { ...base, symbol: "MSFTx", underlying: "MSFT", name: "Microsoft", category: "tech", mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", logo: "/logos/msft.svg", enabled: true },
  { ...base, symbol: "AMZNx", underlying: "AMZN", name: "Amazon", category: "consumer", mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", logo: "/logos/amzn.svg", enabled: true },
  { ...base, symbol: "METAx", underlying: "META", name: "Meta", category: "tech", mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", logo: "/logos/meta.svg", enabled: true },
  { ...base, symbol: "CRCLx", underlying: "CRCL", name: "Circle", category: "fintech", mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", logo: "/logos/crcl.svg", enabled: true },
  { ...base, symbol: "HOODx", underlying: "HOOD", name: "Robinhood", category: "fintech", mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", logo: "/logos/hood.svg", enabled: false },
  { ...base, symbol: "MSTRx", underlying: "MSTR", name: "Strategy", category: "fintech", mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", logo: "/logos/mstr.svg", enabled: false },
];

export const ENABLED_TICKERS = TICKERS.filter((t) => t.enabled);
export const tickerBySymbol = (s: string) => TICKERS.find((t) => t.symbol.toLowerCase() === s.toLowerCase());
export const isOfficialMint = (mint: string) => mint === USDC_MINT || TICKERS.some((t) => t.mint === mint && t.enabled);
