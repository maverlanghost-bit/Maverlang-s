import { describe, expect, it } from "vitest";

import {
  CRYPTO_ASSETS,
  cryptoByMint,
  cryptoBySymbol,
  cryptoGroupOf,
  isCryptoMint,
  isCryptoSymbol,
  maxOrderUsdFor,
} from "@/lib/catalog/crypto";
import {
  EARN_ASSETS,
  LST_ASSETS,
  isEarnSymbol,
  isLstMint,
  isLstSymbol,
  lstByMint,
  lstBySymbol,
} from "@/lib/catalog/lst";

/**
 * Allowlist cerrada de §1.9: los 29 mints exactos. Si un token cambia de mint,
 * se cambia acá y en `lib/catalog/crypto.ts` en el mismo commit.
 */
const MINTS: Record<string, string> = {
  BTC: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
  SOL: "So11111111111111111111111111111111111111112",
  XRP: "6UpQcMAb5xMzxc7ZfPaVMgx3KqsvKZdT5U718BzD5We2",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  USDS: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",
  USDe: "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT",
  USD1: "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
  PYUSD: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
  USDG: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
  XAUt0: "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P",
  USDY: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6",
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  BNB: "9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa",
  TRX: "GbbesPbaYh5uiAZSYNXTc7w9jty1rpg3P9L4JeN4LkKc",
  ZEC: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
  HYPE: "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
  DOGE: "DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R",
  LINK: "LinkhB3afbBKb2EQQu7s7umdZceV3wcvAUJhQAfQ23L",
  NEAR: "3ZLekZYq2qkZiSpnSvabjit34tUkjSwD5JFuW9as9wBG",
  UNI: "uniHfuPhEQSrtpzXpJZDCSq53yaejKKpNhFUiKoHKHV",
  LTC: "cbLTC4T5NpzSUtQ7ekgEMZGaUPVJY1ko6BUikqa4gGf",
  AVAX: "avaxGHCq3T7hoxd73oY2KY9hJSTaeMibXvHy5KNzh5D",
  SUI: "suifhC9gU1VbJAPYPTBkHJyyyStKGLLYPVDTmPoqbvA",
  TAO: "taoC6xyv2v8tDLcev4uaGUgV4vdQsWJrGft2kcBRrBY",
  PEPE: "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m",
  ENA: "72QvBVwpxqmheEPfaCwWSWqEFsUy3rhWt6JhQBMNTwD1",
  AAVE: "AavE1kKKnesPw4MuRJmJ9jZs9QzEE8CPxQ3ViczUDfc1",
  PAXG: "5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW",
  ONDO: "ondohH8Vssxiqcy5u6Efi4AYN17KZrzQtv2a91dnrgW",
};

/** Sellos VERDE de §1.9: tope US$1.000. */
const VERDE = [
  "BTC",
  "SOL",
  "XRP",
  "USDT",
  "USDS",
  "USDe",
  "USD1",
  "PYUSD",
  "USDG",
  "XAUt0",
  "USDY",
];

/** Sellos AMARILLO de §1.9 con su tope por token, más estricto que US$1.000. */
const TOPES_AMARILLO: Record<string, number> = {
  ETH: 500,
  BNB: 1000,
  TRX: 500,
  ZEC: 500,
  HYPE: 500,
  DOGE: 500,
  LINK: 100,
  NEAR: 500,
  UNI: 100,
  LTC: 500,
  AVAX: 100,
  SUI: 500,
  TAO: 500,
  PEPE: 500,
  ENA: 100,
  AAVE: 100,
  PAXG: 500,
  ONDO: 500,
};

/** Decimales medidos con Price v3 el 10 nov 2026. NEAR va aparte (sin precio esa noche). */
const DECIMALES: Record<string, number> = {
  BTC: 8,
  SOL: 9,
  XRP: 6,
  USDT: 6,
  USDS: 6,
  USDe: 9,
  USD1: 6,
  PYUSD: 6,
  USDG: 6,
  XAUt0: 6,
  USDY: 6,
  ETH: 8,
  BNB: 8,
  TRX: 6,
  ZEC: 8,
  HYPE: 9,
  DOGE: 8,
  LINK: 9,
  UNI: 8,
  LTC: 8,
  AVAX: 9,
  SUI: 8,
  TAO: 9,
  PEPE: 4,
  ENA: 9,
  AAVE: 8,
  PAXG: 6,
  ONDO: 8,
};

