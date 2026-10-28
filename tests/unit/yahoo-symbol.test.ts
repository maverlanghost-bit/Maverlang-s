import { describe, expect, it } from "vitest";

import { fetchUnderlyingChanges, yahooSymbol } from "@/lib/market/underlying-move";
import { YAHOO_MARKETS, toYahooSymbol } from "@/lib/market/yahoo-symbol";

describe("símbolo de Yahoo", () => {
  it("cubre los MIC pedidos", () => {
    for (const mic of [
      "XETR",
      "XFRA",
      "XAMS",
      "XPAR",
      "XBRU",
      "XLIS",
      "XMAD",
      "XMIL",
      "XHEL",
      "XSTO",
      "XCSE",
      "XOSL",
      "XSWX",
      "XLON",
      "XDUB",
      "XWBO",
      "XHKG",
      "XTKS",
    ]) {
      expect(YAHOO_MARKETS[mic]?.suffix.startsWith(".")).toBe(true);
    }
    expect(YAHOO_MARKETS.XHKG?.pad).toBe(4);
    expect(YAHOO_MARKETS.XTKS?.pad).toBe(4);
  });

  it("traduce los ejemplos del catálogo y deja la clave sin MIC", () => {
    expect(toYahooSymbol("ADSD", "XETR")).toBe("ADS.DE");
    expect(toYahooSymbol("VOW3D", "XETR")).toBe("VOW3.DE");
    expect(toYahooSymbol("BEID", "xetr")).toBe("BEI.DE");
    expect(toYahooSymbol("ABNA", "XAMS")).toBe("ABN.AS");
    expect(toYahooSymbol("ADYENA", "XAMS")).toBe("ADYEN.AS");
    expect(toYahooSymbol("NNA", "XAMS")).toBe("NN.AS");
    expect(toYahooSymbol("ENP", "XPAR")).toBe("EN.PA");
    expect(toYahooSymbol("TEFE", "XMAD")).toBe("TEF.MC");
    expect(toYahooSymbol("625", "XHKG")).toBe("0625.HK");
    expect(toYahooSymbol("3988", "XHKG")).toBe("3988.HK");
    expect(toYahooSymbol("0700", "XHKG")).toBe("0700.HK");
    expect(toYahooSymbol("SPMM", "XMIL")).toBe("SPM.MI");
    expect(toYahooSymbol("NOK1VH", "XHEL")).toBe("NOK1V.HE");
    expect(toYahooSymbol("INBB", "XBRU")).toBe("INB.BR");
    expect(toYahooSymbol("ALTRU", "XLIS")).toBe("ALTR.LS");
    expect(toYahooSymbol("VOLBS", "XSTO")).toBe("VOLB.ST");
    expect(toYahooSymbol("DANSKC", "XCSE")).toBe("DANSK.CO");
    expect(toYahooSymbol("NHYO", "XOSL")).toBe("NHY.OL");
    expect(toYahooSymbol("ACINZ", "XSWX")).toBe("ACIN.SW");
    expect(toYahooSymbol("BWYL", "XLON")).toBe("BWY.L");
    expect(toYahooSymbol("QQL", "XLON")).toBe("QQ.L");
    expect(toYahooSymbol("GNCI", "XDUB")).toBe("GNC.IR");
    expect(toYahooSymbol("VIGV", "XWBO")).toBe("VIG.VI");
    expect(toYahooSymbol("SAPF", "XFRA")).toBe("SAP.F");
    expect(toYahooSymbol("7203", "XTKS")).toBe("7203.T");
    expect(toYahooSymbol("998", "XTKS")).toBe("0998.T");
    expect(toYahooSymbol("BT.AL", "XLON")).toBe("BT-A.L");

    expect(toYahooSymbol("ADSD")).toBe("ADSD");
    expect(toYahooSymbol("625")).toBe("625");
    expect(toYahooSymbol("brk.b")).toBe("BRK-B");
    expect(toYahooSymbol("AAPL", null)).toBe("AAPL");
    expect(toYahooSymbol("AMD", "XNAS")).toBe("AMD");
    expect(toYahooSymbol("AMD", "XNYS")).toBe("AMD");
  });

  it("no quita una letra que no es la de ese MIC, ni deja el ticker vacío", () => {
    expect(toYahooSymbol("ADSD", "XAMS")).toBe("ADSD.AS");
    expect(toYahooSymbol("ADS", "XETR")).toBe("ADS.DE");
    expect(toYahooSymbol("D", "XETR")).toBe("D.DE");
    expect(toYahooSymbol("  vow3d ", "XETR")).toBe("VOW3.DE");
    expect(toYahooSymbol("")).toBe("");
    expect(toYahooSymbol("   ", "XETR")).toBe("");
  });

  it("yahooSymbol delega y la variación pide el símbolo mapeado sin cambiar la clave", async () => {
    expect(yahooSymbol("brk.b")).toBe("BRK-B");
    expect(yahooSymbol("ADSD", "XETR")).toBe(toYahooSymbol("ADSD", "XETR"));

    let seen = "";
    const fetchImpl = (async (input: RequestInfo | URL) => {
      seen = String(input);
      return new Response(
        JSON.stringify({ chart: { result: [{ meta: { regularMarketChangePercent: 1 } }] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const out = await fetchUnderlyingChanges([{ underlying: "ADSD", exchangeMic: "XETR" }], {
      fetchImpl,
      cache: new Map(),
      now: () => 1,
      timeoutMs: 50,
    });
    expect(seen).toContain("/ADS.DE?");
    expect(out.get("ADSD")).toBeCloseTo(0.01, 6);
    expect(out.has("ADS.DE")).toBe(false);
  });
});
