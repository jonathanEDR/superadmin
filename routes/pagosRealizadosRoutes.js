const express = require('express');
const router = express.Router();
const PagoRealizado = require('../models/PagoRealizado');
const User = require('../models/User');
const GestionPersonal = require('../models/GestionPersonal');
const CajaService = require('../services/cajaService');
const MovimientoCaja = require('../models/MovimientoCaja');
const Gasto = require('../models/Gasto');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

/**
 * @route GET /api/pagos-realizados
 * @desc Obtener todos los pagos realizados (sin importar quién los creó)
 */
router.get('/', async (req, res) => {
  try {
    // Buscar todos los pagos realizados (sin filtrar por creadoPor)
    const pagos = await PagoRealizado.find({})
      .sort({ fechaPago: -1 });

    // Obtener info de colaborador manualmente
    const pagosConColaborador = await Promise.all(pagos.map(async (pago) => {
      const colaborador = await User.findOne({ clerk_id: pago.colaboradorUserId });
      return {
        ...pago.toObject(),
        colaborador: colaborador ? {
          nombre: colaborador.nombre_negocio,
          departamento: colaborador.departamento,
          sueldo: colaborador.sueldo,
          email: colaborador.email,
          clerk_id: colaborador.clerk_id,
          colaboradorUserId: colaborador.clerk_id
        } : null
      };
    }));

    res.json(pagosConColaborador);
  } catch (error) {
    console.error('Error al obtener pagos realizados:', error);
    res.status(500).json({ 
      message: 'Error al obtener pagos realizados',
      error: error.message 
    });
  }
});

/**
 * @route GET /api/pagos-realizados/colaborador/:colaboradorUserId
 * @desc Obtener pagos de un colaborador específico (colaboradorUserId = clerk_id)
 */
router.get('/colaborador/:colaboradorUserId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { colaboradorUserId } = req.params;

    const pagos = await PagoRealizado.find({ 
      creadoPor: userId,
      colaboradorUserId: colaboradorUserId 
    }).sort({ fechaPago: -1 });

    const colaborador = await User.findOne({ clerk_id: colaboradorUserId });

    const pagosConColaborador = pagos.map(pago => ({
      ...pago.toObject(),
      colaborador: colaborador ? {
        nombre: colaborador.nombre_negocio,
        departamento: colaborador.departamento,
        sueldo: colaborador.sueldo,
        email: colaborador.email,
        clerk_id: colaborador.clerk_id,
        colaboradorUserId: colaborador.clerk_id
      } : null
    }));

    res.json(pagosConColaborador);
  } catch (error) {
    console.error('Error al obtener pagos del colaborador:', error);
    res.status(500).json({ 
      message: 'Error al obtener pagos del colaborador',
      error: error.message 
    });
  }
});

/**
 * @route POST /api/pagos-realizados
 * @desc Crear un nuevo pago realizado
 */
