# T15 — Billetera: resumen, recibir, enviar
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.2 (Billetera) y §6 (reglas 1, 5).

Haz:
1. `/app/billetera`: saldo USDC grande, SOL para comisiones de red (con explicación breve y aviso si bajo), botones Depositar · Enviar · Recibir, lista de activos (USDC, SOL, acciones), dirección con copiar, actividad (todas las clases, agrupada por día).
2. `/app/billetera/recibir`: QRCode de la dirección, copiar, compartir, advertencias claras: "Sólo red Solana", "Sólo USDC o acciones soportadas; otros tokens pueden perderse".
3. `/app/billetera/enviar`: activo (select), destino (validar con `lib/solana/address.ts`: base58 + 32 bytes; avisar si es la propia), monto (máx.), revisión con costos (red + rent si el destino no tiene cuenta de token — mock), confirmar → `buildSend` → firma → estados como en T13. Aviso: transferencias son irreversibles.

Listo cuando: dirección inválida bloquea el envío; envío mock completo y aparece en actividad.
Al terminar: PROGRESO.md + commit `T15: billetera`.
