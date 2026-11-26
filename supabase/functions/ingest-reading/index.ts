
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-device-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function respond(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isAdc(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 4095
}

function isDistance(value: unknown): value is number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 2 &&
    value <= 20
}

async function hashToken(token: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const url = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const admin = url && serviceRoleKey
  ? createClient(url, serviceRoleKey)
  : null

async function manageAlert(
  deviceId: string,
  readingId: number,
  category: string,
  severity: 'ADVERTENCIA' | 'PELIGRO' | null,
  title: string,
  description: string,
) {
  const { data: existing, error: searchError } = await admin!
    .from('alert_events')
    .select('id')
    .eq('device_id', deviceId)
    .eq('category', category)
    .in('status', ['OPEN', 'ACKNOWLEDGED'])
    .limit(1)

  if (searchError) throw searchError

  if (!severity) {
    if (existing && existing.length > 0) {
      const { error } = await admin!
        .from('alert_events')
        .update({
          status: 'RESOLVED',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id)

      if (error) throw error
    }
    return
  }

  if (existing && existing.length > 0) {
    const { error } = await admin!
      .from('alert_events')
      .update({
        reading_id: readingId,
        severity,
        title,
        description,
      })
      .eq('id', existing[0].id)

    if (error) throw error
    return
  }

  const { error } = await admin!
    .from('alert_events')
    .insert({
      device_id: deviceId,
      reading_id: readingId,
      category,
      severity,
      title,
      description,
      status: 'OPEN',
    })

  if (error) throw error
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return respond({ error: 'Método no permitido.' }, 405)
  }

  if (!admin) {
    return respond({
      error: 'La función no tiene configuración de Supabase.',
    }, 500)
  }

  try {
    // 1. Validar token del dispositivo
    const token = (request.headers.get('x-device-token') || '').trim()

    if (token.length < 32 || token.length > 256) {
      return respond({ error: 'Token de dispositivo inválido.' }, 401)
    }

    const tokenHash = await hashToken(token)

    const { data: credential, error: credentialError } = await admin
      .from('device_credentials')
      .select('device_id')
      .eq('token_hash', tokenHash)
      .eq('active', true)
      .maybeSingle()

    if (credentialError) {
      console.error(
        'ERROR CONSULTANDO CREDENCIAL:',
        credentialError.message,
      )

      return respond({
        error: 'Error consultando la credencial del dispositivo.',
      }, 500)
    }

    if (!credential) {
      console.error(
        'CREDENCIAL NO ENCONTRADA. Longitud del token:',
        token.length,
      )

      return respond({ error: 'Dispositivo no autorizado.' }, 401)
    }

    const deviceId = credential.device_id

    // 2. Comprobar dispositivo activo
    const { data: device, error: deviceError } = await admin
      .from('devices')
      .select('id, active')
      .eq('id', deviceId)
      .maybeSingle()

    if (deviceError || !device || !device.active) {
      console.error('ERROR VALIDANDO DISPOSITIVO:', deviceError?.message)

      return respond({ error: 'El dispositivo está inactivo.' }, 403)
    }

    // 3. Leer JSON
    let payload: Record<string, unknown>

    try {
      const body = await request.json()

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return respond({ error: 'El cuerpo debe ser un objeto JSON.' }, 400)
      }

      payload = body as Record<string, unknown>
    } catch {
      return respond({ error: 'JSON inválido.' }, 400)
    }

    // 4. Validar sensores
    if (
      !Object.prototype.hasOwnProperty.call(payload, 'water_distance_cm') ||
      !Object.prototype.hasOwnProperty.call(payload, 'rain_adc') ||
      !Object.prototype.hasOwnProperty.call(payload, 'soil_adc')
    ) {
      return respond({
        error: 'Faltan water_distance_cm, rain_adc o soil_adc.',
      }, 400)
    }

    const waterDistance = payload.water_distance_cm
    const rainAdc = payload.rain_adc
    const soilAdc = payload.soil_adc

    if (waterDistance !== null && !isDistance(waterDistance)) {
      return respond({
        error: 'La distancia del agua debe estar entre 2 y 20 cm o ser null.',
      }, 400)
    }

    if (rainAdc !== null && !isAdc(rainAdc)) {
      return respond({
        error: 'rain_adc debe estar entre 0 y 4095 o ser null.',
      }, 400)
    }

    if (soilAdc !== null && !isAdc(soilAdc)) {
      return respond({
        error: 'soil_adc debe estar entre 0 y 4095 o ser null.',
      }, 400)
    }

    // 5. Obtener umbrales del dispositivo
    const { data: thresholds, error: thresholdError } = await admin
      .from('threshold_configs')
      .select('*')
      .eq('device_id', deviceId)
      .single()

    if (thresholdError || !thresholds) {
      console.error(
        'Error consultando umbrales:',
        thresholdError?.message,
      )

      return respond({
        error: 'No se encontraron los umbrales del dispositivo.',
      }, 500)
    }

    // 6. Calcular nivel de agua
    // Referencia entre la base y el sensor: 20 cm.
    const waterHeight = waterDistance === null
      ? null
      : Math.max(0, 20 - waterDistance)

    const waterStatus = waterHeight === null
      ? 'SIN_LECTURA'
      : waterHeight >= Number(thresholds.water_danger_cm)
        ? 'PELIGRO'
        : waterHeight >= Number(thresholds.water_warning_cm)
          ? 'ADVERTENCIA'
          : 'NORMAL'

    // 7. Calcular lluvia
    const rainVoltage = rainAdc === null
      ? null
      : rainAdc * 3.3 / 4095

    const rainStatus = rainVoltage === null
      ? 'SIN_LECTURA'
      : rainVoltage <= Number(thresholds.rain_excessive_voltage)
        ? 'LLUVIA_EXCESIVA'
        : rainVoltage < Number(thresholds.rain_dry_voltage)
          ? 'LLUVIA_MODERADA'
          : 'SIN_LLUVIA'

    // 8. Calcular humedad del suelo
    // Calibración inicial: 4095 seco, 1500 húmedo.
    const soilPercent = soilAdc === null
      ? null
      : Math.max(
          0,
          Math.min(100, (4095 - soilAdc) * 100 / (4095 - 1500)),
        )

    const soilStatus = soilPercent === null
      ? 'SIN_LECTURA'
      : soilPercent >= Number(thresholds.soil_excessive_pct)
        ? 'HUMEDAD_EXCESIVA'
        : soilPercent >= Number(thresholds.soil_preventive_pct)
          ? 'HUMEDAD_PREVENTIVA'
          : soilPercent >= Number(thresholds.soil_warning_pct)
            ? 'HUMEDAD_NORMAL'
            : 'SECO'

    // 9. Determinar riesgo general
    const allMissing =
      waterHeight === null &&
      rainVoltage === null &&
      soilPercent === null

    const danger =
      waterStatus === 'PELIGRO' ||
      rainStatus === 'LLUVIA_EXCESIVA' ||
      soilStatus === 'HUMEDAD_EXCESIVA'

    const warning =
      waterStatus === 'ADVERTENCIA' ||
      rainStatus === 'LLUVIA_MODERADA' ||
      soilStatus === 'HUMEDAD_PREVENTIVA'

    const generalRisk = allMissing
      ? 'SIN_DATOS'
      : danger
        ? 'PELIGRO'
        : warning
          ? 'ADVERTENCIA'
          : 'NORMAL'

    const buzzerActive =
      waterHeight !== null &&
      waterHeight >= Number(thresholds.water_buzzer_cm)

    // 10. Guardar medición
    const { data: reading, error: insertError } = await admin
      .from('sensor_readings')
      .insert({
        device_id: deviceId,
        water_distance_cm: waterDistance,
        water_height_cm: waterHeight,
        water_status: waterStatus,
        rain_adc: rainAdc,
        rain_voltage: rainVoltage,
        rain_status: rainStatus,
        soil_adc: soilAdc,
        soil_percent: soilPercent,
        soil_status: soilStatus,
        general_risk: generalRisk,
        buzzer_active: buzzerActive,
      })
      .select()
      .single()

    if (insertError || !reading) {
      console.error('Error guardando lectura:', insertError?.message)

      return respond({
        error: 'No se pudo guardar la medición.',
      }, 500)
    }

    // 11. Actualizar última comunicación
    const { error: contactError } = await admin
      .from('devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', deviceId)

    if (contactError) {
      console.error(
        'Error actualizando dispositivo:',
        contactError.message,
      )

      return respond({
        error: 'La lectura se guardó, pero no se actualizó la conexión.',
        reading_id: reading.id,
      }, 500)
    }

    // 12. Administrar alertas
    const waterSeverity =
      waterStatus === 'PELIGRO' ? 'PELIGRO'
        : waterStatus === 'ADVERTENCIA' ? 'ADVERTENCIA'
          : null

    const rainSeverity =
      rainStatus === 'LLUVIA_EXCESIVA' ? 'PELIGRO'
        : rainStatus === 'LLUVIA_MODERADA' ? 'ADVERTENCIA'
          : null

    const soilSeverity =
      soilStatus === 'HUMEDAD_EXCESIVA' ? 'PELIGRO'
        : soilStatus === 'HUMEDAD_PREVENTIVA' ? 'ADVERTENCIA'
          : null

    await manageAlert(
      deviceId,
      reading.id,
      'AGUA',
      waterSeverity,
      'Nivel de agua elevado',
      `Altura registrada: ${waterHeight ?? 'Sin lectura'} cm. Estado: ${waterStatus}.`,
    )

    await manageAlert(
      deviceId,
      reading.id,
      'LLUVIA',
      rainSeverity,
      'Detección de lluvia',
      `Voltaje registrado: ${rainVoltage?.toFixed(2) ?? 'Sin lectura'} V. Estado: ${rainStatus}.`,
    )

    await manageAlert(
      deviceId,
      reading.id,
      'HUMEDAD',
      soilSeverity,
      'Humedad del suelo elevada',
      `Humedad registrada: ${soilPercent?.toFixed(1) ?? 'Sin lectura'} %. Estado: ${soilStatus}.`,
    )

    return respond({
      accepted: true,
      device_id: deviceId,
      reading_id: reading.id,
      water_height_cm: waterHeight,
      water_status: waterStatus,
      rain_voltage: rainVoltage,
      rain_status: rainStatus,
      soil_percent: soilPercent,
      soil_status: soilStatus,
      general_risk: generalRisk,
      buzzer_active: buzzerActive,
    }, 201)

  } catch (error) {
    console.error('Error procesando medición:', error)

    return respond({
      error: 'Error interno procesando la medición.',
    }, 500)
  }
})
