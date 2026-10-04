# T02 — Primitivos UI + presentacionales de dominio
Lee: `PROGRESO.md`, `docs/DESIGN-SYSTEM.md` §2–§3.

Haz en `components/ui/`: Button (primary/secondary/ghost/danger, sm/md/lg, `loading`, `asChild` opcional), IconButton, Card, Badge, Input, AmountInput, Select, Tabs, SegmentedControl, Sheet (bottom en móvil, lateral en desktop), Dialog, Tooltip, Skeleton, Toast (provider simple), Switch, Accordion, Avatar, Separator, QRCode, CopyButton, EmptyState, ErrorState. Accesibles (roles/aria, foco, Esc). Puedes usar Radix vía shadcn para Dialog/Sheet/Tabs/Accordion/Tooltip/Switch si acelera — re-tematiza con los tokens.
En `components/domain/` (sólo props, sin fetch): TickerLogo (círculo con iniciales si no hay logo), PriceText (NumberFlow, mono, formatos CLP/USD), ChangeBadge (+/− con flecha y color), Sparkline (SVG, sin librerías), TickerRow.
Crea `lib/format.ts` mínimo (CLP, USD, %, acciones) usando `Intl.NumberFormat("es-CL")`.
Página `/dev/ui` (sólo en dev: `notFound()` si `NODE_ENV==="production"`) que muestra todo.

Listo cuando: `/dev/ui` muestra todos los componentes y variantes, se ve bien a 360px.
Al terminar: PROGRESO.md + commit `T02: primitivos UI`.
