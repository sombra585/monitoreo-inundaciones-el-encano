import { SYSTEM_CONFIG } from '../config'

export function calculateWaterHeight(distanceSensorCm, baseCm = SYSTEM_CONFIG.distanceBaseCm) {
  const distance = Number(distanceSensorCm)
  const base = Number(baseCm)
  if (!Number.isFinite(distance) || distance < 2 || distance > base || !Number.isFinite(base)) return null
  return Math.max(0, Math.min(base, base - distance))
}

export function isWaterReadingValid(reading) {
  if (!reading || reading.water_status === 'SIN_LECTURA') return false
  const distance = Number(reading.water_distance_cm)
  const height = Number(reading.water_height_cm)
  return reading.water_distance_cm != null &&
    reading.water_height_cm != null &&
    Number.isFinite(distance) &&
    Number.isFinite(height)
}

export function classifyWaterLevel(heightCm, thresholds = SYSTEM_CONFIG.waterThresholds) {
  const height = Number(heightCm)
  if (!Number.isFinite(height) || heightCm === null || heightCm === undefined) return 'SIN_LECTURA'
  if (height >= thresholds.critical) return 'PELIGRO_CRITICO'
  if (height >= thresholds.danger) return 'PELIGRO'
  if (height >= thresholds.warning) return 'ADVERTENCIA'
  return 'NORMAL'
}

export function classifyRain(adc) {
  if (!Number.isInteger(adc) || adc < 0 || adc > SYSTEM_CONFIG.rainVoltageThresholds.maxAdc) return 'SIN_LECTURA'
  const voltage = adc * SYSTEM_CONFIG.rainVoltageThresholds.referenceVoltage /
    SYSTEM_CONFIG.rainVoltageThresholds.maxAdc
  if (voltage >= SYSTEM_CONFIG.rainVoltageThresholds.moderateMax) return 'SIN_LLUVIA'
  if (voltage > SYSTEM_CONFIG.rainVoltageThresholds.excessiveMax) return 'LLUVIA_MODERADA'
  return 'LLUVIA_EXCESIVA'
}

export function calculateSoilPercent(adc) {
  if (!Number.isInteger(adc) || adc < 0 || adc > 4095) return null
  const { dryAdc, wetAdc } = SYSTEM_CONFIG.soilCalibration
  return Math.max(0, Math.min(100, (dryAdc - adc) * 100 / (dryAdc - wetAdc)))
}

export function classifySoil(percent) {
  if (percent === null || percent === undefined || !Number.isFinite(Number(percent))) return 'SIN_LECTURA'
  const value = Number(percent)
  if (value >= 80) return 'HUMEDAD_EXCESIVA'
  if (value >= 60) return 'HUMEDAD_PREVENTIVA'
  if (value >= 30) return 'HUMEDAD_NORMAL'
  return 'SECO'
}

export function calculateGeneralRisk(waterStatus, rainStatus, soilStatus) {
  if (waterStatus === 'PELIGRO_CRITICO') return 'PELIGRO_CRITICO'
  const extremeEnvironment = rainStatus === 'LLUVIA_EXCESIVA' || soilStatus === 'HUMEDAD_EXCESIVA'
  if (waterStatus === 'PELIGRO' || (waterStatus === 'ADVERTENCIA' && extremeEnvironment)) return 'PELIGRO'

  const environmentalCaution = rainStatus === 'LLUVIA_MODERADA' ||
    rainStatus === 'LLUVIA_EXCESIVA' ||
    soilStatus === 'HUMEDAD_PREVENTIVA' ||
    soilStatus === 'HUMEDAD_EXCESIVA'
  if (waterStatus === 'ADVERTENCIA' || environmentalCaution) return 'ADVERTENCIA'

  if ([waterStatus, rainStatus, soilStatus].includes('SIN_LECTURA')) return 'SIN_LECTURA'
  return 'NORMAL'
}

export function normalizeRisk(value) {
  const risk = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (risk.includes('CRITIC')) return 'PELIGRO_CRITICO'
  if (risk.includes('PELIG')) return 'PELIGRO'
  if (risk.includes('ADVERT') || risk.includes('PRECAUC')) return 'ADVERTENCIA'
  if (risk.includes('NORMAL')) return 'NORMAL'
  return 'SIN_LECTURA'
}

export function getRiskKey(risk) {
  const value = String(risk || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const keys = {
    SIN_LLUVIA: 'sin_lluvia',
    LLUVIA_MODERADA: 'lluvia_moderada',
    LLUVIA_EXCESIVA: 'lluvia_excesiva',
    SECO: 'seco',
    HUMEDAD_NORMAL: 'humedad_normal',
    HUMEDAD_PREVENTIVA: 'humedad_preventiva',
    HUMEDAD_EXCESIVA: 'humedad_excesiva',
  }
  return keys[value] || normalizeRisk(risk).toLowerCase()
}

export function describeRisk(value) {
  const labels = {
    NORMAL: 'Normal',
    ADVERTENCIA: 'Advertencia',
    PELIGRO: 'Peligro',
    PELIGRO_CRITICO: 'Peligro crítico',
    SIN_LECTURA: 'Sin lectura',
  }
  return labels[normalizeRisk(value)]
}

export function describeRain(value) {
  const labels = {
    SIN_LLUVIA: 'Sin lluvia detectada',
    LLUVIA_MODERADA: 'Humedad moderada en la placa',
    LLUVIA_EXCESIVA: 'Humedad alta en la placa',
    SIN_LECTURA: 'Sin lectura',
  }
  return labels[String(value || 'SIN_LECTURA').toUpperCase()] || 'Sin lectura'
}

export function describeSoil(value) {
  const labels = {
    SECO: 'Suelo seco',
    HUMEDAD_NORMAL: 'Humedad normal',
    HUMEDAD_PREVENTIVA: 'Humedad preventiva',
    HUMEDAD_EXCESIVA: 'Humedad excesiva',
    SIN_LECTURA: 'Sin lectura',
  }
  return labels[String(value || 'SIN_LECTURA').toUpperCase()] || 'Sin lectura'
}

export function getEnvironmentalWarning(rainStatus, soilStatus) {
  const rain = String(rainStatus || '').toUpperCase()
  const soil = String(soilStatus || '').toUpperCase()
  if (rain === 'LLUVIA_EXCESIVA' && soil === 'HUMEDAD_EXCESIVA') {
    return 'Condiciones ambientales desfavorables: humedad alta en la placa de lluvia y en el suelo. No confirma una inundación.'
  }
  if (rain === 'LLUVIA_EXCESIVA') {
    return 'La placa de lluvia detecta humedad alta; es un indicador cualitativo, no una medición de mm/h.'
  }
  if (soil === 'HUMEDAD_EXCESIVA') return 'El suelo presenta humedad estimada elevada; esto no confirma una inundación.'
  if (rain === 'LLUVIA_MODERADA') return 'La placa de lluvia detecta humedad moderada; es un indicador cualitativo.'
  if (soil === 'HUMEDAD_PREVENTIVA') return 'La humedad estimada del suelo alcanzó el rango preventivo.'
  if (rain === 'SIN_LECTURA' || soil === 'SIN_LECTURA') {
    return 'Falta la lectura de uno o más sensores; revisa la calidad de datos del dispositivo.'
  }
  return null
}
