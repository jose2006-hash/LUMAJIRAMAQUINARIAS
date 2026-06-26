export const ALERT_THRESHOLDS = {
  current: {
    warning: 8.0,
    critical: 10.0,
    unit: 'A',
    label: 'Corriente SCT-013',
  },
  temperature: {
    low_warning: 100.0,
    low_critical: 80.0,
    high_warning: 240.0,
    high_critical: 260.0,
    unit: '°C',
    label: 'Temperatura NTC-10K',
  },
};

export function analyzeCurrentReading(amps) {
  if (amps >= ALERT_THRESHOLDS.current.critical) {
    return {
      level: 'critical',
      color: '#e24b4a',
      bg: '#fcebeb',
      message: `⚡ ALERTA CRÍTICA: Corriente ${amps.toFixed(1)}A supera límite crítico. Detener máquina.`,
      maintenance: 'Inspección inmediata de resistencias de banda. Posible cortocircuito.',
    };
  }
  if (amps >= ALERT_THRESHOLDS.current.warning) {
    return {
      level: 'warning',
      color: '#ba7517',
      bg: '#faeeda',
      message: `⚠️ ADVERTENCIA: Corriente ${amps.toFixed(1)}A elevada. Monitorear de cerca.`,
      maintenance: 'Revisar resistencias de banda en próximas 2 horas. Posible desgaste.',
    };
  }
  if (amps < 0.5) {
    return {
      level: 'warning',
      color: '#ba7517',
      bg: '#faeeda',
      message: `⚠️ ADVERTENCIA: Corriente muy baja (${amps.toFixed(1)}A). Verificar conexiones.`,
      maintenance: 'Verificar que las resistencias están encendidas y bien conectadas.',
    };
  }
  return {
    level: 'normal',
    color: '#0f6e56',
    bg: '#e1f5ee',
    message: `✅ Corriente normal: ${amps.toFixed(1)}A`,
    maintenance: null,
  };
}

export function analyzeTemperatureReading(tempC) {
  if (tempC >= ALERT_THRESHOLDS.temperature.high_critical) {
    return {
      level: 'critical',
      color: '#e24b4a',
      bg: '#fcebeb',
      message: `🔥 ALERTA CRÍTICA: Temperatura ${tempC.toFixed(1)}°C supera límite máximo. Detener máquina.`,
      maintenance: 'Verificar resistencias de banda y termostato. Riesgo de daño al equipo.',
    };
  }
  if (tempC >= ALERT_THRESHOLDS.temperature.high_warning) {
    return {
      level: 'warning',
      color: '#ba7517',
      bg: '#faeeda',
      message: `⚠️ ADVERTENCIA: Temperatura ${tempC.toFixed(1)}°C elevada. Monitorear de cerca.`,
      maintenance: 'Revisar configuración de PID y flujo de aire de enfriamiento.',
    };
  }
  if (tempC <= ALERT_THRESHOLDS.temperature.low_critical) {
    return {
      level: 'critical',
      color: '#e24b4a',
      bg: '#fcebeb',
      message: `❄️ ALERTA CRÍTICA: Temperatura ${tempC.toFixed(1)}°C muy baja. Verificar calentador.`,
      maintenance: 'Verificar conexiones del calentador y termistor. Posible fallo en calefacción.',
    };
  }
  if (tempC <= ALERT_THRESHOLDS.temperature.low_warning) {
    return {
      level: 'warning',
      color: '#ba7517',
      bg: '#faeeda',
      message: `⚠️ ADVERTENCIA: Temperatura ${tempC.toFixed(1)}°C baja. Calentando...`,
      maintenance: 'Esperar a que la temperatura alcance el rango operativo.',
    };
  }
  return {
    level: 'normal',
    color: '#0f6e56',
    bg: '#e1f5ee',
    message: `✅ Temperatura normal: ${tempC.toFixed(1)}°C`,
    maintenance: null,
  };
}

export function predictiveMaintenance(readings) {
  if (!readings || readings.length < 5) return null;
  const recent = readings.slice(-20);
  const avg = recent.reduce((s, r) => s + r.value, 0) / recent.length;
  const trend = recent.slice(-5).reduce((s, r) => s + r.value, 0) / 5 - avg;
  const alerts = [];
  if (trend > 0.5) {
    alerts.push({
      type: 'trend',
      level: 'warning',
      message: 'Tendencia creciente de corriente detectada. Revisar calentamiento de resistencias.',
    });
  }
  const variance = recent.reduce((s, r) => s + Math.pow(r.value - avg, 2), 0) / recent.length;
  if (variance > 1.5) {
    alerts.push({
      type: 'instability',
      level: 'warning',
      message: 'Corriente inestable detectada. Posible falla en resistencia de banda.',
    });
  }
  return alerts;
}
