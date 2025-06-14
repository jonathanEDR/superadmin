const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const cobroService = require('../services/cobroService');
const moment = require('moment-timezone');
const mongoose = require('mongoose');

// Middleware de validación mejorado
const validateCobroData = (req, res, next) => {
  const { ventas, distribucionPagos, yape, efectivo, gastosImprevistos } = req.body;

  try {
    // Validar estructura de ventas
    if (!ventas || !Array.isArray(ventas) || ventas.length === 0) {
      throw new Error('Debe seleccionar al menos una venta');
    }

    // Validar distribucionPagos
    if (!distribucionPagos || !Array.isArray(distribucionPagos) || distribucionPagos.length === 0) {
      throw new Error('La distribución de pagos es requerida');
    }

    // Validar que cada elemento en distribucionPagos tenga los campos necesarios
    distribucionPagos.forEach((item, index) => {
      if (!item.ventaId || !item.montoPagado || !item.montoOriginal || item.montoPendiente === undefined) {
        throw new Error(`Distribución de pago en posición ${index} no tiene todos los campos requeridos`);
      }

      // Convertir valores a números y validar
      const montoPagado = Number(item.montoPagado);
      const montoOriginal = Number(item.montoOriginal);
      const montoPendiente = Number(item.montoPendiente);

      if (isNaN(montoPagado) || montoPagado < 0) {
        throw new Error(`Monto pagado inválido en distribución ${index}`);
      }
      if (isNaN(montoOriginal) || montoOriginal < 0) {
        throw new Error(`Monto original inválido en distribución ${index}`);
      }
      if (isNaN(montoPendiente) || montoPendiente < 0) {
        throw new Error(`Monto pendiente inválido en distribución ${index}`);
      }
    });

    // Validar montos
    const montoTotal = ventas.reduce((sum, v) => sum + v.montoPagado, 0);
    const totalMetodosPago = (parseFloat(yape) || 0) + (parseFloat(efectivo) || 0) + (parseFloat(gastosImprevistos) || 0);

    const tolerance = 0.01;
    if (Math.abs(totalMetodosPago - montoTotal) > tolerance) {
      throw new Error(`El total de los métodos de pago (${totalMetodosPago.toFixed(2)}) debe ser igual al monto total (${montoTotal.toFixed(2)})`);
    }

    // Validar gastos imprevistos
    if (gastosImprevistos && gastosImprevistos < 0) {
      throw new Error('Los gastos imprevistos no pueden ser negativos');
    }

    // Validar que los IDs de venta sean válidos
    const ventasIds = ventas.map(v => v.ventaId);
    if (!ventasIds.every(id => mongoose.Types.ObjectId.isValid(id))) {
      throw new Error('Uno o más IDs de venta no son válidos');
    }

    next();
  } catch (error) {
    res.status(400).json({ 
      message: 'Error de validación', 
      error: error.message 
    });
  }
};

// Obtener resumen de cobros (dashboard)
router.get('/resumen', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id;
    
    // Obtener cobros del último mes
    const unMesAtras = new Date();
    unMesAtras.setMonth(unMesAtras.getMonth() - 1);
      const resumen = await cobroService.getResumen(userId);    res.json({
      totalCobrado: resumen.totalDebt,
      ventasPendientes: resumen.pendingVentasCount,
      montoPendiente: resumen.totalDebt
    });
  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({ 
      message: 'Error al obtener el resumen',
      error: error.message 
    });
  }
});

// Ruta para obtener ventas pendientes
router.get('/ventas-pendientes', authenticate, async (req, res) => {
  try {    const { clerk_id: userId, role } = req.user;
    console.log('Solicitando ventas pendientes para usuario:', userId, 'con rol:', role);
    
    const ventas = await cobroService.getVentasPendientes(userId, role);
    
    res.json({
      ventas,
      total: ventas.length
    });
  } catch (error) {
    console.error('Error al obtener ventas pendientes:', error);
    res.status(500).json({ 
      message: 'Error al obtener las ventas pendientes',
      error: error.message
    });
  }
});

// Obtener historial de pagos
router.get('/historial', authenticate, async (req, res) => {
  try {
    const { clerk_id: userId, role } = req.user;
    console.log('Solicitando historial de pagos para usuario:', userId, 'con rol:', role);
    
    const historial = await cobroService.getPaymentHistory(userId, role);
    
    res.json({
      cobros: historial,
      total: historial.length
    });
   
  } catch (error) {
    console.error('Error al obtener historial de pagos:', error);
    res.status(500).json({ 
      message: 'Error al obtener el historial de pagos',
      error: error.message 
    });
  }
});

