const express = require('express');
const router = express.Router();
const inventarioMasterService = require('../services/InventarioMasterService');
const { authenticate, requireAdmin, requireUser } = require('../middleware/authenticate');

/**
 * RUTAS UNIFICADAS DEL INVENTARIO - FASE 1
 * 
 * Nuevas rutas que usan InventarioMasterService
 * Coexisten con las rutas legacy para transición gradual
 * Prefix: /api/inventario-unificado
 */

// ========================================
// OPERACIONES CRUD PRINCIPALES
// ========================================

/**
 * POST /api/inventario-unificado/entradas
 * Crear nueva entrada de inventario
 */
router.post('/entradas', 
  authenticate, 
  requireAdmin,
  async (req, res) => {
    try {
      console.log('\n🔥 === RUTA UNIFICADA: CREAR ENTRADA ===');
      console.log('📍 Datos recibidos:', JSON.stringify(req.body, null, 2));
      console.log('👤 Usuario:', {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      });

      // Preparar datos con información del usuario autenticado
      const datosEntrada = {
        ...req.body,
        usuario: req.user.email?.split('@')[0] || req.user.id,
        usuarioEmail: req.user.email,
        usuarioRole: req.user.role
      };

      // Crear entrada usando el servicio maestro
      const entradaCreada = await inventarioMasterService.crearEntrada(datosEntrada);

      console.log('✅ Entrada creada exitosamente');
      res.status(201).json({
        success: true,
        message: 'Entrada de inventario creada exitosamente',
        data: entradaCreada
      });

    } catch (error) {
      console.error('❌ Error en ruta crear entrada:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Error interno del servidor',
        code: error.code || 'INTERNAL_ERROR'
      });
    }
  }
);

/**
 * GET /api/inventario-unificado/entradas
 * Listar entradas con filtros y paginación
 */
