# T16 — Depositar pesos (on-ramp)
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §4 (Onramp*) y §10 (On-ramp).

Haz `/app/billetera/depositar` con dos pestañas:
1. **Con pesos**: monto CLP (chips $10.000 / $50.000 / $100.000; mínimo según proveedor [VERIFICAR], usa config), estimado USDC y costo del proveedor (desde `createOnrampSession` mock), métodos mostrados como info (Khipu, EtPay, transferencia — [VERIFICAR en Koywe]), botón "Continuar con Koywe" → en mock abre Dialog que simula el widget (pasos: pago → procesando → USDC acreditado); en live abrirá el SDK/URL. Adaptador `lib/onramp/` con interfaz común para Koywe y Onramper; Onramper como opción secundaria "Otros métodos".
2. **Con USDC**: instrucciones para enviar USDC por red Solana desde un exchange (dirección + QR, advertencia de red).
3. Al completar (mock) agregar actividad "Depósito" y refrescar saldos; toast.
4. Texto: el proveedor puede pedir verificación de identidad; los costos los cobra el proveedor.

Listo cuando: flujo mock completo deja el depósito en actividad y saldo actualizado.
Al terminar: PROGRESO.md + commit `T16: deposito onramp`.
