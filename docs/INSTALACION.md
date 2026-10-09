# Instalar, replicar y recuperar MEMENTO

Los comandos se ejecutan desde la raíz del repositorio. Los ejemplos usan PowerShell.

## 1. Elegir el escenario

| Escenario                       | Qué hacer                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Otra computadora, mismo backend | Instalar dependencias y arrancar Angular; no reconstruir la base ni volver a cargar secretos |
| Backend nuevo en Supabase Cloud | Crear proyecto, aplicar migraciones, configurar proveedores y desplegar funciones            |
| Backend local con Docker        | Arrancar Supabase local, aplicar migraciones y configurar OAuth local                        |

Clonar el repositorio no concede acceso a una organización de Supabase. Para colaborar en el mismo proyecto, el propietario debe invitarte con permisos adecuados. Para una copia independiente, crear un proyecto propio, en tu organización o en otra donde tengas permiso.

Esta guía reconstruye la **estructura y el comportamiento**, no tus datos personales. Las migraciones no incluyen usuarios, salas, fotografías ni secretos. Recuperar datos requiere backups separados de la base y de Cloudinary. El ZIP de fotos no restaura por sí solo usuarios, membresías y solicitudes.

## 2. Descargar e instalar

Instalar Git y Node.js 24 (incluye npm). Docker Desktop solo es necesario para Supabase local y los tests pgTAP, no para Angular conectado a Supabase Cloud.

```powershell
git clone URL_DEL_REPOSITORIO
cd memento
npm ci
```

Si el repositorio se descargó como ZIP, abrir una terminal en la carpeta que contiene `package.json`.

## 3. Usar el backend existente

Revisar `src/environments/environment.ts`: debe apuntar al proyecto que querés utilizar. No se necesitan credenciales administrativas para que un usuario autorizado use la aplicación.

```powershell
npm start
```

Abrir `http://localhost:4200`. En Supabase Auth, el administrador del proyecto debe haber autorizado `http://localhost:4200/auth/callback`. Iniciar sesión con Google; los roles y accesos siguen siendo los del backend existente.

**No ejecutar `db reset`, SQL de instalación ni crear otro admin para este escenario.** Si solo cambió la computadora, los datos y secretos remotos siguen donde estaban.

## 4. Reconstruir en un Supabase Cloud nuevo

### 4.1 Crear y enlazar el proyecto

Crear un proyecto vacío desde el dashboard de Supabase. Conservar la contraseña de la base en un gestor de contraseñas. Obtener el Project Ref en los ajustes del proyecto o mediante `npx supabase projects list` después del login.

La carpeta ya incluye `supabase/config.toml`: no hace falta ejecutar `supabase init`. `project_id = "memento"` identifica el stack local; **no es el Project Ref remoto**.

El stack local usa PostgreSQL 17. Si vas a trabajar también con Docker sobre un proyecto remoto de otra versión, consultar `show server_version;` en su SQL Editor y ajustar `db.major_version` para que coincidan.

```powershell
npx supabase login
npx supabase link --project-ref SU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Revisar el proyecto enlazado antes de confirmar. Se aplican las migraciones pendientes en orden: tablas, RLS, triggers, funciones SQL y publicación de Realtime. No copiarlas una por una al SQL Editor. En proyectos existentes, no manipular el historial de migraciones para forzar su repetición.

`config.toml` configura el stack local; `link` y `db push` no copian automáticamente Google OAuth, las URLs de Auth, secretos ni otras opciones del dashboard al proyecto remoto.

### 4.2 Configurar Google OAuth

1. En Google Cloud, crear/configurar la pantalla de consentimiento y un cliente OAuth de tipo **Aplicación web**. Si está en modo de prueba, agregar las cuentas que probarán la app.
2. En el nuevo proyecto Supabase → Authentication → Providers → Google, copiar el callback que muestra Supabase.
3. Registrar ese callback exacto en las URI de redirección autorizadas del cliente Google: `https://SU_PROJECT_REF.supabase.co/auth/v1/callback`.
4. Habilitar Google en Supabase y guardar Client ID y Client Secret. Mantener los chequeos de nonce; requerir correo.
5. En Authentication → URL Configuration, usar Site URL `http://localhost:4200` y agregar Redirect URL `http://localhost:4200/auth/callback`.
6. Deshabilitar otros métodos de inicio de sesión si la instalación debe admitir únicamente Google. No habilitar usuarios anónimos.

