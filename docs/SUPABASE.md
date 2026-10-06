# Supabase — qué pegar y cómo dejar Auth

El proyecto remoto está vacío. No pegues `0001_init.sql`: ese archivo es el esquema viejo de Privy (ids de texto) y choca con el registro. El aviso está al inicio del archivo.

## Qué pegar en el SQL Editor

1. Abre el SQL Editor del proyecto en el panel de Supabase.
2. Pega **una sola vez** el archivo `supabase/migrations/0002_supabase_auth.sql`.
3. Ejecútalo. Si lo vuelves a correr, no duplica tablas ni políticas.

Eso crea el perfil (`public.profiles`), los consentimientos y las preferencias. Al confirmar el correo, un trigger arma la fila del perfil con los datos del registro. Cada persona sólo puede ver y editar su fila. No hay insert ni delete públicos del perfil: lo crea el trigger.

No hace falta aplicarlo desde la terminal. Cartera, billetera y órdenes no van en este archivo.

## Auth en el panel

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback` y `http://localhost:3000/**`
- Confirmación de correo: activa
- El SMTP integrado de Supabase tiene un límite bajo de correos por hora. Para producción, configura un SMTP propio.

Google no se enciende en este paso.
