const express = require('express');
const router = express.Router();
const CajaService = require('../services/cajaService');
const MovimientoCaja = require('../models/MovimientoCaja');
const Gasto = require('../models/Gasto');
const PagoRealizado = require('../models/PagoRealizado');
const User = require('../models/User');
const { authenticate } = require('../middleware/authenticate');
const GastoService = require('../services/GastoService');

// Obtener resumen de la caja (dashboard principal)
router.get('/resumen', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { periodo = 'day' } = req.query;

    const resumen = await CajaService.obtenerResumenCaja(userId, periodo);
    res.json(resumen);

  } catch (error) {
    console.error('Error al obtener resumen de caja:', error);
    res.status(500).json({ 
      message: 'Error al obtener resumen de caja', 
      error: error.message 
    });
  }
});

// Obtener saldo actual
router.get('/saldo', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const saldo = await CajaService.obtenerSaldoActual(userId);
    res.json({ saldo });

  } catch (error) {
    console.error('Error al obtener saldo:', error);
    res.status(500).json({ 
      message: 'Error al obtener saldo', 
      error: error.message 
    });
  }
});

// Obtener estadísticas rápidas
router.get('/estadisticas', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const estadisticas = await CajaService.obtenerEstadisticasRapidas(userId);
    res.json(estadisticas);

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ 
      message: 'Error al obtener estadísticas', 
      error: error.message 
    });
  }
});

// Obtener movimientos con filtros
router.get('/movimientos', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const filtros = {
      tipo: req.query.tipo,
      categoria: req.query.categoria,
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    };

    const resultado = await CajaService.obtenerMovimientos(userId, filtros);
    res.json(resultado);

  } catch (error) {
    console.error('Error al obtener movimientos:', error);
    res.status(500).json({ 
      message: 'Error al obtener movimientos', 
      error: error.message 
    });
  }
});

