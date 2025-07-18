const express = require('express');
const router = express.Router();
const inventarioProductoService = require('../services/inventarioProductoService');
const { authenticate, requireAdmin, requireUser } = require('../middleware/authenticate');

// Registrar nueva entrada/lote (individual)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log('[DEBUG] Recibiendo datos para crear entrada:', req.body);
    const {
      productoId,
      cantidad,
      precio,
      lote,
      observaciones,
      fechaVencimiento,
      proveedor
    } = req.body;

    // Obtener datos del usuario autenticado
    const usuario = req.user.email?.split('@')[0] || req.user.id;
    const usuarioEmail = req.user.email;

    console.log('[DEBUG] Creando entrada con productoId:', productoId);
    
    const entrada = await inventarioProductoService.crearEntrada({
      productoId,
      cantidad,
      precio,
      lote,
      observaciones,
      usuario,
      usuarioEmail,
      fechaVencimiento,
      proveedor
    });

    console.log('[DEBUG] Entrada creada exitosamente:', entrada._id);
    res.status(201).json({
      message: 'Entrada de inventario registrada exitosamente',
      entrada
    });
  } catch (error) {
    console.error('[ERROR] Error al crear entrada:', error);
    res.status(error.status || 500).json({ 
      message: error.message || 'Error al registrar entrada de inventario' 
    });
  }
});

// Listar todas las entradas/lotes con filtros
router.get('/', authenticate, requireUser, async (req, res) => {
  try {
    const filtros = {
      catalogoProductoId: req.query.catalogoProductoId,
      estado: req.query.estado,
      usuario: req.query.usuario,
      fechaDesde: req.query.fechaDesde,
      fechaHasta: req.query.fechaHasta,
      lote: req.query.lote,
      limit: req.query.limit || 50,
      skip: req.query.skip || 0,
      sortBy: req.query.sortBy || 'fechaEntrada',
      sortOrder: req.query.sortOrder || -1
    };

    const resultado = await inventarioProductoService.listarEntradas(filtros);
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ 
      message: error.message || 'Error al obtener entradas de inventario' 
    });
  }
});

// Obtener historial de entradas/lotes (alias para compatibilidad)
router.get('/historial', authenticate, requireUser, async (req, res) => {
  try {
    const resultado = await inventarioProductoService.listarEntradas({
      limit: req.query.limit || 100,
      sortBy: 'fechaEntrada',
      sortOrder: -1
    });
    
    // Retornar solo el array de entradas para compatibilidad con el frontend actual
    res.json(resultado.entradas || []);
  } catch (error) {
    res.status(500).json({ 
      message: error.message || 'Error al obtener historial de entradas' 
    });
  }
});

// Obtener detalle de una entrada/lote específica
router.get('/:id', authenticate, requireUser, async (req, res) => {
  try {
    const entrada = await inventarioProductoService.obtenerEntradaPorId(req.params.id);
    res.json(entrada);
  } catch (error) {
    res.status(error.status || 500).json({ 
      message: error.message || 'Error al obtener entrada de inventario' 
    });
  }
});

// Actualizar entrada/lote
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const entrada = await inventarioProductoService.actualizarEntrada(req.params.id, req.body);
    res.json({
      message: 'Entrada actualizada exitosamente',
      entrada
    });
  } catch (error) {
    res.status(error.status || 500).json({ 
      message: error.message || 'Error al actualizar entrada de inventario' 
    });
  }
});

// Eliminar entrada/lote
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await inventarioProductoService.eliminarEntrada(req.params.id);
    res.json({ message: 'Entrada eliminada exitosamente' });
  } catch (error) {
    res.status(error.status || 500).json({ 
      message: error.message || 'Error al eliminar entrada de inventario' 
    });
  }
});

// Obtener resumen de inventario por producto
router.get('/resumen/:catalogoProductoId', authenticate, requireUser, async (req, res) => {
  try {
    const resumen = await inventarioProductoService.obtenerResumenPorProducto(req.params.catalogoProductoId);
    res.json(resumen);
  } catch (error) {
    res.status(500).json({ 
      message: error.message || 'Error al obtener resumen de inventario' 
    });
  }
});

// Obtener estadísticas generales del inventario
router.get('/estadisticas/general', authenticate, requireUser, async (req, res) => {
  try {
    const estadisticas = await inventarioProductoService.obtenerEstadisticas();
    res.json(estadisticas);
  } catch (error) {
    res.status(500).json({ 
      message: error.message || 'Error al obtener estadísticas' 
    });
  }
});

// Consumir stock de una entrada específica
router.post('/:id/consumir', authenticate, requireAdmin, async (req, res) => {
  try {
    const { cantidad, descripcion } = req.body;
    const usuario = req.user.email?.split('@')[0] || req.user.id;
    
    const entrada = await inventarioProductoService.consumirStock(
      req.params.id,
      cantidad,
      usuario,
      descripcion
    );
    
    res.json({
      message: 'Stock consumido exitosamente',
      entrada
    });
  } catch (error) {
    res.status(error.status || 500).json({ 
      message: error.message || 'Error al consumir stock' 
    });
  }
});

module.exports = router;