router.get('/entradas', 
  authenticate, 
  requireUser,
  async (req, res) => {
    try {
      console.log('\n📋 === RUTA UNIFICADA: LISTAR ENTRADAS ===');
      console.log('📍 Query params:', req.query);

      // Extraer filtros de los query parameters
      const filtros = {
        estado: req.query.estado,
        catalogoProductoId: req.query.catalogoProductoId || req.query.productoId,
        usuario: req.query.usuario,
        fechaDesde: req.query.fechaDesde,
        fechaHasta: req.query.fechaHasta,
        busqueda: req.query.busqueda || req.query.search
      };

      // Extraer opciones de paginación
      const opciones = {
        limite: req.query.limite || req.query.limit,
        pagina: req.query.pagina || req.query.page,
        orden: req.query.orden ? JSON.parse(req.query.orden) : undefined
      };

      // Obtener entradas
      const resultado = await inventarioMasterService.listarEntradas(filtros, opciones);

      console.log('✅ Entradas obtenidas:', resultado.entradas.length);
      res.json({
        success: true,
        data: resultado.entradas,
        paginacion: resultado.paginacion,
        resumen: resultado.resumen
      });

    } catch (error) {
      console.error('❌ Error en ruta listar entradas:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  }
);

/**
 * GET /api/inventario-unificado/entradas/:id
 * Obtener entrada específica por ID
 */
router.get('/entradas/:id', 
  authenticate, 
  requireUser,
  async (req, res) => {
    try {
      console.log('\n🔍 === RUTA UNIFICADA: OBTENER ENTRADA ===');
      console.log('📍 ID solicitado:', req.params.id);

      const entrada = await inventarioMasterService.obtenerEntrada(req.params.id);

      console.log('✅ Entrada obtenida');
      res.json({
        success: true,
        data: entrada
      });

    } catch (error) {
      console.error('❌ Error en ruta obtener entrada:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  }
);

// ========================================
// OPERACIONES DE STOCK
// ========================================

/**
 * POST /api/inventario-unificado/entradas/:id/consumir
 * Consumir stock de una entrada específica
 */
router.post('/entradas/:id/consumir', 
  authenticate, 
  requireAdmin,
  async (req, res) => {
    try {
      console.log('\n🔻 === RUTA UNIFICADA: CONSUMIR STOCK ===');
      console.log('📍 Entrada ID:', req.params.id);
      console.log('📍 Datos:', req.body);

      const { cantidad, motivo, observaciones } = req.body;

      if (!cantidad || isNaN(cantidad) || cantidad <= 0) {
        return res.status(400).json({
          success: false,
          message: 'La cantidad debe ser un número mayor a 0'
        });
      }

      const datosConsumo = {
        motivo: motivo || 'venta',
        observaciones: observaciones || '',
        usuario: req.user.email?.split('@')[0] || req.user.id,
        registrarMovimiento: true
      };

      const entradaActualizada = await inventarioMasterService.consumirStock(
        req.params.id,
        parseFloat(cantidad),
        datosConsumo
      );

      console.log('✅ Stock consumido exitosamente');
      res.json({
        success: true,
        message: `Stock consumido exitosamente: ${cantidad} unidades`,
        data: entradaActualizada
      });

    } catch (error) {
      console.error('❌ Error en ruta consumir stock:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  }
);

/**
 * POST /api/inventario-unificado/entradas/:id/incrementar
 * Incrementar stock de una entrada (devoluciones)
 */
router.post('/entradas/:id/incrementar', 
  authenticate, 
  requireAdmin,
  async (req, res) => {
    try {
      console.log('\n🔺 === RUTA UNIFICADA: INCREMENTAR STOCK ===');
      console.log('📍 Entrada ID:', req.params.id);
      console.log('📍 Datos:', req.body);

      const { cantidad, motivo, observaciones } = req.body;

      if (!cantidad || isNaN(cantidad) || cantidad <= 0) {
        return res.status(400).json({
          success: false,
          message: 'La cantidad debe ser un número mayor a 0'
        });
      }

      const datosIncremento = {
        motivo: motivo || 'devolucion',
        observaciones: observaciones || '',
        usuario: req.user.email?.split('@')[0] || req.user.id,
        registrarMovimiento: true
      };

      const entradaActualizada = await inventarioMasterService.incrementarStock(
        req.params.id,
        parseFloat(cantidad),
        datosIncremento
      );

      console.log('✅ Stock incrementado exitosamente');
      res.json({
        success: true,
        message: `Stock incrementado exitosamente: ${cantidad} unidades`,
        data: entradaActualizada
      });

    } catch (error) {
      console.error('❌ Error en ruta incrementar stock:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  }
);

// ========================================
// CONSULTAS Y REPORTES
// ========================================

/**
 * GET /api/inventario-unificado/productos/:id/resumen
 * Obtener resumen de inventario por producto
 */
router.get('/productos/:id/resumen', 
  authenticate, 
  requireUser,
  async (req, res) => {
    try {
      console.log('\n📊 === RUTA UNIFICADA: RESUMEN POR PRODUCTO ===');
      console.log('📍 Producto ID:', req.params.id);

      const resumen = await inventarioMasterService.obtenerResumenPorProducto(req.params.id);

      console.log('✅ Resumen obtenido');
      res.json({
        success: true,
        data: resumen
      });

    } catch (error) {
      console.error('❌ Error en ruta resumen por producto:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  }
);

/**
 * GET /api/inventario-unificado/estadisticas
 * Obtener estadísticas generales del inventario
 */
router.get('/estadisticas', 
  authenticate, 
  requireUser,
  async (req, res) => {
    try {
      console.log('\n📈 === RUTA UNIFICADA: ESTADÍSTICAS GENERALES ===');

      const estadisticas = await inventarioMasterService.obtenerEstadisticasGenerales();

      console.log('✅ Estadísticas obtenidas');
      res.json({
        success: true,
        data: estadisticas
      });

    } catch (error) {
      console.error('❌ Error en ruta estadísticas:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  }
);

// ========================================
// RUTAS DE COMPATIBILIDAD
// ========================================

/**
 * POST /api/inventario-unificado/legacy-compatibility
 * Endpoint de compatibilidad para frontend legacy
 * Mapea datos del formato anterior al nuevo
 */
router.post('/legacy-compatibility', 
  authenticate, 
  requireAdmin,
  async (req, res) => {
    try {
      console.log('\n🔄 === RUTA DE COMPATIBILIDAD LEGACY ===');
      console.log('📍 Datos legacy:', req.body);

      // Mapear datos del formato legacy al nuevo formato
      const datosLegacy = req.body;
      const datosNuevos = {
        // Mapear campos del formato anterior
        catalogoProductoId: datosLegacy.catalogoProductoId,
        productoId: datosLegacy.productoId, // Se resolverá automáticamente
        cantidad: datosLegacy.cantidad,
        precio: datosLegacy.precio,
        precioVenta: datosLegacy.precioVenta,
        lote: datosLegacy.lote || '',
        fechaEntrada: datosLegacy.fechaEntrada,
        fechaVencimiento: datosLegacy.fechaVencimiento,
        proveedor: datosLegacy.proveedor || '',
        observaciones: datosLegacy.observaciones || '',
        
        // Datos del usuario
        usuario: req.user.email?.split('@')[0] || req.user.id,
        usuarioEmail: req.user.email,
        usuarioRole: req.user.role
      };

      // Crear entrada usando el servicio maestro
      const entradaCreada = await inventarioMasterService.crearEntrada(datosNuevos);

      console.log('✅ Entrada legacy creada exitosamente');
      
      // Devolver en formato que espera el frontend legacy
      res.status(201).json({
        _id: entradaCreada._id,
        numeroEntrada: entradaCreada.numeroEntrada,
        catalogoProductoId: entradaCreada.catalogoProductoId,
        cantidad: entradaCreada.cantidadInicial,
        cantidadDisponible: entradaCreada.cantidadDisponible,
        precio: entradaCreada.precioCompra,
        fechaEntrada: entradaCreada.fechaEntrada,
        usuario: entradaCreada.usuarioCreacion,
        estado: entradaCreada.estado,
        // Agregar campos adicionales para compatibilidad
        success: true,
        message: 'Entrada creada exitosamente'
      });

    } catch (error) {
      console.error('❌ Error en ruta legacy:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Error interno del servidor',
        error: error.message
      });
    }
  }
);

// ========================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ========================================

router.use((error, req, res, next) => {
  console.error('💥 Error no manejado en rutas unificadas:', error);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;