router.post('/', async (req, res) => {
  try {
    // Usar clerk_id como userId universal
    const userId = req.user.clerk_id || req.user.id;
    const {
      colaboradorUserId, // clerk_id
      fechaPago,
      montoTotal,
      metodoPago,
      periodoInicio,
      periodoFin,
      registrosIncluidos,
      observaciones,
      estado
    } = req.body;

    // LOG: Verificar el payload recibido
    console.log('POST /api/pagos-realizados payload:', req.body);

    // Validaciones básicas
    if (!colaboradorUserId || !montoTotal || montoTotal <= 0) {
      console.log('Falta colaboradorUserId o montoTotal inválido');
      return res.status(400).json({ 
        message: 'Colaborador y monto total son requeridos. El monto debe ser mayor a 0.' 
      });
    }
    // Verificar que el colaborador existe y está activo
    const colaborador = await User.findOne({
      clerk_id: colaboradorUserId,
      is_active: true
    });
    console.log('Colaborador encontrado:', colaborador);
    if (!colaborador) {
      return res.status(404).json({ 
        message: 'Colaborador no encontrado o no autorizado' 
      });
    }
    // Crear el nuevo pago
    const nuevoPago = new PagoRealizado({
      colaboradorUserId, // clerk_id
      fechaPago: fechaPago ? new Date(fechaPago) : new Date(),
      montoTotal: parseFloat(montoTotal),
      metodoPago: metodoPago || 'efectivo',
      periodoInicio: periodoInicio ? new Date(periodoInicio) : null,
      periodoFin: periodoFin ? new Date(periodoFin) : null,
      registrosIncluidos: registrosIncluidos || [],
      observaciones: observaciones || '',
      estado: estado || 'pagado',
      creadoPor: userId,
      userId // <--- AGREGADO para cumplir con el modelo
    });
    const pagoGuardado = await nuevoPago.save();
    // Registrar movimiento en caja
    try {
      await CajaService.registrarPagoPersonal(userId, {
        _id: pagoGuardado._id,
        colaboradorNombre: colaborador.nombre_negocio,
        montoTotal: pagoGuardado.montoTotal,
        fechaPago: pagoGuardado.fechaPago,
        metodoPago: pagoGuardado.metodoPago
      });
    } catch (cajaError) {
      console.error('Error al registrar movimiento en caja:', cajaError);
      await PagoRealizado.findByIdAndDelete(pagoGuardado._id);
      throw new Error('Error al registrar el movimiento en caja: ' + cajaError.message);
    }
    // Crear gasto automático para "Pago Personal"
    try {
      const gastoAutomatico = new Gasto({
        userId: userId,
        tipoDeGasto: 'Pago Personal',
        gasto: 'Administración',
        descripcion: `Pago a ${colaborador.nombre_negocio}`,
        costoUnidad: pagoGuardado.montoTotal,
        cantidad: 1,
        montoTotal: pagoGuardado.montoTotal,
        fechaGasto: pagoGuardado.fechaPago,
        referenciaId: pagoGuardado._id,
        referenciaModelo: 'PagoRealizado',
        esAutomatico: true
      });
      
      await gastoAutomatico.save();
      console.log(`Gasto automático creado para pago personal: ${gastoAutomatico._id}`);
    } catch (gastoError) {
      console.error('Error al crear gasto automático:', gastoError);
      await PagoRealizado.findByIdAndDelete(pagoGuardado._id);
      await MovimientoCaja.findOneAndDelete({
        referenciaId: pagoGuardado._id,
        referenciaModelo: 'PagoRealizado',
        userId: userId
      });
      throw new Error('Error al crear el gasto automático: ' + gastoError.message);
    }
    // Poblar el colaborador en la respuesta
    const pagoConColaborador = {
      ...pagoGuardado.toObject(),
      colaborador: {
        nombre: colaborador.nombre_negocio,
        departamento: colaborador.departamento,
        sueldo: colaborador.sueldo,
        email: colaborador.email,
        clerk_id: colaborador.clerk_id,
        colaboradorUserId: colaborador.clerk_id
      }
    };
    res.status(201).json(pagoConColaborador);
  } catch (error) {
    console.error('Error al crear pago realizado:', error);
    res.status(500).json({ 
      message: 'Error al crear pago realizado',
      error: error.message 
    });
  }
});

/**
 * @route PUT /api/pagos-realizados/:id
 * @desc Actualizar un pago realizado
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updateData = req.body;

    // Eliminar campos que no deben ser actualizados
    delete updateData.creadoPor;
    delete updateData._id;

    // Convertir fechas si están presentes
    if (updateData.fechaPago) {
      updateData.fechaPago = new Date(updateData.fechaPago);
    }
    if (updateData.periodoInicio) {
      updateData.periodoInicio = new Date(updateData.periodoInicio);
    }
    if (updateData.periodoFin) {
      updateData.periodoFin = new Date(updateData.periodoFin);
    }

    const pagoActualizado = await PagoRealizado.findOneAndUpdate(
      { _id: id, creadoPor: userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!pagoActualizado) {
      return res.status(404).json({ message: 'Pago no encontrado o no autorizado' });
    }

    // Obtener info de colaborador
    const colaborador = await User.findOne({ clerk_id: pagoActualizado.colaboradorId });

    res.json({
      ...pagoActualizado.toObject(),
      colaborador: colaborador ? {
        nombre: colaborador.nombre_negocio,
        departamento: colaborador.departamento,
        sueldo: colaborador.sueldo,
        email: colaborador.email,
        clerk_id: colaborador.clerk_id
      } : null
    });
  } catch (error) {
    console.error('Error al actualizar pago realizado:', error);
    res.status(500).json({ 
      message: 'Error al actualizar pago realizado',
      error: error.message 
    });
  }
});

/**
 * @route DELETE /api/pagos-realizados/:id
 * @desc Eliminar un pago realizado y su movimiento de caja asociado
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role || 'user';
    const { id } = req.params;

    // Si es admin o super_admin puede eliminar cualquier pago
    let pago;
    if (userRole === 'admin' || userRole === 'super_admin') {
      pago = await PagoRealizado.findOne({ _id: id });
    } else {
      // Usuario normal solo puede eliminar los que creó
      pago = await PagoRealizado.findOne({ _id: id, creadoPor: userId });
    }

    if (!pago) {
      return res.status(404).json({ message: 'Pago no encontrado o no autorizado' });
    }

    let elementosEliminados = ['PagoRealizado'];

    // 1. Buscar y eliminar el movimiento de caja asociado
    try {
      const movimiento = await MovimientoCaja.findOneAndDelete({
        referenciaId: pago._id,
        referenciaModelo: 'PagoRealizado',
        userId: pago.userId // El movimiento puede estar a nombre del creador original
      });
      if (movimiento) elementosEliminados.push('MovimientoCaja');
    } catch (cajaError) {
      console.error('Error al eliminar movimiento de caja:', cajaError);
    }

    // 2. Buscar y eliminar el gasto asociado
    try {
      const gasto = await Gasto.findOneAndDelete({
        referenciaId: pago._id,
        referenciaModelo: 'PagoRealizado',
        userId: pago.userId
      });
      if (gasto) elementosEliminados.push('Gasto');
    } catch (gastoError) {
      console.error('Error al eliminar gasto automático:', gastoError);
    }

    // 3. Eliminar el pago principal
    const pagoEliminado = await PagoRealizado.findByIdAndDelete(id);

    res.json({ 
      message: 'Pago y registros relacionados eliminados exitosamente',
      elementosEliminados,
      pago: pagoEliminado 
    });
  } catch (error) {
    console.error('Error al eliminar pago realizado:', error);
    res.status(500).json({ 
      message: 'Error al eliminar pago realizado',
      error: error.message
    });
  }
});

/**
 * @route GET /api/pagos-realizados/resumen/:colaboradorId
 * @desc Obtener resumen de pagos de un colaborador (colaboradorId = clerk_id)
 */
