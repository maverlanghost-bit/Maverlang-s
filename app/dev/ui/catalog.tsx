"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { site } from "@/config/site";
import { formatClp, formatPercent, formatShares, formatUsd, type MoneyCurrency } from "@/lib/format";
import { Accordion } from "@/components/ui/accordion";
import { AmountInput } from "@/components/ui/amount-input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconButton } from "@/components/ui/icon-button";
import { IconCheck, IconCopy, IconClose } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { QRCode } from "@/components/ui/qr-code";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ChangeBadge } from "@/components/domain/change-badge";
import { PriceText } from "@/components/domain/price-text";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TickerRow } from "@/components/domain/ticker-row";

const upSeries = [10, 12, 11, 13, 12, 15, 16, 18];
const downSeries = [18, 17, 16, 17, 14, 13, 12, 11];

const rangeOptions = [
  { value: "1S", label: "1S" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1A", label: "1A" },
  { value: "Todo", label: "Todo" },
];

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex min-w-0 flex-col gap-4">
      <h2 className="text-sm font-medium text-fg">{title}</h2>
      {children}
    </section>
  );
}

function CatalogBody() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<MoneyCurrency>("CLP");
  const [amount, setAmount] = useState("10000");
  const [market, setMarket] = useState("tech");
  const [range, setRange] = useState("1M");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [price, setPrice] = useState(189.42);
  const [alerts, setAlerts] = useState(true);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl min-w-0 flex-col gap-12 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="label">Dev</p>
        <h1 className="font-display text-3xl tracking-tight text-fg sm:text-4xl">Primitivos</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-fg-body">
          Catálogo de {site.name}. Esta ruta sólo existe en desarrollo. Las cifras son de ejemplo y no son precios de mercado.
        </p>
      </header>

      <Section title="Formato es-CL">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border px-4 py-3">
            <dt className="text-sm text-fg-muted">CLP</dt>
            <dd className="num text-fg">{formatClp(12345)}</dd>
          </div>
          <div className="rounded-xl border border-border px-4 py-3">
            <dt className="text-sm text-fg-muted">USD</dt>
            <dd className="num text-fg">{formatUsd(1234.56)}</dd>
          </div>
          <div className="rounded-xl border border-border px-4 py-3">
            <dt className="text-sm text-fg-muted">Porcentaje</dt>
            <dd className="num text-fg">
              {formatPercent(0.0123)} · {formatPercent(-0.008)}
            </dd>
          </div>
          <div className="rounded-xl border border-border px-4 py-3">
            <dt className="text-sm text-fg-muted">Acciones</dt>
            <dd className="num text-fg">{formatShares(0.004213)}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Button">
        <div className="flex flex-wrap gap-2">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Chico</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
          <Button disabled>Deshabilitado</Button>
          <Button loading={loading} onClick={() => setLoading(true)}>
            {loading ? "Enviando" : "Cargar"}
          </Button>
          <Button variant="secondary" onClick={() => setLoading(false)} disabled={!loading}>
            Detener
          </Button>
        </div>
        <Button asChild variant="ghost">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </Section>

      <Section title="IconButton">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Primario" variant="primary">
            <IconCheck />
          </IconButton>
          <IconButton label="Secundario" variant="secondary">
            <IconCopy />
          </IconButton>
          <IconButton label="Ghost" variant="ghost">
            <IconClose />
          </IconButton>
          <IconButton label="Danger" variant="danger">
            <IconClose />
          </IconButton>
          <IconButton label="Chico" size="sm" variant="secondary">
            <IconCopy />
          </IconButton>
          <IconButton label="Grande" size="lg" variant="secondary">
            <IconCopy />
          </IconButton>
        </div>
      </Section>

      <Section title="Card">
        <Card>
          <p className="text-sm leading-relaxed text-fg-body">
            Superficie ivory, borde hairline y radio grande. Sin sombra.
          </p>
        </Card>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="up">Sube</Badge>
          <Badge tone="down">Baja</Badge>
          <Badge tone="warn">Aviso</Badge>
          <Badge tone="brand">Nuevo</Badge>
        </div>
      </Section>

      <Section title="Input">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm font-medium text-fg" htmlFor="correo">
            Correo
            <Input id="correo" type="email" placeholder="tu@correo.cl" autoComplete="email" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-fg" htmlFor="bloqueado">
            Bloqueado
            <Input id="bloqueado" defaultValue="No editable" disabled />
          </label>
        </div>
      </Section>

      <Section title="AmountInput">
        <Card className="p-4 md:p-6">
          <AmountInput
            value={amount}
            onChange={setAmount}
            currency={currency}
            onCurrencyChange={(next) => {
              setCurrency(next);
              setAmount(next === "CLP" ? "10000" : "25");
            }}
            max={currency === "CLP" ? 80000 : 100}
          />
        </Card>
      </Section>

      <Section title="Select">
        <Select
          label="Categoría"
          value={market}
          onValueChange={setMarket}
          options={[
            { value: "tech", label: "Tecnología" },
            { value: "consumer", label: "Consumo" },
            { value: "etf", label: "ETF" },
            { value: "off", label: "No disponible", disabled: true },
          ]}
        />
      </Section>

      <Section title="Tabs">
        <Tabs
          label="Detalle de ejemplo"
          defaultValue="comprar"
          tabs={[
            { value: "comprar", label: "Comprar", content: "Panel de compra. Todavía no opera." },
            { value: "vender", label: "Vender", content: "Panel de venta. Todavía no opera." },
            { value: "detalle", label: "Detalle", content: "Descripción corta del instrumento." },
          ]}
        />
      </Section>

      <Section title="SegmentedControl">
        <SegmentedControl label="Rango" options={rangeOptions} value={range} onChange={setRange} fullWidth />
      </Section>

      <Section title="Switch">
        <div className="rounded-xl border border-border px-4">
          <Switch label="Avisos por correo" checked={alerts} onCheckedChange={setAlerts} />
          <Switch label="Interruptor deshabilitado" defaultChecked disabled />
        </div>
      </Section>

      <Section title="Sheet">
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Abrir panel
        </Button>
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="Panel"
          description="Abajo en el teléfono y a la derecha desde 768px."
        >
          <p className="text-sm leading-relaxed text-fg-body">Cierra con Escape, el botón o el fondo.</p>
          <div className="mt-4">
            <Button onClick={() => setSheetOpen(false)}>Listo</Button>
          </div>
        </Sheet>
      </Section>

      <Section title="Dialog">
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          Abrir diálogo
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title="Confirmar" description="Este diálogo no envía nada.">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialogOpen(false)}>Entendido</Button>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
          </div>
        </Dialog>
      </Section>

      <Section title="Tooltip">
        <div className="pb-16">
          <Tooltip content="Texto de ayuda. El color no es la única pista." defaultOpen>
            <Button variant="secondary" size="sm">
              Con ayuda
            </Button>
          </Tooltip>
        </div>
      </Section>

      <Section title="Skeleton">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-24 w-full rounded-3xl" />
        </div>
      </Section>

      <Section title="Toast">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => toast({ title: "Listo", description: "Aviso de ejemplo.", tone: "up" })}
          >
            Aviso positivo
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: "No se pudo guardar", tone: "down" })}>
            Aviso de error
          </Button>
          <Button variant="ghost" onClick={() => toast({ title: "Revisa el horario", tone: "warn" })}>
            Aviso
          </Button>
        </div>
      </Section>

      <Section title="Accordion">
        <Accordion
          defaultValue={["uno"]}
          items={[
            { id: "uno", title: "¿Qué es este control?", content: "Abre y cierra una sección. En modo simple, una a la vez." },
            { id: "dos", title: "¿Se puede abrir otra?", content: "Sí. La anterior se cierra." },
          ]}
        />
      </Section>

      <Section title="Avatar">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar alt="Ada Lovelace" fallback="Ada Lovelace" size="sm" />
          <Avatar alt="Ada Lovelace" fallback="Ada Lovelace" />
          <Avatar alt="Ada Lovelace" fallback="Ada Lovelace" size="lg" />
          <Avatar alt="Sin foto" src="/logos/no-existe.svg" fallback="Sin foto" />
        </div>
      </Section>

      <Section title="Separator">
        <div className="flex flex-col gap-3">
          <Separator />
          <div className="flex h-8 items-center gap-3 text-sm text-fg">
            <span>Uno</span>
            <Separator orientation="vertical" />
            <span>Dos</span>
          </div>
        </div>
      </Section>

      <Section title="QRCode">
        <QRCode value={site.url} label={`Código QR de ${site.name}`} />
      </Section>

      <Section title="CopyButton">
        <CopyButton value={site.url} label="Copiar enlace" />
      </Section>

      <Section title="EmptyState">
        <EmptyState
          title="Todavía no hay nada aquí"
          description="Cuando haya movimientos, van a aparecer en esta lista."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/">Volver</Link>
            </Button>
          }
        />
      </Section>

      <Section title="ErrorState">
        <ErrorState
          title="No pudimos cargar esto"
          description="Inténtalo de nuevo en unos minutos."
          onRetry={() => toast({ title: "Reintento de ejemplo", tone: "neutral" })}
        />
      </Section>

      <Section title="TickerLogo">
        <div className="flex flex-wrap items-center gap-3">
          <TickerLogo symbol="AAPLx" name="Apple" />
          <TickerLogo symbol="NVDAx" name="NVIDIA" logoUrl="/logos/nvda.svg" />
          <TickerLogo symbol="SPYx" name="S&P 500 ETF" size={48} />
        </div>
      </Section>

      <Section title="PriceText">
        <div className="flex flex-col gap-3">
          <PriceText value={price} currency="USD" size="lg" live />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPrice((current) => Math.round((current + 1) * 100) / 100)}>
              Sumar US$ 1
            </Button>
          </div>
          <p className="num text-fg">
            <PriceText value={12345} currency="CLP" size="sm" />
          </p>
          <div className="flex flex-wrap gap-4">
            <PriceText value={12.5} currency="USD" size="md" colorBySign />
            <PriceText value={-3.25} currency="USD" size="md" colorBySign />
          </div>
        </div>
      </Section>

      <Section title="ChangeBadge">
        <div className="flex flex-wrap gap-2">
          <ChangeBadge value={0.0124} />
          <ChangeBadge value={-0.0086} />
          <ChangeBadge value={0} />
        </div>
      </Section>

      <Section title="Sparkline">
        <div className="flex flex-wrap items-center gap-6">
          <Sparkline data={upSeries} label="Serie de ejemplo al alza" width={120} height={40} />
          <Sparkline data={downSeries} label="Serie de ejemplo a la baja" width={120} height={40} />
        </div>
      </Section>

      <Section id="filas" title="TickerRow">
        <div className="overflow-hidden rounded-xl border border-border">
          <TickerRow
            href="/dev/ui#filas"
            symbol="AAPLx"
            name="Apple"
            price={189.42}
            change={0.0124}
            sparkline={upSeries}
          />
          <TickerRow
            href="/dev/ui#filas"
            symbol="TSLAx"
            name="Tesla"
            logoUrl="/logos/tsla.svg"
            price={248.1}
            change={-0.0086}
            sparkline={downSeries}
          />
        </div>
      </Section>
    </main>
  );
}

export function UiCatalog() {
  return (
    <ToastProvider>
      <CatalogBody />
    </ToastProvider>
  );
}
