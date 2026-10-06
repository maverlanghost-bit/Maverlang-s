"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

function snapshot(): boolean {
  return true;
}

function serverSnapshot(): boolean {
  return false;
}

/**
 * True sólo después de hidratar (M42b). En el servidor y en el primer render
 * del cliente devuelve false: sirve para mostrar un texto estable y empezar
 * relojes/contadores en `useEffect`, evitando el error de hidratación #418
 * (texto del servidor distinto al del navegador).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
