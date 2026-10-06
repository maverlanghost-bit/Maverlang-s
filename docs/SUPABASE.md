# Supabase — qué pegar y cómo dejar Auth

El proyecto remoto está vacío. No pegues `0001_init.sql`: ese archivo es el esquema viejo de Privy (ids de texto) y choca con el registro. El aviso está al inicio del archivo.

## Qué pegar en el SQL Editor

1. Abre el SQL Editor del proyecto en el panel de Supabase.
2. Pega **una sola vez** el archivo `supabase/migrations/0002_supabase_auth.sql`.
3. Ejecútalo. Si lo vuelves a correr, no duplica tablas ni políticas.

Eso crea el perfil (`public.profiles`), los consentimientos y las preferencias. Al confirmar el correo, un trigger arma la fila del perfil con los datos del registro. Cada persona sólo puede ver y editar su fila. No hay insert ni delete públicos del perfil: lo crea el trigger.

No hace falta aplicarlo desde la terminal. Cartera, billetera y órdenes no van en este archivo.

## Auth en el panel

- Site URL: el valor de `NEXT_PUBLIC_SITE_URL` (en local, `http://localhost:3000`)
- Redirect URLs: `http://localhost:3000/auth/callback` y `http://localhost:3000/**`
- Confirmación de correo: activa
- El SMTP integrado de Supabase tiene un límite bajo de correos por hora. Para producción, configura un SMTP propio.

Google no se enciende. El botón del ingreso queda en Próximamente.

## Correos

El registro manda el enlace de confirmación a `{SITE_URL}/auth/callback?next=…`. Recuperar la contraseña usa `{SITE_URL}/auth/callback?next=/app/restablecer`. Los dos pasan por la misma Redirect URL.

Plantillas, opcionales. En Authentication → Emails puedes dejar las de Supabase o escribirlas en español. El botón del correo tiene que usar la URL de confirmación que arma Supabase (`{{ .ConfirmationURL }}`), que ya incluye el callback de arriba. No prometas rentabilidad. El horario del producto es de lunes a viernes.

- Confirmar cuenta: asunto y cuerpo en español, con el enlace para activar.
- Recuperar contraseña: asunto y cuerpo en español, con el enlace para elegir una clave nueva.
- Si no tocas las plantillas, las de Supabase sirven igual.