El Client Secret de Google nunca va en Angular ni en Git. El callback Google apunta a Supabase; el callback de Angular se autoriza en Supabase.

### 4.3 Cloudinary, Brevo y secretos

Crear o utilizar cuentas propias de Cloudinary y Brevo. Para replicar independientemente, no reutilizar credenciales ni el almacenamiento privado del propietario original.

```powershell
Copy-Item supabase/functions/.env.example supabase/functions/.env
```

Completar el archivo local, ignorado por Git:

| Variable                | Valor                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| `ROOM_CODE_PEPPER`      | Secreto aleatorio propio y estable, no una contraseña elegida a mano       |
| `CLOUDINARY_CLOUD_NAME` | Cloud name de tu cuenta                                                    |
| `CLOUDINARY_API_KEY`    | API key de Cloudinary                                                      |
| `CLOUDINARY_API_SECRET` | API secret de Cloudinary                                                   |
| `BREVO_API_KEY`         | API key HTTP de Brevo, no SMTP key                                         |
| `BREVO_SENDER_EMAIL`    | Remitente verificado en Brevo                                              |
| `APP_URL`               | `http://localhost:4200` en desarrollo; dominio HTTPS público en producción |

Para generar el pepper, ejecutar localmente y guardarlo de forma privada:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Brevo debe tener activado el envío transaccional y validado el remitente. Si restringís IPs de API, verificar que sea compatible con el origen de las Edge Functions; no asumir que su IP de salida es fija. No cambiar de forma indiscriminada restricciones de una cuenta compartida.

```powershell
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy
```

Se despliegan `create-room`, `manage-room`, `request-room-access`, `member-request`, `member-profile`, `admin-users` y `photos`. `_shared` no es una función independiente: se importa desde ellas. Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al backend.

Las funciones verifican el JWT mediante `auth.getUser`, la cuenta habilitada y permisos. Mantener la validación JWT de la plataforma; no usar `--no-verify-jwt` para resolver errores sin diagnosticar su causa.

No cambiar `ROOM_CODE_PEPPER` de una instalación existente sin planificar regenerar los códigos afectados. No publicar el `.env`.

### 4.4 Configurar Angular y crear el administrador

Editar exclusivamente los valores públicos de `src/environments/environment.ts`, conservando las propiedades usadas por la aplicación:

```typescript
export const environment = {
  production: false,
  supabaseUrl: 'https://SU_PROJECT_REF.supabase.co',
  supabasePublishableKey: 'SU_PUBLISHABLE_KEY_PUBLICA',
} as const;
```

Se admite una publishable key pública (`sb_publishable_*`) o una anon key pública compatible. Nunca usar `service_role`, `sb_secret_*`, claves de Brevo ni API secret de Cloudinary. La URL y la clave pública quedan visibles en el navegador: la protección depende de RLS y del backend.

```powershell
npm start
```

Iniciar sesión con la cuenta Google que será admin. El trigger crea su perfil. En el SQL Editor del **nuevo proyecto**, ejecutar:

```sql
update public.profiles
set role = 'admin'
where email = 'SU_CUENTA_GOOGLE@example.com'
returning id, role;
```

Debe devolver un perfil. Si no devuelve ninguno, comprobar que la cuenta ya inició sesión en ese proyecto. Cerrar sesión y volver a entrar. Crear salas desde la interfaz; no hay datos personales de ejemplo precargados.

## 5. Supabase completamente local (opcional)

Requiere Docker Desktop iniciado. Cloudinary, Google y Brevo siguen siendo externos; esta opción no convierte toda la app en offline.

En `supabase/config.toml`, la sección Google está deshabilitada por defecto para permitir arrancar la base sin secretos. Para probar login, cambiar esa sección a:

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = false
```

Definir las variables solo en la terminal que arranca Supabase, con los valores propios:

```powershell
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID='SU_CLIENT_ID'
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET='SU_CLIENT_SECRET'
npx supabase start
npx supabase status
```

Registrar en Google Cloud el callback del Auth local, normalmente `http://127.0.0.1:54321/auth/v1/callback`. Usar el host y puerto que informe tu stack. El retorno a Angular sigue siendo `http://localhost:4200/auth/callback`.

