export type FaqPart =
  | { kind: "text"; value: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "marker"; value: "[VERIFICAR]" | "[REVISIÓN ABOGADO]" };

export type FaqEntry = {
  id: string;
  question: string;
  /** Las seis primeras de la landing. /ayuda muestra todas. */
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
            value: `Es un activo digital, en Solana, que busca seguir el precio de una acción o un ETF de Estados Unidos. En ${brand} la compras por fracciones y pagas con pesos. No queda inscrita a tu nombre en una corredora de EE.UU.`,
          },
        ],
      ],
    },
    {
      id: "dueno",
      home: true,
      question: "¿Soy dueño de la acción?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "No. Tienes un token que busca replicar el precio. No te da derecho a voto ni los demás derechos de un accionista.",
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
      question: "¿Cómo deposito pesos?",
      paragraphs: [
        [
          {
            kind: "text",
            value:
              "En la app eliges el monto en pesos y el método que muestre el proveedor, por ejemplo Khipu o transferencia. Antes de confirmar ves el estimado y el costo de ese proveedor.",
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
            value: `La comisión de ${brand} es 0% en el lanzamiento. El spread, la red Solana y el proveedor de depósito no son un número fijo: el monto se muestra antes de confirmar. La red es del orden de centavos de dólar.`,
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
