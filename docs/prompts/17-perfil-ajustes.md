# T17 — Perfil y ajustes
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.2 (Perfil) y §4 (UserProfile, Preferences, Consent).

Haz:
1. `/app/perfil`: Avatar + email + país; menú en lista (Cuenta, Seguridad, Notificaciones, Idioma y moneda, Documentos legales, Ayuda → `/ayuda`, Cerrar sesión). Versión de la app al pie.
2. `/cuenta`: nombre editable (`PATCH /api/me`), email (sólo lectura), país, ID de usuario (copiar), "Solicitar eliminación de cuenta" (Dialog que explica que los activos siguen en tu billetera; en mock sólo registra la solicitud).
3. `/seguridad`: métodos de login vinculados, "Exportar clave privada" (Privy `exportWallet` vía adaptador; mock = Dialog con advertencias fuertes, sin mostrar clave), sesiones/2FA según disponibilidad de Privy (si no, "Próximamente").
4. `/notificaciones`: switches (órdenes, depósitos, novedades) → `setPrefs`, optimista.
5. `/idioma`: Español (Chile)/English y moneda CLP/USD → aplica en toda la app al instante.
6. `/legal`: tabla de consentimientos (doc, versión, fecha) + links.

Listo cuando: preferencias persisten en la sesión mock y el idioma cambia la UI.
Al terminar: PROGRESO.md + commit `T17: perfil ajustes`.