// Registrar nuevo movimiento manual
router.post('/movimiento', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const datosMovimiento = {
      userId,
      tipo: req.body.tipo,
      categoria: req.body.categoria,
      descripcion: req.body.descripcion,
      monto: parseFloat(req.body.monto),
      fecha: req.body.fecha ? new Date(req.body.fecha) : new Date(),
      metodoPago: req.body.metodoPago || 'efectivo',
      colaboradorNombre: req.body.colaboradorNombre,
      proveedor: req.body.proveedor,
      numeroComprobante: req.body.numeroComprobante,
      observaciones: req.body.observaciones,
      esAutomatico: false
    };
    // Validaciones básicas
    if (!datosMovimiento.tipo || !datosMovimiento.categoria || !datosMovimiento.descripcion) {
      return res.status(400).json({ message: 'Faltan campos requeridos: tipo, categoria, descripcion' });
    }
    if (!datosMovimiento.monto || datosMovimiento.monto <= 0) {
      return res.status(400).json({ message: 'El monto debe ser mayor a 0' });
    }
    // Si es un egreso, usar el servicio centralizado para crear gasto y movimiento
    if (datosMovimiento.tipo === 'egreso') {
      try {
        // Mapear categoría y sección a tipo/categoría de gasto
        const categoriaAGastoMap = {
          'pago_personal_finanzas': 'Pago Personal',
          'pago_personal_produccion': 'Pago Personal',
          'pago_personal_ventas': 'Pago Personal',
          'pago_personal_admin': 'Pago Personal',
          'pago_personal': 'Pago Personal',
          'materia_prima_finanzas': 'Materia Prima',
          'materia_prima_produccion': 'Materia Prima',
          'materia_prima_ventas': 'Materia Prima',
          'materia_prima_admin': 'Materia Prima',
          'materia_prima': 'Materia Prima',
          'otros_finanzas': 'Otros',
          'otros_produccion': 'Otros',
          'otros_ventas': 'Otros',
          'otros_admin': 'Otros',
          'otros': 'Otros',
          'pago_proveedor': 'Otros',
          'gasto_operativo': 'Otros',
          'servicio_basico': 'Otros',
          'alquiler': 'Otros',
          'transporte': 'Otros',
          'marketing': 'Otros',
          'impuestos': 'Otros',
          'egreso_extra': 'Otros'
        };
        const seccionAGastoMap = {
          'finanzas': 'Finanzas',
          'produccion': 'Producción',
          'ventas': 'Ventas',
          'admin': 'Administración',
          'administrativo': 'Administración'
        };
        const tipoDeGasto = categoriaAGastoMap[datosMovimiento.categoria] || 'Otros';
        const gastoData = {
          userId: userId,
          tipoDeGasto: tipoDeGasto,
          gasto: seccionAGastoMap[req.body.seccion] || 'Administración',
          descripcion: datosMovimiento.descripcion,
          costoUnidad: datosMovimiento.monto,
          cantidad: 1,
          montoTotal: datosMovimiento.monto,
          fechaGasto: datosMovimiento.fecha,
          esAutomatico: true
        };
        // Usar el servicio centralizado
        const { gasto, movimientoCaja } = await GastoService.crearGastoAutomatico(gastoData, datosMovimiento);
        // Lógica especial para Pago Personal: crear también PagoRealizado si tiene colaboradorId
        if (datosMovimiento.categoria.includes('pago_personal') && req.body.colaboradorId) {
          try {
            // Verificar que el colaborador existe
            const colaborador = await User.findOne({
              _id: req.body.colaboradorId,
              userId: userId
            });
            
            if (colaborador) {
              const pagoRealizado = new PagoRealizado({
                colaboradorId: req.body.colaboradorId,
                fechaPago: datosMovimiento.fecha,
                montoTotal: datosMovimiento.monto,
                metodoPago: datosMovimiento.metodoPago,
                observaciones: datosMovimiento.observaciones || '',
                estado: 'pagado',
                creadoPor: userId,
                referenciaMovimiento: movimientoCaja._id // Referencia al movimiento de caja
              });
              
              await pagoRealizado.save();
              console.log(`PagoRealizado automático creado: ${pagoRealizado._id} para colaborador: ${colaborador.nombre_negocio || colaborador.email}`);
              
              // Actualizar la referencia del gasto para que apunte al PagoRealizado en lugar del MovimientoCaja
              await Gasto.findByIdAndUpdate(gasto._id, {
                referenciaId: pagoRealizado._id,
                referenciaModelo: 'PagoRealizado',
                descripcion: `Pago a ${colaborador.nombre_negocio || colaborador.email}`
              });
              
              console.log(`Gasto actualizado para referenciar PagoRealizado: ${pagoRealizado._id}`);
            } else {
              console.log('Colaborador no encontrado, solo se creó el gasto');
            }
          } catch (pagoError) {
            console.error('Error al crear PagoRealizado automático:', pagoError);
            // No eliminar el gasto si falla el PagoRealizado, solo registrar el error
          }
        }
        return res.status(201).json(movimientoCaja);
      } catch (gastoError) {
        console.error('Error al crear gasto automático:', gastoError);
        return res.status(500).json({ message: 'Error al crear el gasto automático', error: gastoError.message });
      }
    }
    // Si no es egreso, registrar movimiento normal
    const movimiento = await CajaService.registrarMovimiento(datosMovimiento);
    res.status(201).json(movimiento);
  } catch (error) {
    console.error('Error al registrar movimiento:', error);
    res.status(500).json({ message: 'Error al registrar movimiento', error: error.message });
  }
});

