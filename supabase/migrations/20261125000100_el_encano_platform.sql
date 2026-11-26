create extension if not exists pgcrypto with schema extensions;
create sequence if not exists public.device_config_revision_seq start 1;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'user' check (role in ('admin', 'engineer', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_single_admin
  on public.profiles (role) where role = 'admin';

create table if not exists public.devices (
  id text primary key,
  name text not null,
  location text not null default 'El Encano, Nariño, Colombia',
  active boolean not null default true,
  public_read boolean not null default true,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_credentials (
  device_id text primary key references public.devices (id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.threshold_configs (
  id boolean primary key default true check (id),
  water_base_cm numeric(5,2) not null default 20 check (water_base_cm > 0 and water_base_cm <= 100),
  warning_from_cm numeric(5,2) not null default 2 check (warning_from_cm >= 0),
  danger_from_cm numeric(5,2) not null default 2.5 check (danger_from_cm > warning_from_cm),
  critical_from_cm numeric(5,2) not null default 3 check (critical_from_cm > danger_from_cm),
  version bigint not null default nextval('public.device_config_revision_seq') check (version > 0),
  enabled boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (warning_from_cm < danger_from_cm and danger_from_cm < critical_from_cm and critical_from_cm <= water_base_cm)
);

insert into public.threshold_configs (id) values (true) on conflict (id) do nothing;

create table if not exists public.system_settings (
  id boolean primary key default true check (id),
  version bigint not null default nextval('public.device_config_revision_seq') check (version > 0),
  buzzer_enabled boolean not null default true,
  buzzer_on_ms integer not null default 200 check (buzzer_on_ms between 50 and 5000),
  buzzer_off_ms integer not null default 800 check (buzzer_off_ms between 50 and 10000),
  stale_after_seconds integer not null default 180 check (stale_after_seconds between 30 and 86400),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices (id) on delete restrict,
  reading_id uuid not null,
  water_valid boolean not null,
  water_distance_cm numeric(6,2),
  water_distance_filtered_cm numeric(6,2),
  water_height_cm numeric(6,2),
  water_status text not null check (water_status in ('SIN_LECTURA', 'NORMAL', 'ADVERTENCIA', 'PELIGRO', 'PELIGRO_CRITICO')),
  rain_adc integer check (rain_adc between 0 and 4095),
  rain_adc_filtered integer check (rain_adc_filtered between 0 and 4095),
  rain_voltage numeric(5,3) check (rain_voltage between 0 and 3.3),
  rain_status text not null check (rain_status in ('SIN_LECTURA', 'SIN_LLUVIA', 'LLUVIA_MODERADA', 'LLUVIA_EXCESIVA')),
  soil_adc integer check (soil_adc between 0 and 4095),
  soil_adc_filtered integer check (soil_adc_filtered between 0 and 4095),
  soil_percent numeric(5,2) check (soil_percent between 0 and 100),
  soil_status text not null check (soil_status in ('SIN_LECTURA', 'SECO', 'HUMEDAD_NORMAL', 'HUMEDAD_PREVENTIVA', 'HUMEDAD_EXCESIVA')),
  general_risk text not null check (general_risk in ('SIN_LECTURA', 'NORMAL', 'ADVERTENCIA', 'PELIGRO', 'PELIGRO_CRITICO')),
  buzzer_active boolean not null,
  recorded_at timestamptz not null default now(),
  unique (device_id, reading_id),
  check (
    (water_valid and water_distance_cm between 2 and 20 and water_distance_filtered_cm between 2 and 20 and water_height_cm between 0 and 100 and water_status <> 'SIN_LECTURA')
    or
    (not water_valid and water_distance_cm is null and water_distance_filtered_cm is null and water_height_cm is null and water_status = 'SIN_LECTURA' and not buzzer_active)
  ),
  check (not buzzer_active or (water_valid and water_height_cm >= 3)),
  check ((rain_adc is null and rain_adc_filtered is null and rain_voltage is null and rain_status = 'SIN_LECTURA') or (rain_adc is not null and rain_adc_filtered is not null and rain_voltage is not null and rain_status <> 'SIN_LECTURA')),
  check ((soil_adc is null and soil_adc_filtered is null and soil_percent is null and soil_status = 'SIN_LECTURA') or (soil_adc is not null and soil_adc_filtered is not null and soil_percent is not null and soil_status <> 'SIN_LECTURA'))
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices (id) on delete restrict,
  reading_id uuid references public.sensor_readings (id) on delete set null,
  severity text not null check (severity in ('INFO', 'ADVERTENCIA', 'PELIGRO', 'PELIGRO_CRITICO')),
  category text not null check (category in ('RISK', 'ENVIRONMENT', 'DATA_QUALITY', 'DEVICE')),
  title text not null,
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  is_public boolean not null default true,
  acknowledged_by uuid references public.profiles (id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  check (resolution_note is null or length(resolution_note) <= 2000)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sensor_readings_device_recorded_idx on public.sensor_readings (device_id, recorded_at desc);
create index if not exists sensor_readings_recorded_idx on public.sensor_readings (recorded_at desc);
create index if not exists alert_events_device_created_idx on public.alert_events (device_id, created_at desc);
create index if not exists alert_events_status_created_idx on public.alert_events (status, created_at desc);
create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);

-- Retire una política pública heredada si la tabla antigua existe.
do $$
begin
  if to_regclass('public.mediciones') is not null then
    execute 'drop policy if exists "Lectura publica de mediciones" on public.mediciones';
  end if;
  if to_regclass('public.alertas') is not null then
    execute 'drop policy if exists "Lectura publica de alertas" on public.alertas';
  end if;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.bump_threshold_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.version := nextval('public.device_config_revision_seq');
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.bump_system_settings_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.version := nextval('public.device_config_revision_seq');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists threshold_configs_bump_version on public.threshold_configs;
create trigger threshold_configs_bump_version before update on public.threshold_configs
for each row execute function public.bump_threshold_version();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists devices_touch_updated_at on public.devices;
create trigger devices_touch_updated_at before update on public.devices
for each row execute function public.touch_updated_at();

drop trigger if exists system_settings_touch_updated_at on public.system_settings;
create trigger system_settings_touch_updated_at before update on public.system_settings
for each row execute function public.bump_system_settings_version();

create or replace function public.current_profile_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create or replace function public.is_active_profile()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and active)
$$;

create or replace function public.is_engineer_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_profile_role() in ('engineer', 'admin'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_profile_role() = 'admin', false)
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    'user',
    true
  )
  on conflict (id) do nothing;
  insert into public.activity_logs (actor_id, action, target_type, target_id, details)
  values (
    null,
    'profile_created',
    'profile',
    new.id::text,
    jsonb_build_object('email', coalesce(new.email, ''))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create or replace function public.admin_set_profile_access(
  target_user_id uuid,
  new_role text,
  new_active boolean
)
returns void language plpgsql security definer set search_path = public as $$
declare
  old_profile public.profiles%rowtype;
begin
  if not public.is_admin() or not public.is_active_profile() then
    raise exception 'Solo un administrador activo puede gestionar perfiles.' using errcode = '42501';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'No se permite modificar el propio acceso del administrador.' using errcode = '42501';
  end if;
  if new_role not in ('user', 'engineer') then
    raise exception 'El administrador solo puede asignar los roles user o engineer.' using errcode = '22023';
  end if;

  select * into old_profile from public.profiles where id = target_user_id for update;
  if not found or old_profile.role = 'admin' then
    raise exception 'No se puede gestionar el perfil indicado.' using errcode = '42501';
  end if;

  update public.profiles set role = new_role, active = new_active where id = target_user_id;
  insert into public.activity_logs (actor_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'profile_access_changed',
    'profile',
    target_user_id::text,
    jsonb_build_object('old_role', old_profile.role, 'role', new_role, 'old_active', old_profile.active, 'active', new_active)
  );
end;
$$;

create or replace function public.log_threshold_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_logs (actor_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'thresholds_updated',
    'threshold_config',
    'primary',
    jsonb_build_object(
      'version', new.version,
      'water_base_cm', new.water_base_cm,
      'warning_from_cm', new.warning_from_cm,
      'danger_from_cm', new.danger_from_cm,
      'critical_from_cm', new.critical_from_cm
    )
  );
  return new;
end;
$$;

drop trigger if exists threshold_configs_audit on public.threshold_configs;
create trigger threshold_configs_audit after update on public.threshold_configs
for each row execute function public.log_threshold_change();

create or replace function public.create_reading_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  recent_rain_count integer;
  recent_soil_count integer;
  recent_invalid_count integer;
  recent_valid_count integer;
  recent_same_risk_count integer;
  risk_before_window text;
begin
  select count(*) into recent_same_risk_count from (
    select general_risk from public.sensor_readings
     where device_id = new.device_id order by recorded_at desc, id desc limit 3
  ) recent where general_risk = new.general_risk;
  select general_risk into risk_before_window from (
    select general_risk from public.sensor_readings
     where device_id = new.device_id order by recorded_at desc, id desc offset 3 limit 1
  ) previous_window;

  if new.general_risk <> 'SIN_LECTURA'
     and recent_same_risk_count = 3
     and risk_before_window is distinct from new.general_risk then
    insert into public.alert_events (device_id, reading_id, severity, category, title, description)
    values (
      new.device_id,
      new.id,
      case when new.general_risk = 'NORMAL' then 'INFO' else new.general_risk end,
      'RISK',
      case when new.general_risk = 'NORMAL' then 'Condiciones de riesgo normalizadas' else 'Cambio en el nivel de riesgo' end,
      format('El riesgo general cambió a %s. Nivel de agua: %s cm.', new.general_risk, new.water_height_cm));
  end if;

  select count(*) into recent_invalid_count from (
    select water_valid, rain_status, soil_status from public.sensor_readings
     where device_id = new.device_id order by recorded_at desc, id desc limit 3
  ) recent where not water_valid or rain_status = 'SIN_LECTURA' or soil_status = 'SIN_LECTURA';
  select count(*) into recent_valid_count from (
    select water_valid, rain_status, soil_status from public.sensor_readings
     where device_id = new.device_id order by recorded_at desc, id desc limit 3
  ) recent where water_valid and rain_status <> 'SIN_LECTURA' and soil_status <> 'SIN_LECTURA';

  if recent_invalid_count = 3 and not exists (
    select 1 from public.alert_events
     where device_id = new.device_id and category = 'DATA_QUALITY' and status <> 'RESOLVED'
  ) then
    insert into public.alert_events (device_id, reading_id, severity, category, title, description)
    values (new.device_id, new.id, 'ADVERTENCIA', 'DATA_QUALITY', 'Lectura inválida de sensor',
      'Uno o más sensores no entregaron lecturas válidas durante tres registros consecutivos. Revisa la calidad de datos del dispositivo.');
  elsif recent_valid_count = 3 then
    update public.alert_events
       set status = 'RESOLVED', resolved_at = now()
     where device_id = new.device_id and category = 'DATA_QUALITY'
       and status <> 'RESOLVED' and title = 'Lectura inválida de sensor';
  end if;

  select count(*) into recent_rain_count from (
    select rain_status from public.sensor_readings
     where device_id = new.device_id order by recorded_at desc, id desc limit 3
  ) recent where rain_status = 'LLUVIA_EXCESIVA';

  select count(*) into recent_soil_count from (
    select soil_status from public.sensor_readings
     where device_id = new.device_id order by recorded_at desc, id desc limit 3
  ) recent where soil_status = 'HUMEDAD_EXCESIVA';

  if (recent_rain_count = 3 or recent_soil_count = 3)
     and not exists (
       select 1 from public.alert_events
        where device_id = new.device_id and category = 'ENVIRONMENT' and status <> 'RESOLVED'
     ) then
    insert into public.alert_events (device_id, reading_id, severity, category, title, description)
    values (new.device_id, new.id, 'ADVERTENCIA', 'ENVIRONMENT', 'Condición ambiental persistente',
      'Se detectaron al menos tres lecturas consecutivas de lluvia excesiva o humedad excesiva. No confirma una inundación.');
  end if;

  if recent_rain_count = 0 and recent_soil_count = 0 then
    update public.alert_events
       set status = 'RESOLVED', resolved_at = now()
     where device_id = new.device_id and category = 'ENVIRONMENT' and status <> 'RESOLVED';
  end if;

  return new;
end;
$$;

drop trigger if exists sensor_readings_create_events on public.sensor_readings;
create trigger sensor_readings_create_events after insert on public.sensor_readings
for each row execute function public.create_reading_events();

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.device_credentials enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.threshold_configs enable row level security;
alter table public.system_settings enable row level security;
alter table public.alert_events enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
for select to authenticated using (id = (select auth.uid()) or public.is_admin());

drop policy if exists devices_read_allowed on public.devices;
create policy devices_read_allowed on public.devices
for select to anon, authenticated using (
  (active and public_read) or public.is_engineer_or_admin()
);
drop policy if exists devices_manage_admin on public.devices;
create policy devices_manage_admin on public.devices
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists sensor_readings_read_public on public.sensor_readings;
create policy sensor_readings_read_public on public.sensor_readings
for select to anon, authenticated using (
  exists (
    select 1 from public.devices d
    where d.id = sensor_readings.device_id and d.active and d.public_read
  ) or public.is_engineer_or_admin()
);

drop policy if exists threshold_configs_read_engineers on public.threshold_configs;
create policy threshold_configs_read_engineers on public.threshold_configs
for select to authenticated using (public.is_engineer_or_admin());
drop policy if exists threshold_configs_update_engineers on public.threshold_configs;
create policy threshold_configs_update_engineers on public.threshold_configs
for update to authenticated using (public.is_engineer_or_admin())
with check (public.is_engineer_or_admin() and updated_by = (select auth.uid()));

drop policy if exists system_settings_read_engineers on public.system_settings;
create policy system_settings_read_engineers on public.system_settings
for select to anon, authenticated using (true);
drop policy if exists system_settings_update_engineers on public.system_settings;
create policy system_settings_update_engineers on public.system_settings
for update to authenticated using (public.is_engineer_or_admin())
with check (public.is_engineer_or_admin() and updated_by = (select auth.uid()));

drop policy if exists alert_events_read_public on public.alert_events;
create policy alert_events_read_public on public.alert_events
for select to anon, authenticated using (
  (is_public and exists (
    select 1 from public.devices d
    where d.id = alert_events.device_id and d.active and d.public_read
  )) or public.is_engineer_or_admin()
);
drop policy if exists alert_events_update_engineers on public.alert_events;
create policy alert_events_update_engineers on public.alert_events
for update to authenticated using (public.is_engineer_or_admin())
with check (
  public.is_engineer_or_admin()
  and (acknowledged_by is null or acknowledged_by = (select auth.uid()))
  and (resolved_by is null or resolved_by = (select auth.uid()))
);
revoke update on public.alert_events from anon, authenticated;
grant update (status, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_note)
  on public.alert_events to authenticated;

drop policy if exists activity_logs_read_engineers on public.activity_logs;
create policy activity_logs_read_engineers on public.activity_logs
for select to authenticated using (public.is_engineer_or_admin());

revoke all on public.profiles, public.devices, public.device_credentials,
  public.sensor_readings, public.threshold_configs, public.system_settings,
  public.alert_events, public.activity_logs from public, anon, authenticated;
grant select on public.devices, public.sensor_readings, public.alert_events, public.system_settings
  to anon, authenticated;
grant select, update on public.devices to authenticated;
grant select on public.profiles, public.threshold_configs, public.activity_logs to authenticated;
grant update on public.threshold_configs, public.system_settings to authenticated;
grant update (status, acknowledged_by, acknowledged_at, resolved_by, resolved_at, resolution_note)
  on public.alert_events to authenticated;
grant all on public.profiles, public.devices, public.device_credentials,
  public.sensor_readings, public.threshold_configs, public.system_settings,
  public.alert_events, public.activity_logs to service_role;
grant usage, select on sequence public.device_config_revision_seq to service_role;

create or replace function public.get_monitoring_chart(p_hours integer)
returns table (
  recorded_at timestamptz,
  water_height_cm numeric,
  rain_voltage numeric,
  soil_percent numeric
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    date_bin(
      case
        when p_hours = 24 then interval '2 minutes'
        when p_hours = 168 then interval '15 minutes'
        else interval '45 minutes'
      end,
      r.recorded_at,
      timestamptz '2000-01-01 00:00:00+00'
    ) as recorded_at,
    avg(r.water_height_cm),
    avg(r.rain_voltage),
    avg(r.soil_percent)
  from public.sensor_readings r
  where p_hours in (24, 168, 720)
    and r.recorded_at >= now() - make_interval(hours => p_hours)
  group by 1
  order by 1;
$$;

revoke all on function public.get_monitoring_chart(integer) from public, anon, authenticated;
grant execute on function public.get_monitoring_chart(integer) to anon, authenticated;

create or replace function public.guard_alert_event_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = old.status then
    new.acknowledged_by := old.acknowledged_by;
    new.acknowledged_at := old.acknowledged_at;
    new.resolved_by := old.resolved_by;
    new.resolved_at := old.resolved_at;
    return new;
  end if;

  if old.status = 'RESOLVED' or new.status = 'OPEN' then
    raise exception 'No se permite reabrir una alerta resuelta ni retroceder su estado.'
      using errcode = '22023';
  end if;

  if new.status = 'ACKNOWLEDGED' then
    if old.status <> 'OPEN' then
      raise exception 'Solo una alerta abierta puede ser reconocida.' using errcode = '22023';
    end if;
    new.acknowledged_by := auth.uid();
    new.acknowledged_at := now();
  elsif new.status = 'RESOLVED' then
    new.resolved_by := auth.uid();
    new.resolved_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists alert_events_guard_update on public.alert_events;
create trigger alert_events_guard_update before update on public.alert_events
for each row execute function public.guard_alert_event_update();

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  row_data jsonb;
  row_id text;
  action_name text;
begin
  row_data := to_jsonb(new);
  row_id := coalesce(row_data ->> 'id', row_data ->> 'device_id');
  action_name := tg_table_name || '_updated';
  insert into public.activity_logs (actor_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    action_name,
    tg_table_name,
    row_id,
    jsonb_build_object('updated_at', row_data ->> 'updated_at')
  );
  return new;
end;
$$;

drop trigger if exists system_settings_audit on public.system_settings;
create trigger system_settings_audit after update on public.system_settings
for each row execute function public.audit_row_change();

drop trigger if exists devices_audit on public.devices;
create trigger devices_audit after update of name, location, active, public_read on public.devices
for each row execute function public.audit_row_change();

drop trigger if exists alert_events_audit on public.alert_events;
create trigger alert_events_audit after update on public.alert_events
for each row execute function public.audit_row_change();

grant execute on function public.current_profile_role() to anon, authenticated;
grant execute on function public.is_active_profile() to anon, authenticated;
grant execute on function public.is_engineer_or_admin() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.admin_set_profile_access(uuid, text, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sensor_readings'
  ) then
    alter publication supabase_realtime add table public.sensor_readings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alert_events'
  ) then
    alter publication supabase_realtime add table public.alert_events;
  end if;
end;
$$;

-- Promote the first administrator manually after creating their Auth user:
-- update public.profiles set role = 'admin' where id = '<REAL_AUTH_USER_UUID>';
