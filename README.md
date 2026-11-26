# Monitoreo El Encano

Frontend React + Vite para el sistema de monitoreo ambiental. La integración usa el esquema que existe actualmente en el proyecto Supabase.

## Desarrollo local

1. Copia `.env.example` a `.env.local`.
2. Configura `VITE_SUPABASE_URL` con la URL base del proyecto (sin `/rest/v1`) y `VITE_SUPABASE_ANON_KEY` con la clave pública.
3. Ejecuta `npm install` y `npm run dev`.

No agregues `service_role`, contraseñas ni tokens privados a variables `VITE_*` o al frontend.

## Esquema Supabase consumido por el frontend

- `sensor_readings`: `id`, `device_id`, `water_distance_cm`, `water_height_cm`, `water_status`, `rain_adc`, `rain_voltage`, `rain_status`, `soil_adc`, `soil_percent`, `soil_status`, `general_risk`, `buzzer_active`, `recorded_at`.
- `devices`: `id`, `name`, `location`, `active`, `last_seen_at`, `created_at`.
- `alert_events`: `id`, `device_id`, `reading_id`, `severity`, `category`, `title`, `description`, `status`, `created_at`, `acknowledged_by`, `resolved_by`, `resolved_at`.
- `system_settings`: `key`, `value` (JSONB), `description`, `updated_by`, `updated_at`. El panel usa las claves `project_name`, `measurement_interval_seconds`, `upload_interval_seconds` y `stale_after_seconds`.
- `threshold_configs`: consulta y actualización por `device_id`, con los campos de umbral por agua, suelo y lluvia.

El dashboard, historial y gráficas usan estos campos; la gráfica llama a `get_monitoring_chart(p_hours integer)`. Los visitantes consultan el panel sin sesión mediante permisos RLS de lectura para `anon`; las escrituras y acciones técnicas requieren autenticación y permisos de `engineer` o `admin`. La clave pública no omite RLS. El código no cambia políticas remotas, así que los permisos de lectura pública deben verificarse en Supabase antes de considerar completa la conexión.

El panel de administración obtiene los correos desde Supabase Auth mediante la Edge Function `admin-list-users`, protegida para administradores activos. Su `SUPABASE_SERVICE_ROLE_KEY` se usa solo en servidor. La función está en el repositorio, pero no se despliega automáticamente; para habilitar la lista de usuarios, configúrala y despliega manualmente con `supabase functions deploy admin-list-users`.

Las Edge Functions usan Deno. En VS Code instala la extensión oficial Deno; el workspace habilita su análisis solo para `supabase/functions`. La función `admin-list-users` importa `@supabase/supabase-js` mediante el esquema `npm:` que soporta Deno.

## Compatibilidad del backend

La migración local `supabase/migrations/20261125000100_el_encano_platform.sql`, el contenido anterior de este README y las Edge Functions `ingest-reading`/`get-device-config` fueron preparados para un esquema anterior. **No apliques esa migración ni despliegues esas funciones contra el esquema actual sin adaptarlas y validarlas.** Consultan campos que no están en las tablas descritas aquí (por ejemplo `last_contact_at`, `water_valid` y umbrales singleton). El contrato y columnas actuales de `profiles`, `activity_logs` y `device_credentials` tampoco están documentados en el repositorio.

La recepción ESP32, la descarga segura de configuración y las funciones existentes deben revisarse contra el esquema/RLS reales antes de desplegarse. La clave `service_role`, si se necesita en funciones server-side, solo debe configurarse como secreto en Supabase.

## Validación local

```bash
npm run lint
npm run build
```
