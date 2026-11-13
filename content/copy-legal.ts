/**
 * Textos legales de «Copiar carteras» (C1/C2/C3).
 *
 * BORRADOR COMPLETO: cada constante lleva su marca `// PENDIENTE DE ABOGADO` y
 * la UI muestra `COPY_LEGAL_PENDING_LABEL` junto a ellas. Ningún texto promete
 * rentabilidad, recomienda comprar o vender ni sugiere una cartera mejor que
 * otra: describen información pública reconstruida y el mecanismo de la
 * suscripción. Hablan de «tecnología de Fraccion.si», no dan asesoría y
 * recuerdan que cada orden la confirma y firma la persona.
 *
 * Este módulo no tiene lógica ni I/O: se puede importar desde componentes
 * cliente sin arrastrar código de servidor. Los textos no se envuelven en JSX.
 */

// PENDIENTE DE ABOGADO — aviso largo de la ficha y del carrito (base §6.3 del plan conjunto).
export const COPY_DISCLAIMER =
  "Esta función muestra carteras y movimientos reconstruidos por Fraccion.si a partir de fuentes públicas, con el atraso propio de cada declaración (por ejemplo, hasta 45 días en un 13F). No es la cartera en tiempo real de la persona o el fondo, no incluye todos los activos y no es una recomendación ni una orden. En Maverlang, en esta versión, cada compra la confirmas y la firmas tú. Rentabilidades pasadas no garantizan resultados futuros. Tecnología de Fraccion.si.";

// PENDIENTE DE ABOGADO — frase fija junto al botón de copiar (§1.14 del encargo).
export const COPY_CTA_NOTE = "Copias lo último que se declaró, no la cartera de hoy.";

// PENDIENTE DE ABOGADO — botón de dinero real deshabilitado (§1.1 del encargo).
export const COPY_REAL_DISABLED =
  "Copiar con dinero real estará disponible después de una revisión legal.";

// PENDIENTE DE ABOGADO — página de planes con el cobro apagado (§1.1 del encargo).
export const COPY_BILLING_SOON = "Suscripción disponible pronto.";

// PENDIENTE DE ABOGADO — franja de fixtures y de datos de ejemplo (§1.9 del encargo).
export const COPY_EXAMPLE_DATA = "Datos de ejemplo, no reales.";

// PENDIENTE DE ABOGADO — etiqueta discreta que acompaña a los textos en borrador.
export const COPY_LEGAL_PENDING_LABEL = "Texto en revisión legal";

// PENDIENTE DE ABOGADO — borrador de los términos de la suscripción. No fija precios:
// remite a la página de planes para no quedar desactualizado si Manu los cambia.
export const COPY_TERMS_DRAFT = [
  "Estos términos describen la suscripción a «Copiar carteras» de Maverlang Stocks, que entrega acceso a información de carteras reconstruida por Fraccion.si. No es asesoría de inversión, no es gestión de carteras y no promete rentabilidad.",
  "Qué incluye. Acceso a la composición y a los movimientos publicados por Fraccion.si para las carteras del catálogo, a la cobertura de cada cartera en Maverlang y a la herramienta para armar una mezcla de compra. Cada orden la revisa, la confirma y la firma la persona: Maverlang no ejecuta órdenes por su cuenta ni administra tu dinero, y tampoco custodia tus activos.",
  "Prueba gratis. La primera suscripción incluye 7 días de prueba sin costo, una sola vez por usuario. Si no cancelas antes del final de la prueba, se cobra el plan elegido y se renueva solo hasta que lo canceles.",
  "Precio y renovación. El precio vigente es el que aparece en la página de planes al momento de contratar. La suscripción se renueva automáticamente por el mismo período; el cobro se hace con el medio de pago que registres en el proveedor de pagos y Maverlang no guarda los datos de tu tarjeta.",
  "Cancelación. Puedes cancelar en un clic desde la página de planes en cualquier momento. Al cancelar, mantienes el acceso hasta el final del período que ya pagaste y después de esa fecha el acceso se cierra; no se devuelven períodos completos salvo que la ley lo exija.",
  "Pago pendiente. Si el cobro de la renovación falla, tienes 3 días de gracia para regularizarlo. En esos días puedes revisar la información, pero no iniciar nuevas mezclas de compra.",
  "Datos y atraso. Las carteras vienen de declaraciones públicas y llegan con el atraso propio de cada fuente. La información muestra siempre la fecha del dato y su atraso. Copias lo último que se declaró, no la cartera de hoy: la posición puede haber cambiado después de la declaración.",
  "Límites del servicio. La información puede estar incompleta (por ejemplo, un 13F no muestra cortos ni caja) y no cubre todos los activos. Maverlang puede no tener disponible en su catálogo una parte de la cartera original y lo indica con el porcentaje de cobertura antes de armar cualquier mezcla.",
  "Tus datos. Maverlang trata tus datos según su política de privacidad. Si vinculas una suscripción de Fraccion Pro, solo se guarda el identificador de la suscripción y la fecha de término; el correo se compara con un hash, no se guarda en claro en esa vinculación.",
  "Legislación y contacto. Estos términos se rigen por la ley chilena. Los datos de contacto y el canal de reclamos son los que publica Maverlang en su sitio. Este texto es un borrador y será reemplazado por la versión revisada por un abogado antes de habilitar el cobro.",
].join("\n\n");
