/**
 * Script para debugging de fechas en producción
 * Usar con: curl -X POST http://tu-servidor/api/debug/fechas
 */

const express = require('express');
const router = express.Router();
const { getFechaHoraActual, formatearFecha, convertirFechaFrontendAPeruUTC } = require('../utils/fechaHoraUtils');
const DebugInventario = require('../utils/debugInventario');
const { authenticate, requireAdmin } = require('../middleware/authenticate');

// Endpoint para debugging de inventario
router.get('/inventario/verificar/:productoId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { productoId } = req.params;
    const resultado = await DebugInventario.verificarProducto(productoId);
    res.json({ 
      success: resultado,
      message: resultado ? 'Producto verificado correctamente' : 'Problemas encontrados con el producto'
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Endpoint para listar productos con problemas
router.get('/inventario/problemas', authenticate, requireAdmin, async (req, res) => {
  try {
    await DebugInventario.listarProductosConProblemas();
    res.json({ message: 'Revisa la consola del servidor para ver los problemas encontrados' });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Endpoint para simular creación de entrada
router.post('/inventario/simular', authenticate, requireAdmin, async (req, res) => {
  try {
    const { productoId, cantidad, precio } = req.body;
    if (!productoId || !cantidad || !precio) {
      return res.status(400).json({ 
        error: 'Faltan parámetros requeridos: productoId, cantidad, precio' 
      });
    }
    
    await DebugInventario.simularCreacionEntrada(productoId, cantidad, precio);
    res.json({ message: 'Simulación completada - revisa la consola del servidor' });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

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
