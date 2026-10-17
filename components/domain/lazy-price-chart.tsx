"use client";

import dynamic from "next/dynamic";

/**
 * M84: `lightweight-charts` (~45 KB gzip) sólo se usa en el detalle y la
 * cartera. `next/dynamic` con `ssr: false` lo deja fuera del JS inicial de
 * la landing y del mercado: se descarga cuando la ruta pinta el gráfico.
 * El propio `price-chart.tsx` además importa la librería con `import()`
 * dinámico al montar, así el archivo del panel tampoco la espera.
 */
export const LazyPriceChart = dynamic(() => import("@/components/domain/price-chart").then((mod) => mod.PriceChart), {
  ssr: false,
});