router.get('/resumen/:colaboradorId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { colaboradorId } = req.params;

    // Obtener todos los pagos del colaborador
    const pagos = await PagoRealizado.find({
      creadoPor: userId,
      colaboradorId: colaboradorId
    });

    // Obtener todos los registros de gestión personal del colaborador
    const registros = await GestionPersonal.find({
      userId: userId,
      colaboradorUserId: colaboradorId
    });

    // Calcular totales
    const totalPagado = pagos.reduce((sum, pago) => sum + pago.montoTotal, 0);
    const totalGenerado = registros.reduce((sum, registro) => sum + (registro.pagodiario || 0), 0);
    const saldoPendiente = totalGenerado - totalPagado;
    const ultimoPago = pagos.sort((a, b) => new Date(b.fechaPago) - new Date(a.fechaPago))[0];

    res.json({
      totalPagado,
      totalGenerado,
      saldoPendiente,
      ultimoPago: ultimoPago || null,
      cantidadPagos: pagos.length,
      cantidadRegistros: registros.length
    });
  } catch (error) {
    console.error('Error al obtener resumen de pagos:', error);
    res.status(500).json({ 
      message: 'Error al obtener resumen de pagos',
      error: error.message 
    });
  }
});

/**
 * @route GET /api/pagos-realizados/estadisticas
 * @desc Obtener estadísticas generales de pagos
 */
router.get('/estadisticas', async (req, res) => {
  try {
    const userId = req.user.id;

    // Estadísticas por método de pago
    const estadisticasPorMetodo = await PagoRealizado.aggregate([
      { $match: { creadoPor: userId } },
      {
        $group: {
          _id: '$metodoPago',
          total: { $sum: '$montoTotal' },
          cantidad: { $sum: 1 }
        }
      }
    ]);

    // Estadísticas por estado
    const estadisticasPorEstado = await PagoRealizado.aggregate([
      { $match: { creadoPor: userId } },
      {
        $group: {
          _id: '$estado',
          total: { $sum: '$montoTotal' },
          cantidad: { $sum: 1 }
        }
      }
    ]);

    // Pagos por mes (últimos 12 meses)
    const hace12Meses = new Date();
    hace12Meses.setMonth(hace12Meses.getMonth() - 12);

    const pagosPorMes = await PagoRealizado.aggregate([
      { 
        $match: { 
          creadoPor: userId,
          fechaPago: { $gte: hace12Meses }
        } 
      },
      {
        $group: {
          _id: {
            año: { $year: '$fechaPago' },
            mes: { $month: '$fechaPago' }
          },
          total: { $sum: '$montoTotal' },
          cantidad: { $sum: 1 }
        }
      },
      { $sort: { '_id.año': 1, '_id.mes': 1 } }
    ]);

    res.json({
      estadisticasPorMetodo,
      estadisticasPorEstado,
      pagosPorMes
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ 
      message: 'Error al obtener estadísticas',
      error: error.message 
    });
  }
});

module.exports = router;