// Eliminar movimiento (solo manuales y automáticos con eliminación atómica)
router.delete('/movimiento/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const movimientoId = req.params.id;

    const MovimientoCaja = require('../models/MovimientoCaja');
    const Gasto = require('../models/Gasto');
    const PagoRealizado = require('../models/PagoRealizado');
    
    // Verificar que existe y es del usuario
    const movimiento = await MovimientoCaja.findOne({
      _id: movimientoId,
      userId: userId
    });

    if (!movimiento) {
      return res.status(404).json({ message: 'Movimiento no encontrado' });
    }    // Eliminar movimiento y registro relacionado de forma atómica
    try {
      let elementosEliminados = ['MovimientoCaja'];
        // 1. Buscar y eliminar gastos que referencien a este MovimientoCaja
      const gastosReferenciadosAMovimiento = await Gasto.find({
        referenciaId: movimientoId,
        referenciaModelo: 'MovimientoCaja',
        userId: userId
      });
      
      for (const gasto of gastosReferenciadosAMovimiento) {
        await Gasto.findByIdAndDelete(gasto._id);
        console.log(`Gasto ${gasto._id} eliminado por referencia a MovimientoCaja ${movimientoId}`);
        elementosEliminados.push('Gasto');
      }
      
      // 1.5. Buscar y eliminar PagosRealizados que referencien a este MovimientoCaja
      const pagosReferenciadosAMovimiento = await PagoRealizado.find({
        referenciaMovimiento: movimientoId,
        creadoPor: userId
      });
      
      for (const pago of pagosReferenciadosAMovimiento) {
        // Primero eliminar gastos que referencien a este PagoRealizado
        const gastosDelPago = await Gasto.find({
          referenciaId: pago._id,
          referenciaModelo: 'PagoRealizado',
          userId: userId
        });
        
        for (const gastoPago of gastosDelPago) {
          await Gasto.findByIdAndDelete(gastoPago._id);
          console.log(`Gasto ${gastoPago._id} eliminado por referencia a PagoRealizado ${pago._id}`);
          elementosEliminados.push('Gasto');
        }
        
        // Luego eliminar el PagoRealizado
        await PagoRealizado.findByIdAndDelete(pago._id);
        console.log(`PagoRealizado ${pago._id} eliminado por referencia a MovimientoCaja ${movimientoId}`);
        elementosEliminados.push('PagoRealizado');
      }
      
      // 2. Si tiene referencia a otro modelo, eliminar el registro relacionado
      if (movimiento.referenciaId && movimiento.referenciaModelo) {
        switch (movimiento.referenciaModelo) {
          case 'Gasto':
            await Gasto.findOneAndDelete({
              _id: movimiento.referenciaId,
              userId: userId
            });
            console.log(`Gasto ${movimiento.referenciaId} eliminado junto con movimiento de caja`);
            elementosEliminados.push('Gasto');
            break;
          
          case 'PagoRealizado':
            // Eliminar el PagoRealizado
            await PagoRealizado.findOneAndDelete({
              _id: movimiento.referenciaId,
              creadoPor: userId
            });
            console.log(`Pago realizado ${movimiento.referenciaId} eliminado junto con movimiento de caja`);
            elementosEliminados.push('PagoRealizado');
            
            // También eliminar el Gasto asociado al PagoRealizado
            try {
              const gastoAsociado = await Gasto.findOneAndDelete({
                referenciaId: movimiento.referenciaId,
                referenciaModelo: 'PagoRealizado',
                userId: userId
              });
              
              if (gastoAsociado) {
                console.log(`Gasto ${gastoAsociado._id} eliminado junto con PagoRealizado ${movimiento.referenciaId}`);
                elementosEliminados.push('Gasto');
              }
            } catch (gastoError) {
              console.error('Error al eliminar gasto asociado:', gastoError);
            }
            break;
          
          default:
            console.log(`Modelo ${movimiento.referenciaModelo} no manejado para eliminación`);
        }
      }

      // Eliminar el movimiento de caja
      await MovimientoCaja.findByIdAndDelete(movimientoId);
      
      // Recalcular saldos para mantener la consistencia
      await CajaService.recalcularSaldos(userId);
      
      res.json({ 
        message: 'Movimiento y registros relacionados eliminados exitosamente',
        elementosEliminados
      });

    } catch (deleteError) {
      console.error('Error durante eliminación atómica:', deleteError);
      res.status(500).json({ 
        message: 'Error durante la eliminación', 
        error: deleteError.message 
      });
    }

  } catch (error) {
    console.error('Error al eliminar movimiento:', error);
    res.status(500).json({ 
      message: 'Error al eliminar movimiento', 
      error: error.message 
    });
  }
});

// Obtener categorías disponibles
router.get('/categorias', authenticate, async (req, res) => {
  try {
    const categorias = {
      ingresos: [
        'venta_directa',
        'cobro',
        'devolucion_proveedor',
        'prestamo_recibido',
        'ingreso_extra'
      ],
      egresos: [
        'pago_personal',
        'pago_proveedor',
        'gasto_operativo',
        'servicio_basico',
        'alquiler',
        'transporte',
        'marketing',
        'impuestos',
        'egreso_extra'
      ]
    };

    res.json(categorias);

  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ 
      message: 'Error al obtener categorías', 
      error: error.message 
    });
  }
});

module.exports = router;
