# Pendientes legales

Borrador interno. No es asesoría. Lo que sigue lo tiene que revisar un abogado antes de producción.

## Logos y marcas

Los logos de las empresas del catálogo (Apple, NVIDIA, Tesla, Alphabet, Microsoft, Amazon, Meta, Circle, Robinhood, Strategy y los ETF del S&P 500 y del Nasdaq 100) son marcas de sus dueños. En esta interfaz se usan sólo para identificar el activo. No implican relación, patrocinio ni autorización de esas empresas.

Origen de los archivos de xStocks: metadatos públicos de Backed, `https://xstocks-metadata.backed.fi/logos/tokens/<SIMBOLO>.png`. El símbolo lleva la "x" final, como en `config/tickers.ts`. Se descargan una vez con `scripts/descargar-logos.mjs` y quedan en `public/logos/<underlying>.png`. Los de Ondo salen de `https://cdn.ondo.finance/tokens/logos/<simbolo>_160x160.png` (símbolo en minúsculas, por ejemplo `aalon`) y se descargan una vez con `scripts/descargar-logos-ondo.mjs` al mismo directorio, sin pisar un archivo que ya exista. La app no hace hotlinking en tiempo de ejecución.

Si un logo de esa fuente no existe, la segunda opción es copiar sólo el SVG necesario del paquete `simple-icons`, con el color de marca, a `public/logos/<underlying>.svg`. En esta versión no hizo falta: los doce respondieron. Si tampoco hubiera archivo, ese ticker queda sin logo y la interfaz muestra el monograma. No se inventan logos.

[REVISIÓN ABOGADO] El uso de estas marcas debe revisarlo un abogado antes de producción.

## Decisiones de Manu a revisar con el abogado (2026-10-07)

[REVISIÓN ABOGADO] (a) La demo no muestra un aviso permanente de "dinero ficticio": sólo aparecen el selector "Cuenta demo" y la insignia en la barra superior y la cartera. ¿Basta con eso o hay que avisar en cada pantalla que el saldo es ficticio?

[REVISIÓN ABOGADO] (b) Los logos de las empresas están visibles para identificar cada activo. Si el abogado lo pide, se apagan sin tocar código con `NEXT_PUBLIC_COMPANY_LOGOS=off` (quedan los monogramas y la app deja de pedir las imágenes de `public/logos`).

[REVISIÓN ABOGADO] (c) La frase "nosotros no custodiamos tus activos": confirmar que es exacta con la billetera embebida de Privy y qué responsabilidad implica para nosotros.

[REVISIÓN ABOGADO] (d) "Opera 24/7" (fuente: xstocks.fi, "tradeable 24/7") junto a la advertencia de que fuera del horario regular de la bolsa de EE.UU. el precio puede variar más. Confirmar que esa combinación no promete disponibilidad ni precio.

[REVISIÓN ABOGADO] (e) Cambio de copy en Términos a revisar por el abogado: M45 pasó los montos de pesos a US$ en content/legal/terminos.md.

## Estado M83 — guardia de copy, avisos y logos (2026-10-17)

- **Logos: siguen encendidos.** `NEXT_PUBLIC_COMPANY_LOGOS` sigue en `on` por defecto (decisión de Manu). `docs/legal/aprobados/logos.md` todavía no existe; cuando llegue la decisión del abogado: (a) se mantienen → nada que cambiar; (b) se reemplazan → `NEXT_PUBLIC_COMPANY_LOGOS=off` (monogramas, sin borrar archivos).
- **Cubierto por `tests/unit/copy-guard.test.ts`** (escáner en `lib/content/copy-guard.ts`, vigila `content/`, `lib/content/`, `components/` y `app/` en `.ts/.tsx/.md`): "rentabilidad garantizada", "sin riesgo", "ganancia segura", "eres accionista", "serás accionista", "dueño de la acción" (salvo que el párrafo aclare el token), "asesoría financiera" ofrecida como servicio (se permiten negaciones tipo "no es asesoría financiera"), "regulado(s) por la CMF" (salvo negación), "custodiamos tus" sin "no" inmediatamente antes ("nosotros no custodiamos tus activos" vale), "depositas pesos en Maverlang", "pagas con pesos en Maverlang"; en inglés "guaranteed returns", "risk-free" y "you own the share". "24/7" no se bloquea.
- **Avisos en pantalla (borrador, marca `[REVISIÓN ABOGADO]`):** detalle de acción → "Lo emite {issuer}… no te hace accionista" + enlace a Riesgos (ya existía); hoja de operación, antes de confirmar → "El precio puede variar. Operación ejecutada en Solana vía Jupiter. No es asesoría." (nuevo); depósito en pesos → "Compra a Koywe. Tu contrato y tu pago son con Koywe." (nuevo); depósito USDC → aviso de red Solana (M78, ya existía); retiro → "Las transferencias son irreversibles." (M79, ya existía); demo → selector e insignia "Cuenta demo" + "dinero ficticio" en textos (decisión de Manu N-a, sin aviso permanente).
- **Atribución de marcas:** nueva frase "Las marcas pertenecen a sus dueños; se usan solo para identificar el activo." en el pie de todas las páginas de marketing y sección "Marcas" nueva en `/legal/riesgos`. Ambas marcadas `[REVISIÓN ABOGADO]`.
- **Espera visto bueno final del abogado:** los logos de empresas (apartado "Logos y marcas" de arriba), la frase de custodia, "Opera 24/7" con su advertencia de horario, el checkbox de la hoja de operación Real (sólo se exigiría con dinero real: la UI hoy opera sólo demo) y todos los textos marcados `[REVISIÓN ABOGADO]` que introduce M83.
- **Sin frases prohibidas en el código:** la primera corrida del escáner no encontró ninguna frase prohibida real en `content/`, `components/`, `app/` ni `lib/content/` (las 11 detecciones iniciales eran las propias regex del escáner; el archivo se excluye de sí mismo).
