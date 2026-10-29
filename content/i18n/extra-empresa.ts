/**
 * Textos de la ficha de empresa (SEC EDGAR).
 * Misma forma en es-CL y en. No vive en es-CL.ts ni en en.ts.
 * Sin recomendación de inversión: solo qué es cada cifra.
 */

export interface EmpresaFieldCopy {
  label: string;
  about: string;
}

export interface EmpresaCopy {
  title: string;
  sourceLabel: string;
  sourceName: string;
  sourceExternal: string;
  disclaimer: string;
  empty: string;
  what: string;
  tip: string;
  asOf: string;
  fields: {
    sector: EmpresaFieldCopy;
    marketCap: EmpresaFieldCopy;
    pe: EmpresaFieldCopy;
    eps: EmpresaFieldCopy;
    revenue: EmpresaFieldCopy;
    netIncome: EmpresaFieldCopy;
    dividend: EmpresaFieldCopy;
    filing: EmpresaFieldCopy;
  };
  dates: {
    close: string;
    shares: string;
    eps: string;
    filed: string;
    filing10q: string;
    filing10k: string;
    sic: string;
  };
}

export const empresaCopy: { esCL: EmpresaCopy; en: EmpresaCopy } = {
  esCL: {
    title: "Datos de la empresa",
    sourceLabel: "Fuente",
    sourceName: "SEC EDGAR",
    sourceExternal: "sitio externo",
    disclaimer: "Solo informativo, no es una recomendación",
    empty: "Sin dato",
    what: "¿Qué es esto?",
    tip: "Cifras públicas que la empresa informó a la SEC. La capitalización y el P/E usan el último cierre guardado en la app. Si falta un dato, queda vacío.",
    asOf: "al {date}",
    fields: {
      sector: {
        label: "Sector",
        about:
          "Clasificación industrial (SIC) que la empresa informa a la SEC. El nombre queda en inglés, como lo publica el organismo. Describe la actividad. No es una opinión sobre el negocio.",
      },
      marketCap: {
        label: "Capitalización",
        about:
          "Acciones en circulación informadas a la SEC, multiplicadas por el último cierre de la acción subyacente que guarda esta app. Es un cálculo propio con datos públicos. Si falta el cierre o el recuento, o el recuento no es reciente, el dato queda vacío.",
      },
      pe: {
        label: "P/E",
        about:
          "Último cierre de la acción dividido por la utilidad por acción de los últimos doce meses. Si esa utilidad no es positiva, el dato queda vacío. No dice si el precio está alto o bajo.",
      },
      eps: {
        label: "EPS TTM",
        about:
          "Utilidad por acción de los últimos cuatro trimestres. Se usa la serie diluida o la básica, la de período más reciente; si empatan, la diluida. Si el año fiscal no trae un trimestre suelto, ese trimestre es el año menos los otros tres de ese año. Si no se puede armar y el año es anterior al último trimestre, el dato queda vacío.",
      },
      revenue: {
        label: "Ingresos TTM",
        about:
          "Ingresos de los últimos cuatro trimestres en los estados de la SEC. Si hay dos series, se usa la que llega más lejos. Si falta un trimestre dentro del año, se calcula como el año menos los otros tres. Si no se puede armar y el año es anterior al último trimestre, el dato queda vacío. La fecha de abajo es la del informe, no una proyección.",
      },
      netIncome: {
        label: "Utilidad TTM",
        about:
          "Resultado neto de los últimos cuatro trimestres informados. Si falta un trimestre dentro del año, se calcula como el año menos los otros tres. Puede ser negativo. Si no se puede armar y el año es anterior al último trimestre, el dato queda vacío. La fecha de abajo es la del informe.",
      },
      dividend: {
        label: "Dividendo",
        about:
          "Dividendos por acción de los últimos cuatro trimestres, o del último año fiscal si no hay un trimestre posterior. Si falta un trimestre dentro del año, se calcula como el año menos los otros tres. El rendimiento es ese monto dividido por el último cierre. No es una proyección de pagos futuros.",
      },
      filing: {
        label: "Último informe",
        about:
          "Fecha en que la empresa presentó ante la SEC el último informe anual (10-K) o trimestral (10-Q). El enlace de la fuente abre ese documento.",
      },
    },
    dates: {
      close: "cierre {date}",
      shares: "acciones al {date}",
      eps: "EPS al {date}",
      filed: "presentado el {date}",
      filing10q: "10-Q {date}",
      filing10k: "10-K {date}",
      sic: "SIC {code}",
    },
  },
  en: {
    title: "Company data",
    sourceLabel: "Source",
    sourceName: "SEC EDGAR",
    sourceExternal: "external site",
    disclaimer: "For information only, not a recommendation",
    empty: "No data",
    what: "What is this?",
    tip: "Public figures the company filed with the SEC. Market cap and P/E use the latest close stored in the app. If a figure is missing, it stays empty.",
    asOf: "as of {date}",
    fields: {
      sector: {
        label: "Sector",
        about:
          "Industry classification (SIC) the company files with the SEC. The name stays in English, as the agency publishes it. It describes the activity. It is not a view on the business.",
      },
      marketCap: {
        label: "Market cap",
        about:
          "Shares outstanding reported to the SEC, multiplied by the latest close of the underlying stock stored in this app. It is our own calculation from public data. If the close or the share count is missing, or the count is not recent, the figure stays empty.",
      },
      pe: {
        label: "P/E",
        about:
          "Latest stock close divided by earnings per share over the last twelve months. If those earnings are not positive, the figure stays empty. It does not say whether the price is high or low.",
      },
      eps: {
        label: "EPS TTM",
        about:
          "Earnings per share for the last four quarters. Diluted or basic is used, whichever period is more recent; if they end on the same date, diluted is used. If the fiscal year does not report one quarter on its own, that quarter is the year minus the other three quarters of that year. If it cannot be built and the year is older than the latest quarter, the figure stays empty.",
      },
      revenue: {
        label: "Revenue TTM",
        about:
          "Revenue for the last four quarters in SEC filings. If two series exist, the one that reaches further is used. A quarter missing inside the year is the year minus the other three. If it cannot be built and the year is older than the latest quarter, the figure stays empty. The date below is the filing date, not a forecast.",
      },
      netIncome: {
        label: "Net income TTM",
        about:
          "Net income for the last four reported quarters. A quarter missing inside the year is the year minus the other three. It can be negative. If it cannot be built and the year is older than the latest quarter, the figure stays empty. The date below is the filing date.",
      },
      dividend: {
        label: "Dividend",
        about:
          "Dividends per share for the last four quarters, or the latest fiscal year when no later quarter exists. A quarter missing inside the year is the year minus the other three. The yield is that amount divided by the latest close. It is not a forecast of future payments.",
      },
      filing: {
        label: "Latest filing",
        about:
          "Date the company filed its latest annual report (10-K) or quarterly report (10-Q) with the SEC. The source link opens that document.",
      },
    },
    dates: {
      close: "close {date}",
      shares: "shares as of {date}",
      eps: "EPS as of {date}",
      filed: "filed {date}",
      filing10q: "10-Q {date}",
      filing10k: "10-K {date}",
      sic: "SIC {code}",
    },
  },
};
