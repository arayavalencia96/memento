# MEMENTO

Álbumes privados de recuerdos. Angular 21, Signals y Tailwind; Supabase para Google Auth, PostgreSQL/RLS, Realtime y Edge Functions; Cloudinary para fotos privadas y Brevo para correos.

## Instalación y recuperación

Ver [la guía completa](docs/INSTALACION.md) para ejecutar en otra computadora, conectar el Supabase existente, reconstruir un backend nuevo o usar Docker localmente. Incluye Google OAuth, secretos, administrador, pruebas y despliegue en Vercel.

Si el backend ya existe y tenés acceso autorizado:

```powershell
npm ci
npm start
```

Se utiliza directamente `src/environments/environment.ts`, con la URL y publishable key públicas de Supabase. No hay generador ni variables `.env` para Angular. No colocar claves privadas en ese archivo.

## Qué conservar en Git

- `src/`, `public/`: interfaz y marca.
- `supabase/functions/`, incluido `_shared/` y `deno.json`: backend.
- `supabase/migrations/`: historial completo de tablas, permisos, triggers y funciones SQL; no borrar migraciones aplicadas.
- `supabase/config.toml`: configuración del stack local, sin secretos; no configura automáticamente el proyecto remoto.
- `supabase/functions/.env.example`: nombres de los secretos, con placeholders.
- Tests, `scripts/test-database.mjs`, documentación, configuración y `package-lock.json`.

No subir `.env` reales, cachés, builds, `node_modules`, `supabase/.temp/` ni `.branches/`. `.gitignore` los excluye. Los tests son opcionales para ejecutar la aplicación, pero se conservan para verificar cambios.

## Validación

```powershell
npm test -- --watch=false
npm run test:db
npm run build
```

Las pruebas de base ejecutan las migraciones en PostgreSQL en memoria, sin tocar Supabase. Los tests Angular usan mocks; no validan las integraciones reales.

## Comportamiento y límites

- `/admin`: estadísticas y salas; `/admin/users`: usuarios; `/admin/requests`: solicitudes.
- `/rooms`: salas del invitado; `/rooms/:id`: álbum. La campana muestra hasta cinco movimientos.
- Los códigos duran 15 minutos y solo solicitan acceso. JWT, rol, membresía y RLS determinan los permisos.
- Fotos JPG/PNG/WebP hasta 10 MB, cuota transaccional y archivos autenticados en Cloudinary. Los enlaces privados duran cinco minutos.
- Copias ZIP con originales y metadatos, hasta 250 MB por ZIP. Verificar la copia antes de borrar; no es una instantánea transaccional.
- El borrado de salas bloquea nuevas cargas y elimina archivos antes de sus registros. Si se interrumpe, reintentar; no hay worker automático y las eliminaciones parciales no se deshacen.
- Los correos salen desde `admin-users`, no desde Angular. Si Brevo falla, el acceso sigue aprobado y el envío queda pendiente. Los reintentos dependen del dashboard o de acciones administrativas; no hay worker periódico.

Vercel publica únicamente Angular. Supabase, Cloudinary y Brevo se configuran y despliegan por separado. No se necesita otro servidor backend.