/** Decisión de Manu (10 nov 2026): dólares y oro van en grupos aparte. */
const DOLARES = ["USDT", "USDS", "USDe", "USD1", "PYUSD", "USDG", "USDY"];
const ORO = ["XAUt0", "PAXG"];

/** Los ROJO del CSV (ADA, XMR, etc.) quedan fuera de la demo. */
const ROJOS = ["ADA", "XMR", "SHIB", "DAI", "QNT", "XLM", "BCH"];

const WBTC_PORTAL_MINT = "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh";

const LST_SIMBOLOS = ["JitoSOL", "JupSOL", "mSOL", "INF", "dSOL", "bSOL", "USDY"];

const LST_MINTS: Record<string, string> = {
  JitoSOL: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  JupSOL: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
  mSOL: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  INF: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",
  dSOL: "Dso1bDeDjCQxTrWHqUUi63oBvV7Mdm6WaobLbQ7gnPQ",
  bSOL: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
  USDY: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6",
};

describe("catálogo de cripto (§1.9)", () => {
  it("tiene exactamente los 29 tokens, sin símbolos ni mints repetidos", () => {
    expect(CRYPTO_ASSETS).toHaveLength(29);
    expect(new Set(CRYPTO_ASSETS.map((asset) => asset.symbol)).size).toBe(29);
    expect(new Set(CRYPTO_ASSETS.map((asset) => asset.mint)).size).toBe(29);
    expect(CRYPTO_ASSETS.every((asset) => asset.mint.trim() !== "")).toBe(true);
    expect(CRYPTO_ASSETS.every((asset) => asset.name.trim() !== "")).toBe(true);
    expect(CRYPTO_ASSETS.every((asset) => asset.originLabel.trim() !== "")).toBe(true);
  });

  it("cada símbolo resuelve su mint exacto y también al revés", () => {
    for (const [symbol, mint] of Object.entries(MINTS)) {
      expect(cryptoBySymbol.get(symbol)?.mint, symbol).toBe(mint);
      expect(cryptoByMint.get(mint)?.symbol, mint).toBe(symbol);
      expect(isCryptoSymbol(symbol), symbol).toBe(true);
      expect(isCryptoMint(mint), mint).toBe(true);
    }
    expect(cryptoBySymbol.get("BTC")?.name).toBe("Bitcoin");
  });

  it("WBTC y los ROJO no existen en el catálogo", () => {
    expect(isCryptoSymbol("WBTC")).toBe(false);
    expect(cryptoBySymbol.get("WBTC") ?? null).toBeNull();
    expect(cryptoByMint.get(WBTC_PORTAL_MINT) ?? null).toBeNull();
    expect(isCryptoMint(WBTC_PORTAL_MINT)).toBe(false);
    for (const rojo of ROJOS) {
      expect(isCryptoSymbol(rojo), rojo).toBe(false);
      expect(cryptoBySymbol.get(rojo) ?? null, rojo).toBeNull();
    }
  });

  it("los VERDE topan en US$1.000 y los AMARILLO en el tope de su fila", () => {
    expect(VERDE).toHaveLength(11);
    expect(Object.keys(TOPES_AMARILLO)).toHaveLength(18);
    for (const symbol of VERDE) {
      expect(maxOrderUsdFor(symbol), symbol).toBe(1000);
      expect(cryptoBySymbol.get(symbol)?.maxOrderUsd, symbol).toBe(1000);
      expect(cryptoBySymbol.get(symbol)?.seal, symbol).toBe("VERDE");
    }
    for (const [symbol, tope] of Object.entries(TOPES_AMARILLO)) {
      expect(maxOrderUsdFor(symbol), symbol).toBe(tope);
      expect(cryptoBySymbol.get(symbol)?.maxOrderUsd, symbol).toBe(tope);
      expect(cryptoBySymbol.get(symbol)?.seal, symbol).toBe("AMARILLO");
    }
  });

  it("respeta los decimales de §1.9 y no inventa los de NEAR", () => {
    for (const [symbol, decimals] of Object.entries(DECIMALES)) {
      expect(cryptoBySymbol.get(symbol)?.decimals, symbol).toBe(decimals);
    }
    expect(cryptoBySymbol.get("PEPE")?.decimals).toBe(4);
    const near = cryptoBySymbol.get("NEAR");
    expect(near ?? null).not.toBeNull();
    const nearDecimals = near?.decimals ?? null;
    expect(nearDecimals === null || (typeof nearDecimals === "number" && nearDecimals > 0)).toBe(true);
  });

  it("separa dólares, oro y el resto según la decisión de Manu", () => {
    for (const symbol of DOLARES) expect(cryptoGroupOf(symbol), symbol).toBe("dollar");
    for (const symbol of ORO) expect(cryptoGroupOf(symbol), symbol).toBe("gold");
    expect(cryptoGroupOf("SOL")).toBe("crypto");
    expect(cryptoGroupOf("LINK")).toBe("crypto");
    expect(CRYPTO_ASSETS.filter((asset) => asset.group === "dollar")).toHaveLength(7);
    expect(CRYPTO_ASSETS.filter((asset) => asset.group === "gold")).toHaveLength(2);
    expect(CRYPTO_ASSETS.filter((asset) => asset.group === "crypto")).toHaveLength(20);
  });
});

