import { site } from "@/config/site";

/**
 * Contenido de las guías educativas.
 *
 * Las guías con `legalReview: true` no se publican: quedan fuera de los
 * listados, del sitemap y responden 404, salvo que se pida verlas en
 * desarrollo con `MAVERLANG_SHOW_DRAFT_GUIDES=1`. El texto de esas guías
 * tampoco debe llevar marcas de revisión visibles.
 */
export type Guide = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  updatedAt: string;
  legalReview: boolean;
  readingMinutes: number;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
  faq?: { question: string; answer: string }[];
  related?: string[];
  sources?: { label: string; url: string }[];
};

const UPDATED_AT = "2026-11-10";

const XSTOCKS_SOURCE = { label: "xStocks (Backed Finance)", url: "https://xstocks.fi" } as const;

export const GUIDES: readonly Guide[] = [
  {
    slug: "que-es-una-accion-tokenizada",
    title: "Qué es una acción tokenizada y qué no es",
    description:
      "Una acción tokenizada es un token en Solana que sigue el precio de una acción o ETF de EE.UU. Qué tienes, qué no y de dónde sale su precio.",
    h1: "Qué es una acción tokenizada",
    updatedAt: UPDATED_AT,
    legalReview: false,
    readingMinutes: 4,
    sections: [
      {
        heading: "Un token que sigue a una acción de EE.UU.",
        paragraphs: [
          "Una acción tokenizada es un token SPL, el estándar de tokens de Solana, que busca seguir el precio de una acción o de un ETF que se transa en la bolsa de Estados Unidos. En el catálogo, cada token se emite 1:1 contra el subyacente: por cada token en circulación hay una acción o una participación equivalente en la estructura del emisor.",
          "Eso no significa que el token sea la acción. Es un instrumento distinto, con su propio emisor y sus propias reglas, que toma el precio de la acción como referencia.",
        ],
      },
      {
        heading: "Fracciones, en dólares",
        paragraphs: [
          "Puedes comprar una fracción del activo, no la acción completa. El mínimo por orden es US$10 y el precio se muestra en dólares (US$). La cantidad que aparece en tu cartera ya viene expresada en acciones equivalentes: la app hace la conversión y no te muestra unidades crudas del token.",
          "El precio de referencia sale del mercado de la acción en EE.UU. Cuando esa bolsa está cerrada, el token se sigue transando, pero con menos liquidez y con un precio que puede alejarse más del último precio de la acción.",
        ],
      },
      {
        heading: "Qué tienes cuando el token llega a tu billetera",
        paragraphs: [
          "Tienes el token en una billetera de Solana asociada a tu cuenta. Maverlang no custodia tus tokens: no los guarda en una billetera propia ni los mueve sin que firmes.",
          "Lo que tienes es el token, no una inscripción a tu nombre en una corredora de EE.UU. La acción subyacente está en la estructura del emisor, no en una cuenta tuya.",
        ],
      },
      {
        heading: "Qué no incluye",
        paragraphs: [
          "Tener el token no te convierte en accionista registrado de la empresa. No votas en juntas, no recibes convocatorias y no ejerces los derechos que tendría alguien con el papel en una corredora.",
        ],
        bullets: [
          "No hay derecho a voto ni a participar en juntas de accionistas.",
          "No hay una inscripción de la acción a tu nombre.",
          "El tratamiento de los dividendos del token no está cerrado y no lo afirmamos en ningún sentido.",
          "El emisor puede congelar o restringir el token; si eso pasa, podrías no poder moverlo ni venderlo.",
        ],
      },
      {
        heading: "Quién emite el token",
        paragraphs: [
          "Los tokens del catálogo los emite Backed Finance (xStocks) y, en algunos casos, Ondo. Maverlang no los emite: es la interfaz para comprarlos y tenerlos en tu billetera.",
          "El emisor es una pieza central. Mantiene la estructura que respalda el token, publica la información del subyacente y tiene facultades para restringir el activo. Su nombre y sus condiciones se pueden contrastar en xstocks.fi.",
        ],
      },
      {
        heading: "Cómo se compra en Maverlang",
        paragraphs: [
          "El flujo es simple: depositas USDC por la red Solana, eliges la acción, revisas el desglose y confirmas. Antes de aceptar ves el precio en dólares, la comisión de la plataforma (0% en el lanzamiento), el costo de red y la diferencia de precio.",
          "El token queda en tu billetera. Para vender, el valor vuelve a USDC en esa misma billetera. Pasar ese USDC a pesos depende del proveedor, y sus costos se muestran en ese paso.",
          "Mientras el producto esté en demo, las órdenes no mueven dinero real: practicas con un saldo ficticio y precios reales.",
        ],
      },
    ],
    faq: [
      {
        question: "¿Una acción tokenizada es lo mismo que una acción?",
        answer:
          "No. Es un token distinto, con su propio emisor y sus propias reglas, que sigue el precio de la acción como referencia. No te inscribe como accionista ni te da derecho a voto.",
      },
      {
        question: "¿Puedo comprar una fracción?",
        answer:
          "Sí. El mínimo por orden es US$10 y el precio se muestra en dólares. La cantidad en tu cartera aparece en acciones equivalentes, no en unidades crudas del token.",
      },
      {
        question: "¿El token paga dividendos?",
        answer:
          "No lo afirmamos. El tratamiento de los dividendos del token no está cerrado: no des por hecho que un dividendo llegue como dinero a tu cuenta ni que se sume al precio.",
      },
      {
        question: "¿Dónde veo quién emite el token?",
        answer:
          "En la ficha de cada activo y en xstocks.fi. Los tokens del catálogo los emite Backed Finance (xStocks) y, en algunos casos, Ondo.",
      },
    ],
    related: [
      "como-comprar-usdc-desde-chile",
      "autocustodia-y-billetera-solana",
      "operar-24-7-horarios-y-liquidez",
    ],
    sources: [XSTOCKS_SOURCE],
  },
  {
    slug: "como-comprar-usdc-desde-chile",
    title: "Cómo comprar USDC desde Chile y depositarlo",
    description:
      "USDC es un token en dólares. Los pasos para comprarlo en Chile, enviarlo por la red Solana y depositarlo en tu billetera sin equivocarte de red.",
    h1: "Cómo comprar USDC desde Chile",
    updatedAt: UPDATED_AT,
    legalReview: false,
    readingMinutes: 4,
    sections: [
      {
        heading: "Qué es USDC y para qué se usa acá",
        paragraphs: [
          "USDC es un token que busca mantener el valor de un dólar estadounidense. En Maverlang se usa como moneda de entrada y de salida: depositas USDC, compras fracciones de acciones y, al vender, el valor vuelve a USDC en tu billetera.",
          "No es una moneda chilena ni un saldo bancario. Es un activo digital que vive en una red, y para que llegue a tu billetera tiene que viajar por la red correcta.",
        ],
      },
      {
        heading: "Paso 1: una cuenta que venda USDC",
        paragraphs: [
          "Necesitas una plataforma que venda USDC y permita retirarlo a una dirección de Solana. Puede ser un exchange internacional, una fintech local o un servicio de compra con pesos; no recomendamos ninguno en particular.",
          "Al abrir la cuenta te van a pedir identidad y datos personales. Antes de comprar, compara tres cosas: el costo total, el tipo de cambio que aplican y si el retiro por Solana está disponible para tu cuenta.",
        ],
      },
      {
        heading: "Paso 2: compra USDC y revisa el costo",
        paragraphs: [
          "Compra el monto que vas a usar. El precio que ves puede incluir más de un concepto además del valor del USDC; el detalle aparece antes de confirmar.",
          "Guarda el comprobante de la compra. Te sirve para tu registro personal y, si más adelante vendes, para reconstruir el costo de adquisición.",
        ],
      },
      {
        heading: "Paso 3: elige la red Solana",
        paragraphs: [
          "Al retirar, la plataforma te pide una dirección y una red. Elige Solana (SPL). Si eliges otra red, como Ethereum o BNB Chain, el USDC no llega a esta billetera y puede perderse.",
          "USDC existe en varias redes con el mismo nombre y la misma sigla. La red es la que decide por dónde viaja: la dirección sola no basta.",
        ],
      },
      {
        heading: "Paso 4: verifica la dirección y prueba con poco",
        paragraphs: [
          "Copia la dirección desde tu billetera de Maverlang o escanea el código QR. Revisa los primeros y los últimos caracteres, y que la red diga Solana.",
          "La primera vez, envía un monto pequeño y confirma que llegó antes de mandar el resto. Una transacción en Solana no se puede deshacer: si la dirección está mal, no hay botón de reversa.",
        ],
      },
      {
        heading: "Paso 5: deposita en tu cuenta",
        paragraphs: [
          "El depósito con USDC pide que el correo de tu cuenta esté verificado. Después vinculas tu billetera firmando un mensaje: no es una transacción y no tiene costo.",
          "Con la billetera vinculada ves tu dirección de depósito. Envía sólo USDC por la red Solana; otros activos pueden perderse. La comisión de depósito es 0% y el saldo se acredita en tu billetera.",
          "En la demo no se muestra una dirección de depósito ni se mueve dinero real. No envíes fondos reales a una dirección de la demo: los pasos de esta guía son los del flujo con dinero real, para cuando esté habilitado.",
        ],
      },
      {
        heading: "Errores comunes",
        paragraphs: [
          "Si el envío no llega, revisa la red y el hash de la transacción en un explorador de Solana. Con esos datos puedes escribir al soporte, aunque una transacción mal dirigida no siempre se puede recuperar.",
        ],
        bullets: [
          "Elegir una red distinta de Solana.",
          "Copiar la dirección incompleta o la de otra persona.",
          "Enviar un token que no sea USDC.",
          "No verificar el correo antes de depositar.",
          "Mandar todo el monto la primera vez, sin una prueba pequeña.",
          "Confiar en un supuesto soporte que te pide la clave o un código de verificación: nadie legítimo lo hace.",
        ],
      },
    ],
    faq: [
      {
        question: "¿Puedo depositar con pesos?",
        answer:
          "Hoy el depósito habilitado es con USDC por la red Solana. Si más adelante se habilita el depósito en pesos, el costo y el mínimo se muestran en ese paso.",
      },
      {
        question: "¿Cuánto demora en llegar el USDC?",
        answer:
          "Depende de la red y del servicio desde el que envías. Una transacción en Solana suele confirmarse en segundos, pero la plataforma de origen puede demorar más en procesar el retiro. No prometemos un plazo.",
      },
      {
        question: "¿Qué pasa si envío por otra red?",
        answer:
          "El USDC no llega a tu billetera de Solana y puede perderse. Revisa la red antes de confirmar: no hay reversa.",
      },
      {
        question: "¿Hay un monto mínimo?",
        answer:
          "El mínimo por orden de compra es US$10. El servicio desde el que compras USDC puede tener su propio mínimo, y lo verás antes de pagar.",
      },
    ],
    related: [
      "que-es-una-accion-tokenizada",
      "autocustodia-y-billetera-solana",
      "operar-24-7-horarios-y-liquidez",
    ],
  },
  {
    slug: "operar-24-7-horarios-y-liquidez",
    title: "Operar 24/7: horarios y liquidez",
    description:
      "Qué significa operar 24/7 con acciones tokenizadas, cuándo abre la bolsa de EE.UU. y por qué el precio puede moverse más fuera de ese horario.",
    h1: "Operar 24/7: horarios y liquidez",
    updatedAt: UPDATED_AT,
    legalReview: false,
    readingMinutes: 4,
    sections: [
      {
        heading: "Qué significa 24/7",
        paragraphs: [
          "En Maverlang puedes operar a cualquier hora, todos los días. La compra y la venta se ejecutan on-chain, en Solana, y esa red no cierra: no hay campana de apertura ni de cierre.",
          "24/7 no significa que el precio esté siempre igual de firme. Significa que puedes enviar una orden; cómo se ejecuta depende de la liquidez y del momento.",
        ],
      },
      {
        heading: "El horario de la bolsa de EE.UU.",
        paragraphs: [
          "La acción de referencia se transa en la bolsa de EE.UU. de 9:30 a 16:00, hora de Nueva York, de lunes a viernes. La equivalencia en hora de Chile cambia con el horario de verano de cada país, así que conviene mirar la hora de Nueva York.",
          "Cuando la bolsa está cerrada, el token sigue disponible, pero el precio de referencia queda más quieto y el mercado del token tiene menos participantes.",
        ],
      },
      {
        heading: "Por qué el precio puede alejarse fuera de horario",
        paragraphs: [
          "En horario de bolsa hay muchos compradores y vendedores, y el precio del token se pega al de la acción. Fuera de horario hay menos órdenes: la diferencia entre el precio que ves y el que consigues puede ser mayor.",
          "Eso se nota más en montos grandes, en acciones poco transadas y en fines de semana o feriados. No es un error de la app: es cómo se comporta un mercado con menos liquidez.",
        ],
      },
      {
        heading: "Liquidez: qué mirar antes de operar",
        paragraphs: [
          "Antes de confirmar, revisa el desglose: precio, comisión, costo de red y diferencia de precio. Si el monto es grande respecto del mercado del token, la orden puede mover el precio.",
        ],
        bullets: [
          "Parte con montos pequeños mientras conoces el comportamiento del activo.",
          "Revisa el desglose completo antes de aceptar: no hay precio fijo hasta que la orden se ejecuta.",
          "Si el precio se mueve mucho entre que miras y confirmas, la orden puede no ejecutarse; conviene revisar de nuevo.",
        ],
      },
      {
        heading: "No todos los lugares operan igual",
        paragraphs: [
          "En el mercado on-chain, los tokens se pueden negociar las 24 horas. En plataformas centralizadas la disponibilidad depende del proveedor: hay lugares donde sólo una parte de los xStocks opera 24/7 y el resto opera 24/5, de lunes a viernes.",
          "Por eso, si comparas horarios entre sitios, fíjate en la letra chica de cada uno. En Maverlang la operación es 24/7.",
        ],
      },
      {
        heading: "Feriados, fines de semana y noticias",
        paragraphs: [
          "La bolsa de EE.UU. cierra los fines de semana y en los feriados de ese país. Si una empresa publica resultados o hay una noticia grande con la bolsa cerrada, el precio del token puede reaccionar antes que el de la acción.",
          "Eso no es una señal para comprar ni para vender: es una razón para mirar el desglose y operar con calma.",
        ],
      },
      {
        heading: "Cómo se ve en la práctica",
        paragraphs: [
          "Eliges la acción, escribes el monto, ves el precio en dólares y el desglose, y confirmas. La orden se registra en Solana y el token queda en tu billetera.",
          "Si algo falla —red congestionada, saldo insuficiente, precio fuera de rango— la app te lo dice antes o después de intentar. Una transacción fallida puede cobrar el costo de red.",
        ],
      },
    ],
    faq: [
      {
        question: "¿Puedo operar un domingo?",
        answer:
          "Sí. La plataforma opera 24/7 y la red Solana no cierra. Eso sí, la bolsa de EE.UU. está cerrada y el precio puede moverse más por menor liquidez.",
      },
      {
        question: "¿Por qué el precio no es igual al de otros sitios?",
        answer:
          "Porque el token tiene su propio mercado y su propia liquidez. Fuera del horario de la bolsa, el precio puede separarse del que muestran otros sitios.",
      },
      {
        question: "¿Hay un horario en que sea más conveniente?",
        answer:
          "No hacemos esa afirmación. El costo de red y la diferencia de precio cambian según el momento y la liquidez; lo que puedes hacer es revisar el desglose antes de confirmar.",
      },
    ],
    related: [
      "que-es-una-accion-tokenizada",
      "como-comprar-usdc-desde-chile",
      "autocustodia-y-billetera-solana",
    ],
    sources: [XSTOCKS_SOURCE],
  },
  {
    slug: "autocustodia-y-billetera-solana",
    title: "Autocustodia y billetera en Solana",
    description:
      "Qué significa que el token quede en tu billetera, quién controla los activos en Solana y qué hacer para no perder el acceso a tu cuenta.",
    h1: "Autocustodia y billetera en Solana",
    updatedAt: UPDATED_AT,
    legalReview: false,
    readingMinutes: 3,
    sections: [
      {
        heading: "Qué es la autocustodia",
        paragraphs: [
          "Autocustodia significa que el token queda en una billetera que controlas tú, no en una billetera de la plataforma. Maverlang no custodia tus tokens: no los guarda en una cuenta propia ni los mueve sin una firma tuya.",
          "La contrapartida es simple: si nadie más los custodia, nadie más puede recuperarlos por ti. La responsabilidad del acceso también es tuya.",
        ],
      },
      {
        heading: "Cómo funciona la billetera en Solana",
        paragraphs: [
          "Una billetera de Solana es una cuenta con una dirección pública y una clave que autoriza los movimientos. La dirección se puede compartir; la clave, nunca.",
          "En Maverlang la billetera se crea junto con tu cuenta. Entras con tu correo y tu contraseña, y la app usa esa sesión para firmar. Hoy el modo de exportar la clave sigue en revisión: no prometemos que puedas sacarla a otra billetera.",
        ],
      },
      {
        heading: "Quién controla los activos",
        paragraphs: [
          "Quien controla la cuenta controla los activos. Eso incluye tu correo, tu contraseña y cualquier sesión abierta en un equipo ajeno.",
        ],
        bullets: [
          "Usa una contraseña única y larga, que no reutilices en otros sitios.",
          "Protege el correo de la cuenta: es la vía de recuperación.",
          "Cierra sesión en computadores compartidos.",
          "No compartas códigos de verificación con nadie, ni con quien diga ser del soporte.",
        ],
      },
      {
        heading: "Qué pasa si pierdes el acceso",
        paragraphs: [
          "Si olvidas la contraseña, puedes recuperarla desde el correo de la cuenta. Si pierdes el acceso al correo y a la cuenta, la recuperación se complica y puede no ser posible.",
          "Una transacción enviada a la dirección equivocada no se puede deshacer. Tampoco se puede recuperar un token enviado por otra red.",
        ],
      },
      {
        heading: "Buenas prácticas al enviar",
        paragraphs: [
          "Antes de enviar, revisa la dirección completa, la red y el activo. Si es la primera vez que mandas a esa dirección, prueba con un monto pequeño.",
          "Guarda tus comprobantes y el historial de movimientos. Te sirven para revisar tu cartera y, si corresponde, para tu registro tributario.",
        ],
      },
      {
        heading: "Autocustodia no es invulnerable",
        paragraphs: [
          "Tener el token en tu billetera no elimina los riesgos: el precio puede bajar, el emisor puede restringir el token y una caída de la red puede demorar una operación.",
          "La autocustodia protege de que un tercero disponga de tus activos; no protege de tus propios errores ni del mercado.",
        ],
      },
    ],
    faq: [
      {
        question: "¿Maverlang puede mover mis tokens?",
        answer:
          "No. No custodiamos tus tokens y no los movemos sin una firma tuya.",
      },
      {
        question: "¿Puedo exportar mi clave?",
        answer:
          "Hoy el modo de exportar la clave sigue en revisión. No prometemos que esté disponible; si cambia, se anunciará en la app.",
      },
      {
        question: "¿Qué pasa si cambio de teléfono?",
        answer:
          "La billetera está asociada a tu cuenta, no al teléfono. Al entrar de nuevo con tu correo, tus activos siguen ahí. Si perdiste el acceso a la cuenta, revisa la recuperación de contraseña.",
      },
      {
        question: "¿Es más seguro que un exchange?",
        answer:
          "No lo planteamos como una comparación. La autocustodia cambia quién tiene el control: tú, con la responsabilidad que eso implica.",
      },
    ],
    related: [
      "que-es-una-accion-tokenizada",
      "como-comprar-usdc-desde-chile",
      "operar-24-7-horarios-y-liquidez",
    ],
  },
  {
    slug: "impuestos-sii-acciones-tokenizadas",
    title: "Impuestos y SII: acciones tokenizadas",
    description:
      "Qué ha dicho el SII sobre criptoactivos en Chile, qué pasa con las acciones tokenizadas y por qué conviene revisar tu caso con un contador.",
    h1: "Impuestos y SII: qué se sabe y qué no",
    updatedAt: UPDATED_AT,
    legalReview: true,
    readingMinutes: 4,
    sections: [
      {
        heading: "Esto es información, no asesoría",
        paragraphs: [
          "Esta guía resume documentos públicos del Servicio de Impuestos Internos (SII) y los ordena para que sepas qué preguntar. No es asesoría tributaria ni legal, y no reemplaza la revisión de un contador.",
          "Tu situación depende de tu actividad, de tu régimen tributario y de cómo se clasifique cada operación. Por eso conviene revisar el caso concreto con un profesional.",
        ],
      },
      {
        heading: "Qué dijo el SII sobre criptoactivos",
        paragraphs: [
          "El Oficio N° 963, del 14 de mayo de 2018, se refiere a las rentas por la compra y venta de criptomonedas y activos digitales. Para las empresas, las ubica en el artículo 20 N°5 de la Ley sobre Impuesto a la Renta, con Impuesto de Primera Categoría y, según el caso, Impuesto Global Complementario o Adicional.",
          "El mismo oficio señala que la venta de estos activos no está afecta a IVA, porque se trata de bienes incorporales.",
        ],
      },
      {
        heading: "Personas naturales sin empresa",
        paragraphs: [
          "Las preguntas frecuentes del SII sobre criptomonedas (referencias 001_250_7872 y 001_250_7873) tratan el caso de personas naturales sin empresa individual. Ahí el mayor valor se ubica en el artículo 17 N°8 letra m) de la Ley sobre Impuesto a la Renta.",
          "Según esos textos, tributa sólo con Impuesto Global Complementario o Adicional, en base percibida. El costo tributario corresponde al valor de adquisición reajustado por IPC, desde el mes anterior a la compra hasta el mes anterior a la venta.",
        ],
      },
      {
        heading: "Dónde quedan las acciones tokenizadas",
        paragraphs: [
          "No hay un pronunciamiento del SII, entre los documentos que revisamos, que trate específicamente las acciones tokenizadas. No afirmamos que tributen de una u otra forma: la clasificación puede depender de la naturaleza del token, de quién lo emite y de la operación concreta.",
          "Tampoco hay que dar por hecho que el tratamiento de un criptoactivo se aplica igual a un token que sigue el precio de una acción. Esa es, justamente, la pregunta que conviene llevar a un contador.",
        ],
      },
      {
        heading: "Qué registros guardar",
        paragraphs: [
          "Para cualquier revisión necesitas poder reconstruir cada operación. Guarda el respaldo de cada compra y de cada venta, con fecha, monto, precio y costo.",
        ],
        bullets: [
          "Fecha y hora de la compra y de la venta.",
          "Monto en dólares y en pesos, con el tipo de cambio usado.",
          "Precio de la acción o del token en cada operación.",
          "Comisiones y costos de red.",
          "Comprobantes de depósito y de retiro.",
          "El hash de la transacción, si está disponible.",
        ],
      },
      {
        heading: "Preguntas para tu contador",
        paragraphs: [
          "Lleva tus registros y las fuentes de esta guía. Un contador puede decirte cómo tratar tu caso; esta página no.",
        ],
        bullets: [
          "¿Cómo se clasifica un token que sigue el precio de una acción de EE.UU.?",
          "¿Qué documentos necesita para calcular el mayor valor?",
          "¿Cómo se aplica el reajuste por IPC en una operación hecha en dólares?",
          "¿Qué declaración corresponde y en qué plazo?",
          "¿Cambia algo si el token se mantiene en una billetera propia?",
          "¿Qué pasa si el emisor restringe el token o la operación no se puede completar?",
        ],
      },
    ],
    faq: [
      {
        question: "¿Pagaré impuestos si vendo con ganancia?",
        answer:
          "No lo podemos afirmar para tu caso. Los documentos del SII describen un tratamiento para criptoactivos, pero no encontramos un pronunciamiento específico sobre acciones tokenizadas. Revisa tu situación con un contador.",
      },
      {
        question: "¿La compra de acciones tokenizadas paga IVA?",
        answer:
          "El oficio del SII señala que la venta de criptoactivos no está afecta a IVA por ser bienes incorporales. No extendemos esa conclusión a las acciones tokenizadas sin un respaldo específico.",
      },
      {
        question: "¿Sirve una captura de pantalla como respaldo?",
        answer:
          "Sirve como apoyo, pero conviene guardar el comprobante de la operación y el hash de la transacción. Una captura sola puede no alcanzar para reconstruir el costo.",
      },
      {
        question: "¿Qué pasa si no declaro?",
        answer:
          "Esta guía no evalúa incumplimientos ni sanciones. Si tienes dudas sobre tu declaración, habla con un contador antes del plazo.",
      },
    ],
    related: [
      "que-es-una-accion-tokenizada",
      "autocustodia-y-billetera-solana",
      "operar-24-7-horarios-y-liquidez",
    ],
    sources: [
      {
        label: "SII · Oficio N° 963 de 2018",
        url: "https://www.sii.cl/normativa_legislacion/jurisprudencia_administrativa/ley_impuesto_renta/2018/ja963.htm",
      },
      {
        label: "SII · Preguntas frecuentes sobre criptomonedas (001_250_7872)",
        url: "https://www.sii.cl/preguntas_frecuentes/criptomonedas/001_250_7872.htm",
      },
      {
        label: "SII · Preguntas frecuentes sobre criptomonedas (001_250_7873)",
        url: "https://www.sii.cl/preguntas_frecuentes/criptomonedas/001_250_7873.htm",
      },
    ],
  },
  {
    slug: "riesgos-y-derechos-que-no-tienes",
    title: "Riesgos y derechos que no tienes",
    description:
      "Los riesgos de comprar acciones tokenizadas: emisor, liquidez, tecnología, autocustodia y regulación en Chile. Qué derechos no incluye el token.",
    h1: "Riesgos y derechos que no tienes",
    updatedAt: UPDATED_AT,
    legalReview: true,
    readingMinutes: 3,
    sections: [
      {
        heading: "Puedes perder lo que pusiste",
        paragraphs: [
          `El precio de la acción puede bajar y el del token con ella. Puedes perder parte o todo el monto que destinaste. Nada en ${site.name} promete un resultado ni asegura que recuperes el capital.`,
        ],
      },
      {
        heading: "No tienes los derechos del accionista",
        paragraphs: [
          "El token no te convierte en accionista registrado. No votas en juntas, no recibes convocatorias y no puedes ejercer los derechos que tendría alguien con la acción en una corredora de EE.UU.",
          "Tampoco hay una inscripción de la acción a tu nombre: lo que tienes es el token, con el emisor como contraparte de la estructura.",
        ],
      },
      {
        heading: "Riesgo del emisor",
        paragraphs: [
          "Los tokens del catálogo los emite Backed Finance (xStocks) y, en algunos casos, Ondo. El emisor mantiene la estructura que respalda el token y tiene facultades para congelarlo o restringirlo.",
          "Si el emisor congela el token o cambia sus condiciones, podrías no poder moverlo ni venderlo. Antes de operar, revisa quién emite el activo y sus condiciones en xstocks.fi.",
        ],
      },
      {
        heading: "Liquidez y horario",
        paragraphs: [
          "Fuera del horario de la bolsa de EE.UU. hay menos órdenes y el precio puede alejarse más del de la acción. En fines de semana y feriados el efecto puede ser mayor.",
          "Un monto grande puede mover el precio del token más de lo que esperas. La diferencia de precio se muestra antes de confirmar, pero no queda fija hasta que la orden se ejecuta.",
        ],
      },
      {
        heading: "Riesgo tecnológico",
        paragraphs: [
          "La compra y la venta se registran en Solana. Una transacción puede fallar, demorarse o tener un costo de red. La primera vez que compras un activo se crea la cuenta del token, y ese costo aparece en el desglose.",
          "La operación pasa por programas y contratos desplegados en la red, y un error en ellos puede afectar cómo se ejecuta. La app también depende de infraestructura propia y de terceros: billetera, proveedor de precios, red y emisor. Una falla en cualquiera de esas piezas puede impedir una operación.",
        ],
      },
      {
        heading: "Pérdida de la clave y errores propios",
        paragraphs: [
          "En autocustodia, quien controla la cuenta controla los activos. Si pierdes el acceso a tu correo y a tu cuenta, la recuperación puede no ser posible.",
          "Un envío a la dirección equivocada o por otra red no se puede deshacer. El phishing y el falso soporte son riesgos reales: nadie legítimo te va a pedir tu contraseña ni un código de verificación.",
        ],
      },
      {
        heading: "Regulación en Chile",
        paragraphs: [
          "En Chile, la Ley Fintec 21.521 regula los servicios financieros tecnológicos y establece el rol de la Comisión para el Mercado Financiero (CMF). El tratamiento de los activos tokenizados sigue en discusión y este sitio no declara una autorización ni una inscripción ante la CMF.",
          "La información de esta guía no es asesoría de inversión, tributaria ni legal. Si vas a operar con dinero real, revisa los documentos legales y consulta a un profesional.",
        ],
      },
    ],
    faq: [
      {
        question: "¿Puedo perder todo?",
        answer:
          "Sí. El precio puede caer y no hay nada que garantice recuperar el capital. Esta página no evalúa si el monto es adecuado para ti.",
      },
      {
        question: "¿Qué derechos me da el token?",
        answer:
          "El token es tuyo y está en tu billetera, pero no te da voto, convocatorias ni los derechos del accionista registrado. Sigue el precio de la acción como referencia.",
      },
      {
        question: "¿Quién responde si el emisor congela el token?",
        answer:
          "El emisor es quien tiene esa facultad. Maverlang no emite el token ni puede liberar una restricción del emisor. Revisa las condiciones del emisor antes de operar.",
      },
      {
        question: "¿Está regulado en Chile?",
        answer:
          "La Ley Fintec 21.521 y la CMF son el marco de los servicios financieros tecnológicos, pero este sitio no declara autorización ni inscripción. El tratamiento específico de los activos tokenizados sigue en revisión.",
      },
    ],
    related: [
      "que-es-una-accion-tokenizada",
      "autocustodia-y-billetera-solana",
      "operar-24-7-horarios-y-liquidez",
    ],
    sources: [XSTOCKS_SOURCE],
  },
];

/** Las guías en revisión legal sólo se ven en desarrollo con la variable en "1". */
export function showDraftGuides(): boolean {
  return (
    process.env.MAVERLANG_SHOW_DRAFT_GUIDES === "1" && process.env.NODE_ENV !== "production"
  );
}

/** Guías publicables: las visibles para cualquier visitante. */
export function visibleGuides(): Guide[] {
  return GUIDES.filter((guide) => !guide.legalReview || showDraftGuides());
}

/** Guía por slug, sólo si es visible. */
export function guideBySlug(slug: string): Guide | null {
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  return visibleGuides().find((guide) => guide.slug === key) ?? null;
}
