# Pendientes legales

Borrador interno. No es asesoría. Lo que sigue lo tiene que revisar un abogado antes de producción.

## Logos y marcas

Los logos de las empresas del catálogo (Apple, NVIDIA, Tesla, Alphabet, Microsoft, Amazon, Meta, Circle, Robinhood, Strategy y los ETF del S&P 500 y del Nasdaq 100) son marcas de sus dueños. En esta interfaz se usan sólo para identificar el activo. No implican relación, patrocinio ni autorización de esas empresas.

Origen de los archivos: metadatos públicos de xStocks / Backed, `https://xstocks-metadata.backed.fi/logos/tokens/<SIMBOLO>.png`. El símbolo lleva la "x" final, como en `config/tickers.ts`. Se descargan una vez con `scripts/descargar-logos.mjs` y quedan en `public/logos/<underlying>.png`. La app no hace hotlinking en tiempo de ejecución.

Si un logo de esa fuente no existe, la segunda opción es copiar sólo el SVG necesario del paquete `simple-icons`, con el color de marca, a `public/logos/<underlying>.svg`. En esta versión no hizo falta: los doce respondieron. Si tampoco hubiera archivo, ese ticker queda sin logo y la interfaz muestra el monograma. No se inventan logos.

[REVISIÓN ABOGADO] El uso de estas marcas debe revisarlo un abogado antes de producción.
