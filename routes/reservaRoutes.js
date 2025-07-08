const express = require('express');
const router = express.Router();
const reservaService = require('../services/reservaService');
const { authenticate, requireAdmin, requireUser } = require('../middleware/authenticate');

// Middleware para todas las rutas
router.use(authenticate, requireUser);

// GET /api/reservas - Obtener todas las reservas
router.get('/', async (req, res) => {
  try {
    const filtros = {
      estado: req.query.estado,
      nombreColaborador: req.query.nombreColaborador,
      fechaDesde: req.query.fechaDesde,
      fechaHasta: req.query.fechaHasta
    };

    const reservas = await reservaService.getReservas(filtros);
    res.json(reservas);
  } catch (error) {
    console.error('Error al obtener reservas:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// GET /api/reservas/estadisticas - Obtener estadísticas de reservas
router.get('/estadisticas', async (req, res) => {
  try {
    const estadisticas = await reservaService.getEstadisticasReservas();
    res.json(estadisticas);
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// GET /api/reservas/completadas - Obtener reservas completadas
router.get('/completadas', async (req, res) => {
  try {
    const reservasCompletadas = await reservaService.getReservasCompletadas();
    res.json(reservasCompletadas);
  } catch (error) {
    console.error('Error al obtener reservas completadas:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// GET /api/reservas/:id - Obtener una reserva específica
router.get('/:id', async (req, res) => {
  try {
    const reserva = await reservaService.getReservaById(req.params.id);
    res.json(reserva);
  } catch (error) {
    console.error('Error al obtener reserva:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// POST /api/reservas - Crear una nueva reserva
router.post('/', async (req, res) => {
  try {
    const { nombreColaborador, productos, notas } = req.body;

    // Validaciones básicas
    if (!nombreColaborador || !productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ 
        message: 'Faltan campos requeridos: nombreColaborador, productos (array)' 
      });
    }

    // Validar cada producto
    for (const producto of productos) {
      if (!producto.productoId || !producto.cantidad) {
        return res.status(400).json({ 
          message: 'Cada producto debe tener productoId y cantidad' 
        });
      }
      if (producto.cantidad <= 0) {
        return res.status(400).json({ 
          message: 'La cantidad debe ser mayor a 0' 
        });
      }
    }

    const reservaData = {
      nombreColaborador: nombreColaborador.trim(),
      productos,
      notas: notas || '',
      userId: req.user.clerk_id || req.user.id,
      creatorId: req.user.clerk_id || req.user.id,
      creatorName: req.user.name || req.user.firstName || 'Usuario',
      creatorRole: req.user.role || 'user'
    };

    const nuevaReserva = await reservaService.createReserva(reservaData);
    
    res.status(201).json({
      message: 'Reserva creada exitosamente',
      reserva: nuevaReserva
    });
  } catch (error) {
    console.error('Error al crear reserva:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// PUT /api/reservas/:id - Actualizar una reserva
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { estado, notas, productos, montoTotal } = req.body;

    const updateData = {};
    
    if (estado) updateData.estado = estado;
    if (notas !== undefined) updateData.notas = notas;
    if (productos) updateData.productos = productos;
    if (montoTotal !== undefined) updateData.montoTotal = montoTotal;
    
    // Si se está marcando como entregado, agregar información del usuario
    if (estado === 'entregado') {
      updateData.entregadoPor = req.user.id;
      updateData.entregadoPorNombre = req.user.name || req.user.firstName || 'Usuario';
    }

    const reservaActualizada = await reservaService.updateReserva(req.params.id, updateData);
    
    res.json({
      message: 'Reserva actualizada exitosamente',
      reserva: reservaActualizada
    });
  } catch (error) {
    console.error('Error al actualizar reserva:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// PUT /api/reservas/:id/incrementar-producto - Incrementar cantidad de un producto
router.put('/:id/incrementar-producto', requireAdmin, async (req, res) => {
  try {
    const { productoId, cantidadAdicional } = req.body;

    if (!productoId || !cantidadAdicional || cantidadAdicional <= 0) {
      return res.status(400).json({ 
        message: 'Faltan campos requeridos: productoId, cantidadAdicional' 
      });
    }

    const usuario = req.user.name || req.user.firstName || 'Usuario';
    
    const reservaActualizada = await reservaService.incrementarCantidadProducto(
      req.params.id,
      productoId,
      parseInt(cantidadAdicional),
      usuario
    );
    
    res.json({
      message: 'Cantidad incrementada exitosamente',
      reserva: reservaActualizada
    });
  } catch (error) {
    console.error('Error al incrementar cantidad:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// POST /api/reservas/:id/decrementar - Decrementar cantidad de un producto en una reserva
router.post('/:id/decrementar', async (req, res) => {
  try {
    const { productoId, cantidadReducir } = req.body;
    const userData = req.user;

    const reservaActualizada = await reservaService.decrementarProductoReserva(
      req.params.id, 
      productoId, 
      cantidadReducir, 
      userData
    );
    
    res.json(reservaActualizada);
  } catch (error) {
    console.error('Error al decrementar producto en reserva:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// POST /api/reservas/:id/agregar-producto - Agregar un nuevo producto a una reserva existente
router.post('/:id/agregar-producto', requireAdmin, async (req, res) => {
  try {
    const { productoId, cantidad } = req.body;
    const userData = req.user;

    const reservaActualizada = await reservaService.agregarProductoAReserva(
      req.params.id, 
      productoId, 
      cantidad, 
      userData
    );
    
    res.json(reservaActualizada);
  } catch (error) {
    console.error('Error al agregar producto a reserva:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

// DELETE /api/reservas/:id - Eliminar una reserva
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const reservaEliminada = await reservaService.deleteReserva(req.params.id);
    
    res.json({
      message: 'Reserva eliminada exitosamente',
      reserva: reservaEliminada
    });
  } catch (error) {
    console.error('Error al eliminar reserva:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error interno del servidor' 
    });
  }
});

module.exports = router;
