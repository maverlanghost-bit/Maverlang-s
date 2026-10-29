/**
 * Textos del asistente (parte B). No van en es-CL.ts ni en en.ts.
 * El servidor usa español de Chile. La página puede leer el par en.
 */

export interface AiCopy {
  notConfigured: string;
  badRequest: string;
  tooLarge: string;
  badOrigin: string;
  rateLimited: string;
  upstream: string;
  timeout: string;
  signIn: string;
  noWallet: string;
  unavailable: string;
  realEmpty: string;
  notFound: string;
  emptyAnswer: string;
  dataLine: string;
  disclaimer: string;
}

export const aiMessages: { esCL: AiCopy; en: AiCopy } = {
  esCL: {
    notConfigured: "El asistente aún no está configurado",
    badRequest: "El mensaje no es válido.",
    tooLarge: "La imagen es demasiado grande.",
    badOrigin: "El origen de la solicitud no está permitido.",
    rateLimited: "Demasiadas consultas. Espera un momento.",
    upstream: "El asistente no pudo responder. Inténtalo otra vez.",
    timeout: "El asistente tardó demasiado. Inténtalo otra vez.",
    signIn: "Ingresa para ver tu cartera.",
    noWallet: "No encontramos una billetera en tu sesión.",
    unavailable: "No pude leer la cartera ahora.",
    realEmpty: "La cuenta real todavía no muestra movimientos.",
    notFound: "No encontré esa acción en el catálogo.",
    emptyAnswer: "No tengo una respuesta ahora.",
    dataLine: "Estos son los datos.",
    disclaimer: "No es recomendación de inversión.",
  },
  en: {
    notConfigured: "The assistant is not configured yet",
    badRequest: "That message is not valid.",
    tooLarge: "The image is too large.",
    badOrigin: "The request origin is not allowed.",
    rateLimited: "Too many questions. Wait a moment.",
    upstream: "The assistant could not answer. Try again.",
    timeout: "The assistant took too long. Try again.",
    signIn: "Sign in to see your portfolio.",
    noWallet: "We could not find a wallet in your session.",
    unavailable: "I could not read the portfolio just now.",
    realEmpty: "The real account does not show movements yet.",
    notFound: "I could not find that stock in the catalog.",
    emptyAnswer: "I do not have an answer right now.",
    dataLine: "Here are the figures.",
    disclaimer: "Not an investment recommendation.",
  },
};
