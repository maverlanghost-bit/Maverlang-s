# Soporte de movimientos

Procedimiento para depósitos ausentes, operaciones pendientes y diferencias de saldo. Antes de abrir dinero real, asignar una persona titular y una de respaldo para atención y para operaciones técnicas. Configurar `NEXT_PUBLIC_SUPPORT_EMAIL` con un buzón monitoreado y confirmar que se puede responder desde él. La billetera enlaza al centro de ayuda cuando el buzón queda sin configurar.

## Recibir y seguir el caso

1. **Atención** confirma recepción y registra la cuenta verificada, el entorno (demo o real), el tipo de movimiento, el activo, la hora con zona horaria y el folio o ID. Si el movimiento todavía no aparece, pide la firma pública de origen o la referencia del proveedor, según corresponda. Comparte dentro del equipo sólo los datos necesarios y mantén fuera del caso claves, frases semilla y códigos de acceso.
2. **Operaciones técnicas** localiza el movimiento dentro de la cuenta verificada. El botón **Copiar ID** entrega el identificador completo. Un folio corto identifica un prefijo y se busca siempre dentro de esa cuenta. Guarda los estados observados, su fuente, la hora de consulta y la decisión. Si faltan datos o una consulta falla, conserva el caso abierto.
3. **Atención** da la próxima hora de actualización según la cobertura real y la cumple aunque la revisión siga abierta. Informa cuando cambie el estado y confirma el resultado con operaciones antes de cerrar el caso. Si hay varios usuarios afectados, cobros duplicados o destinos inesperados, escala de inmediato a quien esté a cargo del incidente y coordina las comunicaciones por el mismo canal.

## Diagnóstico por caso

| Caso | Qué revisa operaciones | Cómo decide el siguiente paso |
| --- | --- | --- |
| El depósito no aparece | En depósitos USDC, consulta la firma en el clúster configurado y confirma estado, mint, dirección de destino y monto. Busca la firma en `crypto_deposits` y `wallet_movements`, y revisa el último resultado de conciliación. Para un depósito por proveedor, coteja su referencia, el destino y la evidencia de liquidación. | Si el depósito corresponde a esa cuenta y se confirmó en cadena, revisa el indexador y concilia por el mecanismo idempotente. Si el resultado sigue pendiente, deja el caso abierto y agenda la siguiente revisión. Si red, mint o destino difieren, registra la evidencia y escala según el flujo del proveedor. |
| La firma sigue pendiente | Busca la orden en `orders` o el retiro en `wallet_withdrawals`. Para el retiro, enlaza el registro con `wallet_movements` por `reference`. Verifica la firma por RPC y contrasta el resultado con los crons de órdenes o billetera. | `processed`, una consulta que falla y una firma ausente en una sola lectura requieren seguimiento. Con evidencia de confirmación o fallo, revisa que el conciliador refleje ese resultado. Mantén la misma referencia durante el seguimiento y evita pedir que el usuario reenvíe mientras la ejecución siga incierta. |
| El saldo difiere | Verifica la cuenta y el entorno, actualiza los datos y compara unidades del activo, USDC, reservas vigentes y, para xStocks, el multiplicador aplicado. Contrasta historial, libro y saldo on-chain para la misma billetera y anota la hora de cada lectura. | Si la diferencia sigue, escala con la firma, el activo y las lecturas comparables. Trata los desajustes como casos de conciliación. Cualquier corrección requiere el procedimiento aprobado y una traza de auditoría. |

El caso se puede resolver con consultas de sólo lectura y los mecanismos previstos de conciliación. Cualquier escritura excepcional en el libro o acción que mueva fondos requiere autorización del responsable operativo y revisión técnica. [Cron de billetera](../app/api/cron/reconcile-wallet/route.ts) · [Cron de órdenes](../app/api/cron/reconcile-orders/route.ts) · [Handoff de auditoría](AUDITORIA-HANDOFF.md)

## Ensayo antes del lanzamiento

En staging y con datos de prueba, abrir los tres casos como si los reportara un usuario. Registrar quién atendió, qué consultó, el resultado, el mensaje enviado y cualquier ajuste pendiente.

| Escenario | Resultado esperado |
| --- | --- |
| Depósito confirmado en la fuente y ausente del historial | Soporte ubica la firma desde el flujo de ayuda. Tras recuperar el indexador, una segunda pasada conserva un único crédito y el movimiento aparece en el historial. |
| Firma con respuesta ambigua | Atención informa que sigue en revisión. El primer intento de consulta mantiene el estado pendiente. Cuando llega el resultado, el historial refleja el cambio y conserva la referencia. |
| Diferencia de saldo que persiste tras actualizar | Operaciones reproduce la diferencia con lecturas de la misma cuenta y escala con evidencia. El caso sigue abierto hasta explicar y verificar el saldo. |

## Mensajes para adaptar

**Recepción.** «Recibimos tu consulta por el movimiento [folio]. Revisaremos su estado y te escribiremos de nuevo a las [hora y zona horaria].»

**Sigue en revisión.** «El movimiento [folio] sigue pendiente de confirmación. Antes de repetir la operación, espera nuestra próxima actualización a las [hora y zona horaria].»

**Resolución.** «Confirmamos [resultado] para el movimiento [folio] a las [hora y zona horaria]. Puedes revisarlo desde Billetera → Actividad. Si todavía ves una diferencia, responde con el folio.»
