import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-device-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

async function hashToken(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function respond(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

const url = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const admin = url && serviceRoleKey ? createClient(url, serviceRoleKey) : null

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'GET') return respond({ error: 'Método no permitido.' }, 405)
  if (!admin) return respond({ error: 'La función no tiene configuración de Supabase.' }, 500)

  const token = request.headers.get('x-device-token') || ''
  if (token.length < 32 || token.length > 256) return respond({ error: 'Dispositivo no autorizado.' }, 401)

  const { data: credential, error: credentialError } = await admin
    .from('device_credentials')
    .select('device_id, devices!inner(active)')
    .eq('token_hash', await hashToken(token))
    .eq('active', true)
    .eq('devices.active', true)
    .maybeSingle()
  if (credentialError || !credential) return respond({ error: 'Dispositivo no autorizado.' }, 401)

  const [{ data: thresholds, error: thresholdsError }, { data: settings, error: settingsError }] =
    await Promise.all([
      admin.from('threshold_configs').select('*').eq('id', true).single(),
      admin.from('system_settings').select('*').eq('id', true).single(),
    ])
  if (thresholdsError || settingsError || !thresholds || !settings) {
    return respond({ error: 'No se pudo obtener la configuración vigente.' }, 500)
  }

  await admin.from('device_credentials')
    .update({ last_used_at: new Date().toISOString() })
    .eq('device_id', credential.device_id)

  return respond({
    config_version: Math.max(Number(thresholds.version), Number(settings.version)),
    thresholds: {
      water_base_cm: thresholds.water_base_cm,
      warning_from_cm: thresholds.warning_from_cm,
      danger_from_cm: thresholds.danger_from_cm,
      critical_from_cm: thresholds.critical_from_cm,
    },
    buzzer: {
      enabled: settings.buzzer_enabled,
      active_level: 'LOW',
      gpio: 33,
      activation_height_cm: 3,
      on_ms: settings.buzzer_on_ms,
      off_ms: settings.buzzer_off_ms,
    },
    stale_after_seconds: settings.stale_after_seconds,
  }, 200)
})
