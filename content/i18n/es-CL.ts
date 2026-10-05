/**
 * Textos de la plataforma. El disclaimer es el de DESIGN-SYSTEM §4;
 * el cierre legal queda [REVISIÓN ABOGADO].
 */
export const esCL = {
  nav: {
    label: "Secciones",
    market: "Mercado",
    portfolio: "Cartera",
    wallet: "Billetera",
    profile: "Perfil",
  },
  shell: {
    balance: "Saldo",
    hideBalance: "Ocultar saldo",
    showBalance: "Mostrar saldo",
    balanceHidden: "Saldo oculto",
    balanceUnavailable: "Saldo no disponible",
    account: "Ir a tu perfil",
    skip: "Saltar al contenido",
  },
  disclaimer:
    "Las acciones tokenizadas no otorgan derechos de accionista. Invertir implica riesgos.",
  pages: {
    market: {
      title: "Mercado",
      lead: "Acciones de EE.UU. tokenizadas.",
      emptyTitle: "El listado todavía no está en esta pantalla",
    },
    portfolio: {
      title: "Cartera",
      lead: "El valor de tus acciones.",
      emptyTitle: "Tus posiciones todavía no están en esta pantalla",
    },
    wallet: {
      title: "Billetera",
      lead: "Lo que tienes disponible para comprar.",
      emptyTitle: "Tu billetera todavía no está en esta pantalla",
    },
    profile: {
      title: "Perfil",
      lead: "Tu cuenta y tus preferencias.",
      emptyTitle: "Tus ajustes todavía no están en esta pantalla",
    },
  },
  market: {
    searchLabel: "Buscar acciones",
    searchPlaceholder: "Símbolo, nombre o empresa",
    filtersLabel: "Filtrar",
    sortLabel: "Ordenar",
    all: "Todas",
    tech: "Tecnología",
    etf: "ETFs",
    fintech: "Fintech",
    consumer: "Consumo",
    favorites: "Favoritas",
    popular: "Popular",
    gain: "Mayor alza",
    loss: "Mayor baja",
    az: "A–Z",
    movers: "Más movidas hoy",
    moversNote: "Las de mayor variación hoy.",
    list: "Acciones",
    results: "Resultados",
    emptyFor: "Sin resultados para",
    emptyHint: "Prueba con otro nombre o cambia el filtro.",
    favoriteOn: "Quitar {name} de favoritas",
    favoriteOff: "Marcar {name} como favorita",
    open: "Mercado abierto",
    closed: "Fuera de horario: precio puede variar más",
    loadError: "No pudimos cargar el mercado.",
    statusError: "No pudimos ver el horario del mercado.",
  },
  states: {
    loading: "Cargando",
    retry: "Reintentar",
    error: "Error",
    unavailable: "Esta sección todavía no está disponible.",
  },
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof esCL>;
