/**
 * Textos de favoritas y avisos de precio. Misma forma en es-CL y en.
 * No van en es-CL.ts / en.ts: esta parte no edita esos archivos.
 */

export const INFO_ONLY_ES = "Solo informativo, no es una recomendación.";
export const INFO_ONLY_EN = "For information only. This is not a recommendation.";

export type AlertasMessages = {
  pageTitle: string;
  pageLead: string;
  sortLabel: string;
  sortChange: string;
  sortName: string;
  emptyTitle: string;
  emptyBody: string;
  emptyAction: string;
  signInTitle: string;
  signInBody: string;
  signInAction: string;
  alertAction: string;
  alertActionLabel: string;
  dialogTitle: string;
  dialogBody: string;
  directionLabel: string;
  above: string;
  below: string;
  priceLabel: string;
  priceHint: string;
  priceMissing: string;
  save: string;
  cancel: string;
  saving: string;
  saved: string;
  delete: string;
  deleting: string;
  deleted: string;
  alertsTitle: string;
  alertsLead: string;
  alertsEmpty: string;
  rowAbove: string;
  rowBelow: string;
  statusActive: string;
  statusTriggered: string;
  cap: string;
  memoryNote: string;
  unavailable: string;
  loadError: string;
  listError: string;
  retry: string;
  noPrice: string;
  noChange: string;
  disclaimer: string;
  loading: string;
  rateLimited: string;
  missing: string;
  viewPage: string;
};

export const alertasCopy: { esCL: AlertasMessages; en: AlertasMessages } = {
  esCL: {
    pageTitle: "Favoritas",
    pageLead: `Precio y cambio del día de las que marcaste. ${INFO_ONLY_ES}`,
    sortLabel: "Orden",
    sortChange: "Cambio del día",
    sortName: "Nombre",
    emptyTitle: "Aún no tienes favoritas",
    emptyBody: "Márcalas con la estrella en el mercado. Aquí verás precio, cambio del día y el gráfico corto cuando haya datos.",
    emptyAction: "Ir al mercado",
    signInTitle: "Ingresa para crear avisos",
    signInBody: "Sin sesión puedes ver las favoritas de este navegador. Los avisos de precio piden una cuenta.",
    signInAction: "Ingresar",
    alertAction: "Aviso",
    alertActionLabel: "Crear aviso de precio para {name}",
    dialogTitle: "Aviso de precio",
    dialogBody: `Avísame si {name} cruza un precio en dólares. El chequeo es una vez al día, con el último cierre o, si no hay cierre, con el precio actual del token. ${INFO_ONLY_ES}`,
    directionLabel: "Condición",
    above: "Sube de",
    below: "Baja de",
    priceLabel: "Precio en US$",
    priceHint: `Precio actual: {price}. ${INFO_ONLY_ES}`,
    priceMissing: "No hay un precio actual para mostrar.",
    save: "Guardar aviso",
    cancel: "Cerrar",
    saving: "Guardando",
    saved: "Aviso guardado",
    delete: "Borrar",
    deleting: "Borrando",
    deleted: "Aviso borrado",
    alertsTitle: "Avisos de precio",
    alertsLead: `Se revisan una vez al día. ${INFO_ONLY_ES}`,
    alertsEmpty: "No tienes avisos.",
    rowAbove: "Avísame si {symbol} sube de {price}",
    rowBelow: "Avísame si {symbol} baja de {price}",
    statusActive: "Activo",
    statusTriggered: "Avisado",
    cap: "Puedes tener hasta 20 avisos activos.",
    memoryNote: "En este modo los avisos quedan en el servidor de prueba y no se envía correo.",
    unavailable: "No pudimos guardar el aviso.",
    loadError: "No pudimos cargar los avisos.",
    listError: "No pudimos cargar las favoritas.",
    retry: "Reintentar",
    noPrice: "Sin precio",
    noChange: "Sin dato del día",
    disclaimer: INFO_ONLY_ES,
    loading: "Cargando",
    rateLimited: "Demasiadas solicitudes. Espera un momento.",
    missing: "Ese aviso ya no está.",
    viewPage: "Ver la ficha",
  },
  en: {
    pageTitle: "Favorites",
    pageLead: `Day price and change for the ones you marked. ${INFO_ONLY_EN}`,
    sortLabel: "Sort",
    sortChange: "Day change",
    sortName: "Name",
    emptyTitle: "No favorites yet",
    emptyBody: "Mark them with the star in the market. Price, day change, and the short chart show up here when there is data.",
    emptyAction: "Go to the market",
    signInTitle: "Sign in to create alerts",
    signInBody: "Without a session you can still see favorites saved in this browser. Price alerts need an account.",
    signInAction: "Sign in",
    alertAction: "Alert",
    alertActionLabel: "Create a price alert for {name}",
    dialogTitle: "Price alert",
    dialogBody: `Tell me if {name} crosses a dollar price. The check runs once a day, using the latest close or, if there is no close, the current token price. ${INFO_ONLY_EN}`,
    directionLabel: "Condition",
    above: "Goes above",
    below: "Goes below",
    priceLabel: "Price in US$",
    priceHint: `Current price: {price}. ${INFO_ONLY_EN}`,
    priceMissing: "There is no current price to show.",
    save: "Save alert",
    cancel: "Close",
    saving: "Saving",
    saved: "Alert saved",
    delete: "Delete",
    deleting: "Deleting",
    deleted: "Alert deleted",
    alertsTitle: "Price alerts",
    alertsLead: `Checked once a day. ${INFO_ONLY_EN}`,
    alertsEmpty: "You have no alerts.",
    rowAbove: "Tell me if {symbol} goes above {price}",
    rowBelow: "Tell me if {symbol} goes below {price}",
    statusActive: "Active",
    statusTriggered: "Sent",
    cap: "You can have up to 20 active alerts.",
    memoryNote: "In this mode alerts stay on the test server and no email is sent.",
    unavailable: "We could not save the alert.",
    loadError: "We could not load the alerts.",
    listError: "We could not load favorites.",
    retry: "Retry",
    noPrice: "No price",
    noChange: "No day-change data",
    disclaimer: INFO_ONLY_EN,
    loading: "Loading",
    rateLimited: "Too many requests. Wait a moment.",
    missing: "That alert is no longer there.",
    viewPage: "View the page",
  },
};

export function alertasText(language: "es-CL" | "en"): AlertasMessages {
  return language === "en" ? alertasCopy.en : alertasCopy.esCL;
}

export function fillAlert(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}
