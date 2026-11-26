export const SYSTEM_CONFIG = {
  distanceBaseCm: 20,
  waterThresholds: {
    warning: 2,
    danger: 2.5,
    critical: 3,
  },
  soilCalibration: { dryAdc: 4095, wetAdc: 1500 },
  rainVoltageThresholds: { excessiveMax: 1.5, moderateMax: 2.6, referenceVoltage: 3.3, maxAdc: 4095 },
  staleAfterSeconds: 180,
}