// Crear nuevo cobro
router.post('/', authenticate, validateCobroData, async (req, res) => {
  try {
    const { clerk_id: userId, name: userName, email: userEmail } = req.user;
    
    // Preparar los datos del cobro
    const cobroData = {
      ...req.body,
      userId,
      creatorId: userId,
      creatorName: userName || 'Usuario',
      creatorEmail: userEmail,
      descripcion: req.body.descripcion || '', // Asegurarnos de incluir la descripción
      fechaCobro: new Date(),
    };    console.log('Datos de cobro preparados:', {
      userId,
      creatorName: cobroData.creatorName,
      descripcion: cobroData.descripcion,
      ventasCount: cobroData.ventas?.length,
      distribucionPagosCount: cobroData.distribucionPagos?.length,
      montos: {
        montoTotal: cobroData.montoTotalVentas,
        montoPagado: cobroData.montoPagado,
        yape: cobroData.yape,
        efectivo: cobroData.efectivo,
        gastosImprevistos: cobroData.gastosImprevistos,
        total: (cobroData.yape || 0) + (cobroData.efectivo || 0) + (cobroData.gastosImprevistos || 0)
      }
    });

    const nuevoCobro = await cobroService.createCobro(cobroData);
    console.log('Cobro creado exitosamente');

    res.status(201).json({
      success: true,
      cobro: nuevoCobro
    });
  } catch (error) {
    console.error('Error al crear cobro:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al crear el cobro',
      error: error.message
    });
  }
});

// Obtener detalle de un cobro
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id;
    const { id } = req.params;

    const cobro = await cobroService.getCobros(userId, {
      filter: { _id: id }
    });

    if (!cobro || cobro.length === 0) {
      return res.status(404).json({ 
        message: 'Cobro no encontrado' 
      });
    }

    res.json(cobro[0]);
  } catch (error) {
    console.error('Error al obtener detalle del cobro:', error);
    res.status(500).json({ 
      message: 'Error al obtener el detalle del cobro',
      error: error.message 
    });
  }
});

// Actualizar un cobro
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id;
    const { id } = req.params;
    const { yape, efectivo, montoPagado } = req.body;

    // Validar que haya al menos un campo para actualizar
    if (!yape && !efectivo && !montoPagado && Object.keys(req.body).length === 0) {
      throw new Error('Debe proporcionar al menos un campo para actualizar');
    }

    // Si se actualizan montos, validar que sean números válidos
    if (yape !== undefined || efectivo !== undefined || montoPagado !== undefined) {
      const montos = [
        yape !== undefined ? yape : null,
        efectivo !== undefined ? efectivo : null,
        montoPagado !== undefined ? montoPagado : null
      ].filter(m => m !== null).map(m => parseFloat(m) || 0);

      if (montos.some(m => m < 0)) {
        throw new Error('Los montos no pueden ser negativos');
      }

      // Si se proporcionan tanto yape como efectivo y monto total, validar la suma
      if (yape !== undefined && efectivo !== undefined && montoPagado !== undefined) {
        if (parseFloat(yape) + parseFloat(efectivo) !== parseFloat(montoPagado)) {
          throw new Error('La suma de Yape y Efectivo debe ser igual al monto total');
        }
      }

      // Convertir los valores a números en el body
      if (yape !== undefined) req.body.yape = parseFloat(yape);
      if (efectivo !== undefined) req.body.efectivo = parseFloat(efectivo);
      if (montoPagado !== undefined) req.body.montoPagado = parseFloat(montoPagado);
    }

    const cobroActualizado = await cobroService.updateCobro(userId, id, req.body);

    // Formatear la fecha en la respuesta
    const cobroResponse = {
      ...cobroActualizado,
      fechaPago: moment(cobroActualizado.fechaPago)
        .tz('America/Lima')
        .format('YYYY-MM-DD')
    };

    res.json(cobroResponse);
  } catch (error) {
    console.error('Error al actualizar cobro:', error);
    res.status(error.message.includes('no encontrado') ? 404 : 500).json({ 
      message: 'Error al actualizar el cobro',
      error: error.message 
    });
  }
});

// Anular un cobro
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que el ID sea válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: 'ID de cobro inválido'
      });
    }

    await cobroService.anularCobro(id);
    
    res.json({
      message: 'Cobro anulado exitosamente'
    });
  } catch (error) {
    console.error('Error al anular cobro:', error);
    res.status(error.message.includes('no encontrado') ? 404 : 500).json({
      message: 'Error al anular el cobro',
      error: error.message
    });
  }
});

// Obtener historial de cobros con paginación
router.get('/', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await cobroService.getCobrosHistorial(page, limit);
    res.json(result);
  } catch (error) {
    console.error('Error al obtener historial de cobros:', error);
    res.status(500).json({
      message: 'Error al obtener el historial de cobros',
      error: error.message
    });
  }
});

module.exports = router;
