export type FaqPart =
  | { kind: "text"; value: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "marker"; value: "[VERIFICAR]" | "[REVISIÓN ABOGADO]" };

export type FaqEntry = {
  id: string;
  question: string;
  /** `home` se muestra en la landing. /ayuda muestra todas. */
  home: boolean;
  paragraphs: FaqPart[][];
};

export function getFaq(brand: string): FaqEntry[] {
  return [
    {
      id: "que-es",
      home: true,
      question: "¿Qué es una acción tokenizada?",
      paragraphs: [
        [
          {
            kind: "text",
            value: `Es un token en Solana que sigue el precio de una acción o un ETF de Estados Unidos. En ${brand} lo compras por fracciones en dólares (US$) y queda en tu billetera. No queda inscrito a tu nombre en una corredora de EE.UU.`,
          },
        ],
      ],
    },
    {
      id: "demo",
      home: false,
      question: "¿Qué es la demo?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "Es una práctica con US$10.000 ficticios y precios reales. No se cobra dinero real.",
          },
        ],
        [
          { kind: "link", href: "/como-funciona", label: "Ver cómo funciona" },
        ],
      ],
    },
    {
      id: "registro",
      home: false,
      question: "¿Cómo me registro?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "Entras a /app/registro y creas tu cuenta demo con correo y contraseña. Aceptas los documentos y te enviamos un enlace para confirmar el correo.",
          },
        ],
        [
          { kind: "link", href: "/app/registro", label: "Ir al registro" },
        ],
      ],
    },
    {
      id: "contrasena",
      home: false,
      question: "¿Qué hago si olvido mi contraseña?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "Entras a /app/recuperar, escribes tu correo y te enviamos un enlace. Lo abres para elegir una nueva; si no llega, revisa el correo no deseado.",
          },
        ],
        [
          { kind: "link", href: "/app/recuperar", label: "Recuperar contraseña" },
        ],
      ],
    },
    {
      id: "comprar-vender",
      home: false,
      question: "¿Cómo compro y vendo?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "En /app eliges la acción, pulsas Comprar o Vender y revisas el desglose antes de confirmar. Al vender, el valor queda en USDC en tu billetera.",
          },
        ],
        [{ kind: "link", href: "/app", label: "Ver el mercado" }],
      ],
    },
    {
      id: "cartera",
      home: false,
      question: "¿Dónde veo mi cartera?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "En /app/cartera ves tus posiciones y el disponible. En /app/billetera ves el saldo en USDC.",
          },
        ],
        [
          { kind: "link", href: "/app/cartera", label: "Ver mi cartera" },
        ],
      ],
    },
    {
      id: "horario",
      home: true,
      question: "¿En qué horario puedo operar?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "Se opera 24/7. Fuera del horario regular de la bolsa de EE.UU. el precio puede variar más.",
          },
        ],
      ],
    },
    {
      id: "dueno",
      home: true,
      question: "¿El token es mío?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "Sí. El token es tuyo y está en tu billetera. Tenerlo no te convierte en accionista registrado de la empresa ni te da derecho a voto. El token sigue el precio de la acción.",
          },
        ],
        [
          { kind: "link", href: "/legal/riesgos", label: "Leer los riesgos" },
        ],
      ],
    },
    {
      id: "deposito",
      home: true,
      question: "¿Cómo es el depósito?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "La demo no pide dinero real: practicas con US$10.000 ficticios. Cuando haya cuentas reales, el monto, el método y el costo del proveedor se ven en ese paso, antes de confirmar.",
          },
        ],
      ],
    },
    {
      id: "costo",
      home: true,
      question: "¿Cuánto cuesta?",
      paragraphs: [
        [
          {
            kind: "text",
            value: `La comisión de ${brand} es 0% en el lanzamiento. La diferencia de precio, la red Solana y el proveedor de depósito no son un número fijo: el monto se muestra antes de confirmar. La red es del orden de centavos de dólar.`,
          },
        ],
        [
          { kind: "link", href: "/legal/comisiones", label: "Ver comisiones" },
        ],
      ],
    },
    {
      id: "retirar",
      home: true,
      question: "¿Puedo retirar?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "Puedes vender la acción tokenizada. El valor queda en USDC en tu billetera y puedes enviarlo a otra dirección de Solana. Si el proveedor permite pasar ese USDC a pesos en una cuenta chilena, el costo y el plazo se ven en ese paso. Este borrador no promete un plazo de retiro.",
          },
        ],
      ],
    },
    {
      id: "dividendos",
      home: true,
      question: "¿Qué pasa si la empresa paga dividendos?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "No está cerrado. Hay que verificar cómo xStocks refleja un dividendo. No afirmamos que llegue como dinero a tu cuenta ni que se sume al precio del token. ",
          },
          { kind: "marker", value: "[VERIFICAR]" },
        ],
      ],
    },
    {
      id: "autocustodia",
      home: false,
      question: "¿Qué es la autocustodia?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "El token queda en tu propia billetera y nosotros no lo custodiamos. Quien controle la cuenta controla los activos: no compartas tu acceso.",
          },
        ],
        [
          { kind: "link", href: "/seguridad", label: "Ver seguridad" },
        ],
      ],
    },
    {
      id: "emisor",
      home: false,
      question: "¿Quién emite los tokens?",
      paragraphs: [
        [
          {
            kind: "text",
            value: `Los del catálogo los emite Backed (xStocks). ${brand} no los emite: es la interfaz para comprarlos y tenerlos en tu billetera. El emisor puede restringir el activo. El nombre hay que contrastarlo de nuevo con xstocks.fi antes de producción. `,
          },
          { kind: "marker", value: "[VERIFICAR]" },
        ],
      ],
    },
    {
      id: "regulado",
      home: false,
      question: "¿Está regulado en Chile?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "Este sitio no declara una autorización ni una inscripción ante la Comisión para el Mercado Financiero u otra autoridad. El tratamiento legal en Chile está en revisión. ",
          },
          { kind: "marker", value: "[REVISIÓN ABOGADO]" },
          {
            kind: "text",
            value: " Tampoco es asesoría de inversión.",
          },
        ],
        [
          { kind: "link", href: "/legal/riesgos", label: "Leer los riesgos" },
        ],
      ],
    },
  ];
}
