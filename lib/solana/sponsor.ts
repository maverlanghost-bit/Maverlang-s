import "server-only";

/**
 * Patrocinio del fee-payer. [POR DECIDIR] (ARQUITECTURA §6.5 y §10).
 * Requiere KMS: en producción la clave del patrocinador no va en el env.
 * `SPONSOR_ENABLED` queda en false hasta esa decisión. No hay clave aquí.
 * No importar este módulo desde un componente cliente.
 */
export function sponsorTransaction(transactionBase64: string): never {
  void transactionBase64;
  throw new Error("NOT_IMPLEMENTED: patrocinio de gas. Requiere KMS.");
}
