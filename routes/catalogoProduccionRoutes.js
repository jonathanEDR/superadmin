const express = require('express');
const router = express.Router();
const catalogoProduccionService = require('../services/catalogoProduccionService');
const { authenticate } = require('../middleware/authenticate');

console.log('🎯 catalogoProduccionRoutes.js cargado correctamente');

// Middleware de logging para este router específico
router.use((req, res, next) => {
    console.log(`📊 CatalogoProduccion Route: ${req.method} ${req.originalUrl}`);
    console.log(`📊 Full path: ${req.baseUrl}${req.path}`);
    console.log(`📊 Query params:`, req.query);
    next();
});

// ==================== RUTAS PARA MÓDULOS DEL SISTEMA ====================

// GET /api/catalogo-produccion/modulos - Obtener módulos disponibles
router.get('/modulos', async (req, res) => {
    try {
        console.log('🔍 Ejecutando GET /modulos');
        
        const modulos = catalogoProduccionService.obtenerModulosDisponibles();
        
        console.log('✅ Módulos obtenidos:', modulos.length);
        
        res.json({
            success: true,
            data: modulos
        });
    } catch (error) {
        console.error('❌ Error al obtener módulos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== RUTAS PARA TIPOS DE PRODUCCIÓN (LEGACY) ====================

// GET /api/catalogo-produccion/test - Endpoint de prueba (sin autenticación)
router.get('/test', (req, res) => {
    console.log('✅ Test endpoint alcanzado correctamente');
    res.json({
        success: true,
        message: 'Catálogo de producción routes working!',
        timestamp: new Date().toISOString(),
        path: req.originalUrl
    });
});

// Middleware de autenticación para las rutas protegidas
router.use(authenticate);

// GET /api/catalogo-produccion/tipos - Obtener tipos de producción
router.get('/tipos', async (req, res) => {
    try {
        console.log('🔍 Ejecutando GET /tipos');
        console.log('🔍 Query params:', req.query);
        
        const { buscar, activo } = req.query;
        
        let filtros = {};
        if (buscar) filtros.buscar = buscar;
        if (activo !== undefined) filtros.activo = activo === 'true';
        
        console.log('🔍 Filtros aplicados:', filtros);
        
        const tipos = await catalogoProduccionService.obtenerTiposProduccion(filtros);
        
        console.log('🔍 Tipos obtenidos:', tipos.length);
        
        res.json({
            success: true,
            data: tipos
        });
    } catch (error) {
        console.error('❌ Error en GET /tipos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/catalogo-produccion/tipos - Crear tipo de producción
router.post('/tipos', async (req, res) => {
    try {
        const tipo = await catalogoProduccionService.crearTipoProduccion(req.body);
        
        res.status(201).json({
            success: true,
            data: tipo,
            message: 'Tipo de producción creado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/catalogo-produccion/tipos/:id - Actualizar tipo de producción
router.put('/tipos/:id', async (req, res) => {
    try {
        const tipo = await catalogoProduccionService.actualizarTipoProduccion(req.params.id, req.body);
        
        res.json({
            success: true,
            data: tipo,
            message: 'Tipo de producción actualizado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/catalogo-produccion/tipos/:id - Eliminar tipo de producción
router.delete('/tipos/:id', async (req, res) => {
    try {
        await catalogoProduccionService.eliminarTipoProduccion(req.params.id);
        
        res.json({
            success: true,
            message: 'Tipo de producción eliminado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PATCH /api/catalogo-produccion/tipos/:id/desactivar - Desactivar tipo de producción
router.patch('/tipos/:id/desactivar', async (req, res) => {
    try {
        const tipo = await catalogoProduccionService.desactivarTipoProduccion(req.params.id);
        
        res.json({
            success: true,
            data: tipo,
            message: 'Tipo de producción desactivado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PATCH /api/catalogo-produccion/tipos/:id/activar - Activar tipo de producción
router.patch('/tipos/:id/activar', async (req, res) => {
    try {
        const tipo = await catalogoProduccionService.activarTipoProduccion(req.params.id);
        
        res.json({
            success: true,
            data: tipo,
            message: 'Tipo de producción activado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== RUTAS PARA CATÁLOGO DE PRODUCTOS ====================

// GET /api/catalogo-produccion/estadisticas - Obtener estadísticas (debe ir antes que /:id)
router.get('/estadisticas', async (req, res) => {
    try {
        const estadisticas = await catalogoProduccionService.obtenerEstadisticasCatalogo();
        
        res.json({
            success: true,
            data: estadisticas
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/catalogo-produccion/generar-codigo/:moduloId - Generar código automático (debe ir antes que /:id)
router.get('/generar-codigo/:moduloId', async (req, res) => {
    try {
        const codigo = await catalogoProduccionService.generarCodigoAutomatico(req.params.moduloId);
        
        res.json({
            success: true,
            data: { codigo }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/catalogo-produccion/inicializar - Inicializar datos por defecto (debe ir antes que /:id)
router.post('/inicializar', async (req, res) => {
    try {
        await catalogoProduccionService.inicializarDatosDefecto();
        
        res.json({
            success: true,
            message: 'Datos por defecto inicializados exitosamente'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/catalogo-produccion - Obtener productos del catálogo
router.get('/', async (req, res) => {
    try {
        const { buscar, moduloSistema, categoria, activo } = req.query;
        
        let filtros = {};
        if (buscar) filtros.buscar = buscar;
        if (moduloSistema) filtros.moduloSistema = moduloSistema;
        if (categoria) filtros.categoria = categoria;
        if (activo !== undefined) filtros.activo = activo === 'true';
        
        console.log('🔍 Filtros aplicados en catálogo:', filtros);
        
        const productos = await catalogoProduccionService.obtenerProductosCatalogo(filtros);
        
        res.json({
            success: true,
            data: productos
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== RUTAS ESPECÍFICAS POR MÓDULO ====================

// GET /api/catalogo-produccion/modulo - Obtener productos por módulo (con filtros)
router.get('/modulo', async (req, res) => {
    try {
        const { buscar, moduloSistema, activo } = req.query;
        
        let filtros = {};
        if (buscar) filtros.buscar = buscar;
        if (moduloSistema) filtros.moduloSistema = moduloSistema;
        if (activo !== undefined) filtros.activo = activo === 'true';
        
        console.log('🔍 Filtros aplicados en modulo:', filtros);
        
        const productos = await catalogoProduccionService.obtenerProductosCatalogo(filtros);
        
        res.json({
            success: true,
            data: productos
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/catalogo-produccion/modulo - Crear producto por módulo
router.post('/modulo', async (req, res) => {
    try {
        const usuario = req.user?.name || req.user?.email || 'Usuario Anónimo';
        
        const producto = await catalogoProduccionService.crearProductoCatalogo(req.body, usuario);
        
        res.status(201).json({
            success: true,
            data: producto,
            message: 'Producto creado por módulo exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/catalogo-produccion/ingredientes - Obtener productos para ingredientes
router.get('/ingredientes', async (req, res) => {
    try {
        const productos = await catalogoProduccionService.obtenerProductosParaIngredientes();
        
        res.json({
            success: true,
            data: productos
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/catalogo-produccion/materiales - Obtener productos para materiales
router.get('/materiales', async (req, res) => {
    try {
        const productos = await catalogoProduccionService.obtenerProductosParaMateriales();
        
        res.json({
            success: true,
            data: productos
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/catalogo-produccion/recetas - Obtener productos para recetas
router.get('/recetas', async (req, res) => {
    try {
        const productos = await catalogoProduccionService.obtenerProductosParaRecetas();
        
        res.json({
            success: true,
            data: productos
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/catalogo-produccion/produccion - Obtener productos para producción
router.get('/produccion', async (req, res) => {
    try {
        const productos = await catalogoProduccionService.obtenerProductosParaProduccion();
        
        res.json({
            success: true,
            data: productos
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/catalogo-produccion - Crear producto en catálogo
router.post('/', async (req, res) => {
    try {
        const usuario = req.user?.name || req.user?.email || 'Usuario Anónimo';
        
        const producto = await catalogoProduccionService.crearProductoCatalogo(req.body, usuario);
        
        res.status(201).json({
            success: true,
            data: producto,
            message: 'Producto creado en catálogo exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/catalogo-produccion/:id - Obtener producto específico
router.get('/:id', async (req, res) => {
    try {
        console.log('🔍 GET /api/catalogo-produccion/:id - Obteniendo producto:', req.params.id);
        
        const producto = await catalogoProduccionService.obtenerProductoCatalogoPorId(req.params.id);
        
        res.json({
            success: true,
            data: producto
        });
    } catch (error) {
        console.error('❌ Error al obtener producto:', error);
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/catalogo-produccion/:id - Actualizar producto del catálogo
router.put('/:id', async (req, res) => {
    try {
        console.log('🔄 PUT /api/catalogo-produccion/:id - Actualizando producto:', req.params.id);
        console.log('🔄 Datos de actualización:', req.body);
        
        const producto = await catalogoProduccionService.actualizarProductoCatalogo(req.params.id, req.body);
        
        console.log('✅ Producto actualizado exitosamente');
        
        res.json({
            success: true,
            data: producto,
            message: 'Producto del catálogo actualizado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error al actualizar producto:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/catalogo-produccion/:id - Eliminar producto del catálogo
router.delete('/:id', async (req, res) => {
    try {
        console.log('🚫 DELETE /api/catalogo-produccion/:id - Eliminando producto:', req.params.id);
        
        const resultado = await catalogoProduccionService.eliminarProductoCatalogo(req.params.id);
        
        console.log('✅ Producto eliminado exitosamente');
        
        res.json({
            success: true,
            message: 'Producto eliminado del catálogo exitosamente'
        });
    } catch (error) {
        console.error('❌ Error al eliminar producto:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PATCH /api/catalogo-produccion/:id/activar - Activar producto del catálogo
router.patch('/:id/activar', async (req, res) => {
    try {
        console.log('✅ PATCH /api/catalogo-produccion/:id/activar - Activando producto:', req.params.id);
        
        const producto = await catalogoProduccionService.activarProductoCatalogo(req.params.id);
        
        console.log('✅ Producto activado exitosamente');
        
        res.json({
            success: true,
            data: producto,
            message: 'Producto activado en el catálogo'
        });
    } catch (error) {
        console.error('❌ Error al activar producto:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PATCH /api/catalogo-produccion/:id/toggle-activo - Toggle estado activo
router.patch('/:id/toggle-activo', async (req, res) => {
    try {
        console.log('🔄 PATCH /api/catalogo-produccion/:id/toggle-activo - Toggle producto:', req.params.id);
        console.log('🔄 Nuevo estado:', req.body.activo);
        
        const { activo } = req.body;
        
        const producto = await catalogoProduccionService.actualizarProductoCatalogo(req.params.id, { activo });
        
        console.log('✅ Estado actualizado exitosamente');
        
        res.json({
            success: true,
            data: producto,
            message: `Producto ${activo ? 'activado' : 'desactivado'} exitosamente`
        });
    } catch (error) {
        console.error('❌ Error al cambiar estado:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
