import { ImageResponse } from "next/og";

import { site, siteOrigin } from "@/config/site";
import { resolvePublicAsset } from "@/lib/seo/public-catalog";
import { formatSharePct, parseSharePct } from "@/lib/share-card";

/** Depende del `id` y de `?pct=`: se arma en cada solicitud y se cachea una hora. */
export const dynamic = "force-dynamic";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

/** Dominio visible en el pie, sin protocolo ni barra final. */
const SHARE_HOST = siteOrigin().replace(/^https?:\/\//, "").replace(/\/+$/, "");

/** Baja el tamaño del nombre para que los más largos quepan en dos líneas. */
function cardNameSize(name: string): number {
  if (name.length > 32) return 52;
  if (name.length > 24) return 60;
  if (name.length > 16) return 70;
  return 82;
}

function ShareCard({
  name,
  ticker,
  symbol,
  pct,
  host,
}: {
  name: string;
  ticker: string;
  symbol: string;
  pct: number | null;
  host: string;
}) {
  const pctLine = pct === null ? null : `${formatSharePct(pct)} en mi cartera`;
  const pctTone = pct !== null && pct < 0 ? "#cf2d56" : "#1f8a65";
  const footer = `Información, no recomendación · ${host}`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#ffffff",
        color: "#0a0a0a",
        padding: "72px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: "#ff6a08",
              marginRight: 16,
            }}
          />
          <div style={{ display: "flex", fontSize: 32 }}>{site.name}</div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRadius: 999,
            border: "1px solid #ebebeb",
            background: "#f8f7f5",
            padding: "10px 24px",
            fontSize: 26,
            color: "#252525",
          }}
        >
          {symbol}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", maxWidth: 1000 }}>
        <div
          style={{
            display: "flex",
            fontSize: cardNameSize(name),
            lineHeight: 1.05,
            letterSpacing: -1.5,
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: "#7d8188" }}>{ticker}</div>
        {pctLine === null ? null : (
          <div style={{ display: "flex", marginTop: 26, fontSize: 46, color: pctTone }}>{pctLine}</div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid #ebebeb",
          paddingTop: 24,
        }}
      >
        <div style={{ display: "flex", fontSize: 24, color: "#7d8188" }}>{footer}</div>
        <div style={{ display: "flex", fontSize: 24, color: "#a3a7ad" }}>Acciones de EE.UU. tokenizadas</div>
      </div>
    </div>
  );
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let asset: Awaited<ReturnType<typeof resolvePublicAsset>> = null;
  try {
    asset = await resolvePublicAsset(id);
  } catch {
    asset = null;
  }
  if (!asset) {
    return new Response("No encontrado", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const pct = parseSharePct(new URL(request.url).searchParams.get("pct"));

  return new ImageResponse(
    <ShareCard name={asset.name} ticker={asset.ticker} symbol={asset.symbol} pct={pct} host={SHARE_HOST} />,
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