describe("catálogo de Ganar: LST y USDY (§1.10)", () => {
  it("lista los 6 LST más USDY con sus mints exactos", () => {
    expect(new Set(LST_ASSETS.map((asset) => asset.symbol))).toEqual(
      new Set(LST_SIMBOLOS.filter((symbol) => symbol !== "USDY")),
    );
    expect(new Set(EARN_ASSETS.map((asset) => asset.symbol))).toEqual(new Set(LST_SIMBOLOS));
    for (const [symbol, mint] of Object.entries(LST_MINTS)) {
      expect(lstBySymbol.get(symbol)?.mint, symbol).toBe(mint);
      expect(lstByMint.get(mint)?.symbol, mint).toBe(symbol);
      // USDY es un dólar de 6 decimales (§1.9); los 6 LST usan 9.
      expect(lstBySymbol.get(symbol)?.decimals, symbol).toBe(symbol === "USDY" ? 6 : 9);
    }
    // `isLstSymbol`/`isLstMint` son de los LST; USDY entra por `isEarnSymbol`.
    for (const symbol of LST_SIMBOLOS.filter((entry) => entry !== "USDY")) {
      expect(isLstSymbol(symbol), symbol).toBe(true);
      expect(isLstMint(LST_MINTS[symbol]), symbol).toBe(true);
    }
  });

  it("dSOL usa el mint oficial de Drift y no el que termina en 7DkC", () => {
    const dsol = lstBySymbol.get("dSOL");
    expect(dsol?.mint).toBe("Dso1bDeDjCQxTrWHqUUi63oBvV7Mdm6WaobLbQ7gnPQ");
    expect(dsol?.mint.endsWith("7DkC")).toBe(false);
  });

  it("declara la fuente de APY que corresponde a cada LST", () => {
    expect(lstBySymbol.get("JitoSOL")?.apySource).toBe("jito");
    expect(lstBySymbol.get("mSOL")?.apySource).toBe("marinade7d");
    expect(lstBySymbol.get("bSOL")?.apySource).toBe("blaze");
    for (const symbol of ["JupSOL", "INF", "dSOL"]) {
      expect(lstBySymbol.get(symbol)?.apySource, symbol).toBe("none");
    }
  });

  it("USDY es la opción de dólares de Ganar y bloquea a personas de EE.UU.", () => {
    const usdy = lstBySymbol.get("USDY");
    expect(usdy?.yieldUnit).toBe("USD");
    expect(usdy?.usPersonBlocked).toBe(true);
    expect(usdy?.apySource).toBe("none");
    expect(isEarnSymbol("USDY")).toBe(true);
    expect(isEarnSymbol("JitoSOL")).toBe(true);
    expect(isEarnSymbol("SOL")).toBe(false);
  });
});
