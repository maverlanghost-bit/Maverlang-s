import type { Metadata } from "next";

import { clearOverride, hideAsset, setFlag } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin/guard";
import {
  ADMIN_AVISO,
  ADMIN_VISIBLE_CAP,
  filterAdminAssets,
  firstQuery,
  formatAdminDate,
  formatReasons,
  overrideLabel,
  statusLabel,
  type AdminAsset,
} from "@/lib/admin/override";
import { listAdminAssets, readFlagMap } from "@/lib/admin/store";
import { site } from "@/config/site";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ADMIN_FLAGS, panelFlags } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

const AVISO_TEXT: Record<string, string> = {
  [ADMIN_AVISO.listo]: "Listo. El cambio quedó guardado.",
  [ADMIN_AVISO.faltaNota]: "La nota es obligatoria.",
  [ADMIN_AVISO.confirma]: "Confirma el cambio del interruptor.",
  [ADMIN_AVISO.noSePudo]: "No se pudo guardar. Inténtalo de nuevo.",
};

function toneOf(status: string): BadgeTone {
  if (status === "listed") return "up";
  if (status === "watch") return "warn";
  if (status === "hidden") return "down";
  return "neutral";
}

function AssetRow({ asset, q }: { asset: AdminAsset; q: string }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-3">
        <p className="font-medium text-fg">{asset.symbol}</p>
        <p className="text-sm text-fg-muted">{asset.name}</p>
        {asset.manualNote ? <p className="mt-1 text-sm text-fg-body">{asset.manualNote}</p> : null}
      </td>
      <td className="px-3 py-3">
        <Badge tone={toneOf(asset.safetyStatus)}>{statusLabel(asset.safetyStatus)}</Badge>
        <p className="mt-1 text-sm text-fg-muted">{overrideLabel(asset.manualOverride)}</p>
      </td>
      <td className="px-3 py-3 text-sm text-fg-body">{formatReasons(asset.reasons)}</td>
      <td className="px-3 py-3 text-sm text-fg-muted">{formatAdminDate(asset.checkedAt)}</td>
      <td className="px-3 py-3">
        <form className="flex min-w-56 flex-col gap-2">
          <input type="hidden" name="symbol" value={asset.symbol} />
          <input type="hidden" name="q" value={q} />
          <Input
            name="note"
            required
            maxLength={500}
            autoComplete="off"
            placeholder="Nota (obligatoria)"
            aria-label={`Nota para ${asset.symbol}`}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" formAction={hideAsset} variant="danger" size="sm">
              Ocultar
            </Button>
            <Button type="submit" formAction={clearOverride} variant="secondary" size="sm">
              Quitar override
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = firstQuery(params.q);
  const aviso = AVISO_TEXT[firstQuery(params.aviso)] ?? null;

  const assetsResult = await listAdminAssets();
  let flagsOk = true;
  let rawFlags: Map<string, unknown> | null = null;
  try {
    rawFlags = await readFlagMap(ADMIN_FLAGS.map((flag) => flag.key));
  } catch {
    flagsOk = false;
    rawFlags = null;
  }
  const flags = panelFlags(flagsOk ? rawFlags : null);
  const filtered = assetsResult.ok ? filterAdminAssets(assetsResult.assets, q) : [];
  const shown = filtered.slice(0, ADMIN_VISIBLE_CAP);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8">
      <div>
        <p className="text-sm text-fg-muted">{site.name}</p>
        <PageHeader
          title="Administración"
          description="Ocultar un activo lo saca del mercado cuando se renueva el catálogo (a lo más 5 minutos) y deja la nota en el historial. Los interruptores quedan guardados; todavía no cambian las compras ni los depósitos."
        />
      </div>

      {aviso ? (
        <p role="status" className="text-sm text-fg">
          {aviso}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg text-fg">Interruptores</h2>
        {flagsOk ? (
          <ul className="flex flex-col gap-4">
            {flags.map((flag) => (
              <li key={flag.key} className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-fg">{flag.label}</p>
                  <Badge tone={flag.on ? "up" : "down"}>{flag.on ? "Encendido" : "Apagado"}</Badge>
                </div>
                <form action={setFlag} className="flex flex-col gap-2 sm:items-end">
                  <input type="hidden" name="key" value={flag.key} />
                  <input type="hidden" name="value" value={flag.on ? "false" : "true"} />
                  <input type="hidden" name="q" value={q} />
                  <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
                    <input type="checkbox" name="confirm" value="si" required />
                    Confirmo el cambio
                  </label>
                  <Button type="submit" size="sm" variant={flag.on ? "danger" : "secondary"}>
                    {flag.on ? "Apagar" : "Encender"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <ErrorState
            title="No se pudieron leer los interruptores"
            description="No se muestran acciones para no guardar un valor a ciegas."
          />
        )}
      </Card>

      <section className="flex flex-col gap-4">
        <form method="get" action="/admin" className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="admin-q">
            Buscar activo
          </label>
          <Input
            id="admin-q"
            name="q"
            defaultValue={q}
            maxLength={64}
            autoComplete="off"
            placeholder="Símbolo o nombre"
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
        <p className="text-sm text-fg-muted">
          Quitar override borra el forzado. El activo sigue oculto hasta la próxima auditoría.
        </p>

        {!assetsResult.ok ? (
          <ErrorState
            title="No se pudo leer el catálogo"
            description="Revisa que las migraciones del catálogo y de admin estén aplicadas."
          />
        ) : shown.length === 0 ? (
          <EmptyState
            title={q ? "Ningún activo coincide" : "No hay activos en el catálogo"}
            description={q ? "Prueba con otro símbolo o nombre." : undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-border bg-surface-1">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Activos del catálogo</caption>
              <thead>
                <tr className="text-sm text-fg-muted">
                  <th scope="col" className="px-3 py-3 font-medium">Activo</th>
                  <th scope="col" className="px-3 py-3 font-medium">Estado</th>
                  <th scope="col" className="px-3 py-3 font-medium">Motivos</th>
                  <th scope="col" className="px-3 py-3 font-medium">Revisado</th>
                  <th scope="col" className="px-3 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((asset) => (
                  <AssetRow key={asset.symbol} asset={asset} q={q} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {assetsResult.ok && filtered.length > shown.length ? (
          <p className="text-sm text-fg-muted">
            Hay {filtered.length} activos. Ajusta la búsqueda para ver el resto.
          </p>
        ) : null}
        {assetsResult.truncated ? (
          <p className="text-sm text-fg-muted">Se cargaron los primeros 1000 símbolos.</p>
        ) : null}
      </section>
    </main>
  );
}
