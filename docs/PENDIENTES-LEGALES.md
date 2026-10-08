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
