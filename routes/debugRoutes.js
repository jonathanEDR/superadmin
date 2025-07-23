/**
 * Script para debugging de fechas en producción
 * Usar con: curl -X POST http://tu-servidor/api/debug/fechas
 */

const express = require('express');
const router = express.Router();
const { getFechaHoraActual, formatearFecha, convertirFechaFrontendAPeruUTC } = require('../utils/fechaHoraUtils');

// Endpoint para debugging de fechas (solo en desarrollo)
router.post('/fechas', (req, res) => {
  try {
    const ahora = new Date();
    const fechaPeruUTC = getFechaHoraActual();
    
    const debugInfo = {
      entorno: process.env.NODE_ENV || 'development',
      servidorTZ: process.env.TZ || 'Sistema',
      fechaSistema: ahora.toISOString(),
      fechaSistemaLocal: ahora.toLocaleString(),
      fechaPeruUTC: fechaPeruUTC,
      fechaPeruFormateada: formatearFecha(fechaPeruUTC),
      fechaPeruLocal: new Date(fechaPeruUTC).toLocaleString('es-PE', { timeZone: 'America/Lima' }),
      offsetSistema: ahora.getTimezoneOffset(),
      pruebaConversion: {
        entrada: '2025-07-23T14:30',
        salida: convertirFechaFrontendAPeruUTC('2025-07-23T14:30'),
        salidaFormateada: formatearFecha(convertirFechaFrontendAPeruUTC('2025-07-23T14:30'))
      }
    };

    console.log('🧪 DEBUG FECHAS:', JSON.stringify(debugInfo, null, 2));
    
    res.json({
      success: true,
      message: 'Debug de fechas completado',
      data: debugInfo
    });
  } catch (error) {
    console.error('Error en debug de fechas:', error);
    res.status(500).json({
      success: false,
      message: 'Error en debug de fechas',
      error: error.message
    });
  }
});

module.exports = router;