Usar en `environment.ts` la API URL y la clave pública/anon **locales** que informa `status`; nunca su service-role key. Para reconstruir la base local:

```powershell
npx supabase db reset --local
```

**Este comando elimina los datos de la base local y vuelve a aplicar las migraciones. No usar `--linked`: afectaría el proyecto remoto.** En una instalación existente no es necesario para arrancar.

Preparar `supabase/functions/.env` con los secretos propios y `APP_URL=http://localhost:4200`. En otra terminal:

```powershell
npx supabase functions serve --env-file supabase/functions/.env
```

Arrancar Angular en otra terminal con `npm start`. Promover la cuenta a admin desde el SQL Editor del Studio local (puerto 54323), después del primer login. Para cambios del config, detener y volver a iniciar el stack con las variables OAuth definidas.

```powershell
npx supabase test db
npx supabase stop
```

No copiar credenciales OAuth reales dentro de `config.toml` ni commitear modificaciones con secretos. El stack local es para desarrollo, no un despliegue de producción.

## 6. Validar la instalación

```powershell
npm test -- --watch=false
npm run test:db
npm run build
```

`test:db` utiliza PGlite, no Docker ni el proyecto remoto. Los tests no garantizan integración con proveedores. Verificar manualmente con admin e invitado en sesiones diferentes:

- Login Google, rol admin y visualización de salas propias.
- Crear/editar sala, generar código y enviar/aprobar una solicitud.
- Campana y solicitudes actualizadas sin recargar.
- Subir, visualizar, editar y descargar una foto autorizada; impedir acceso a otra cuenta.
- Correo de aprobación en Brevo y destinatario. Si falla, revisar `email_outbox` y logs de `admin-users`; no revocar/conceder repetidamente para forzar correos.
- Exportar y verificar un ZIP. Probar borrados solamente sobre datos descartables y con copia confirmada.

Si Windows muestra `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, probar la cadena de certificados del sistema, sin desactivar TLS:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
```

## 7. Publicar en Vercel

1. Subir el código y `package-lock.json` a GitHub; revisar `git status` antes de confirmar. `.gitignore` no elimina secretos que ya estén en el historial: si ocurrió, rotarlos.
2. Importar el repositorio en Vercel, raíz de esta carpeta, framework Angular y Node.js 24.
3. `vercel.json` configura `npm ci`, `npm run build`, salida `dist/memento/browser` y rutas SPA. Angular lee `environment.ts` directamente: no requiere variables de Supabase en Vercel.
4. En Supabase Cloud, establecer Site URL con el dominio publicado y autorizar `https://SU_DOMINIO/auth/callback`. Conservar localhost si se usa en desarrollo. No autorizar previews de terceros ni comodines amplios.
5. Actualizar `APP_URL` en los secretos de Supabase con `https://SU_DOMINIO` para botones y logo de correos. Verificar acceso público a `/email-logo.png`.
6. Comprobar login y recarga directa de `/rooms` y `/admin` en producción.

Vercel no despliega las funciones ni aplica migraciones. Para cambios futuros:

```powershell
npx supabase link --project-ref SU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy NOMBRE_DE_LA_FUNCION_MODIFICADA
```

Revisar siempre el destino antes de cambiar el backend. No ejecutar SQL antiguo manualmente ni resetear una base remota para actualizar la aplicación.

## 8. Qué guardar para recuperar el proyecto

- Repositorio completo, incluido `supabase/migrations`, `functions`, `config.toml`, tests y documentación.
- Acceso a las cuentas/organizaciones de Supabase, Google Cloud, Cloudinary y Brevo.
- Secretos respaldados en un gestor seguro, fuera del repositorio.
- Copias de los datos de la base y de los originales de las fotografías si querés conservar contenido.

Las migraciones reconstruyen el backend, no recuperan una cuenta eliminada ni fotografías borradas. Un proyecto nuevo tendrá otras URLs, claves y usuarios; actualizar la configuración y crear nuevamente el primer admin.

## Referencias oficiales

- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Migraciones](https://supabase.com/docs/guides/local-development/database-migrations)
- [Configuración local](https://supabase.com/docs/guides/local-development/managing-config)
- [Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Despliegue de Edge Functions](https://supabase.com/docs/guides/functions/deploy)
- [Configuración de Vercel](https://vercel.com/docs/project-configuration)
