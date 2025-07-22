const express = require('express');
const router = express.Router();
const movimientoUnificadoService = require('../services/movimientoUnificadoService');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// GET /api/movimientos-unificados/productos/:tipo - Obtener productos por tipo
router.get('/productos/:tipo', async (req, res) => {
    try {
        console.log('📊 GET /api/movimientos-unificados/productos/:tipo');
        console.log('📊 Tipo solicitado:', req.params.tipo);
        console.log('📊 Usuario:', req.user?.email || 'No identificado');
        
        const { tipo } = req.params;
        
        // Validar tipos permitidos
        const tiposPermitidos = ['ingredientes', 'materiales', 'recetas', 'produccion'];
        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({
                success: false,
                message: `Tipo no válido. Tipos permitidos: ${tiposPermitidos.join(', ')}`
            });
        }
        
        const productos = await movimientoUnificadoService.obtenerProductosPorTipo(tipo);
        
        console.log(`✅ ${productos.length} productos obtenidos para ${tipo}`);
        
        res.json({
            success: true,
            data: productos,
            message: `Productos de ${tipo} obtenidos exitosamente`
        });
        
    } catch (error) {
        console.error('❌ Error en GET /productos/:tipo:', error.message);
        
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/movimientos-unificados/agregar-cantidad - Agregar cantidad a un producto
router.post('/agregar-cantidad', async (req, res) => {
    try {
        console.log('📊 POST /api/movimientos-unificados/agregar-cantidad');
        console.log('📊 Datos recibidos:', {
            ...req.body,
            ingredientesUtilizados: req.body.ingredientesUtilizados?.length || 0,
            recetasUtilizadas: req.body.recetasUtilizadas?.length || 0
        });
        console.log('📊 Usuario:', req.user?.email || 'No identificado');
        
        const { 
            tipoProducto, 
            productoId, 
            cantidad, 
            motivo, 
            precio, 
            consumirIngredientes,
            // Nuevos parámetros para producción
            ingredientesUtilizados = [],
            recetasUtilizadas = [],
            costoTotal = 0,
            observaciones = ''
        } = req.body;
        const operador = req.user?.name || req.user?.email || 'Usuario';
        
        // Validaciones
        if (!tipoProducto || !productoId || !cantidad) {
            return res.status(400).json({
                success: false,
                message: 'Los campos tipoProducto, productoId y cantidad son requeridos'
            });
        }
        
        if (cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a 0'
            });
        }

        // Validar precio si se proporciona
        if (precio !== undefined && precio !== null && precio < 0) {
            return res.status(400).json({
                success: false,
                message: 'El precio debe ser mayor o igual a 0'
            });
        }
        
        // Validaciones especiales para producción
        if (tipoProducto === 'produccion') {
            // Validar que hay al menos un ingrediente o receta
            if ((!ingredientesUtilizados || ingredientesUtilizados.length === 0) && 
                (!recetasUtilizadas || recetasUtilizadas.length === 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'Para producción se requiere al menos un ingrediente o receta'
                });
            }
            
            // Validar estructura de ingredientes
            if (ingredientesUtilizados && ingredientesUtilizados.length > 0) {
                for (const ingrediente of ingredientesUtilizados) {
                    if (!ingrediente.ingrediente || !ingrediente.cantidadUtilizada || ingrediente.cantidadUtilizada <= 0) {
                        return res.status(400).json({
                            success: false,
                            message: 'Todos los ingredientes deben tener ID y cantidad válida'
                        });
                    }
                }
            }
            
            // Validar estructura de recetas
            if (recetasUtilizadas && recetasUtilizadas.length > 0) {
                for (const receta of recetasUtilizadas) {
                    if (!receta.receta || !receta.cantidadUtilizada || receta.cantidadUtilizada <= 0) {
                        return res.status(400).json({
                            success: false,
                            message: 'Todas las recetas deben tener ID y cantidad válida'
                        });
                    }
                }
            }
        }
        
        const resultado = await movimientoUnificadoService.agregarCantidad(
            tipoProducto,
            productoId,
            cantidad,
            motivo,
            operador,
            precio,
            consumirIngredientes,
            ingredientesUtilizados,
            recetasUtilizadas,
            costoTotal,
            observaciones
        );
        
        console.log('✅ Cantidad agregada exitosamente');
        
        res.status(201).json({
            success: true,
            data: resultado,
            message: 'Cantidad agregada exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error en POST /agregar-cantidad:', error.message);
        
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/movimientos-unificados/movimiento/:id - Eliminar movimiento
router.delete('/movimiento/:id', async (req, res) => {
    try {
        console.log('🗑️ DELETE /api/movimientos-unificados/movimiento/:id');
        console.log('🗑️ ID del movimiento:', req.params.id);
        console.log('🗑️ Usuario:', req.user?.email || 'No identificado');
        
        const { id } = req.params;
        const operador = req.user?.name || req.user?.email || 'Usuario';
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'ID del movimiento es requerido'
            });
        }
        
        const resultado = await movimientoUnificadoService.eliminarMovimiento(id, operador);
        
        console.log('✅ Movimiento eliminado exitosamente');
        
        res.json({
            success: true,
            data: resultado,
            message: 'Movimiento eliminado y stock revertido exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error en DELETE /movimiento/:id:', error.message);
        
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/movimientos-unificados/historial - Obtener historial de movimientos
router.get('/historial', async (req, res) => {
    try {
        console.log('📊 GET /api/movimientos-unificados/historial');
        console.log('📊 Query params:', req.query);
        console.log('📊 Usuario:', req.user?.email || 'No identificado');
        
        const filtros = {
            tipoProducto: req.query.tipoProducto,
            tipoMovimiento: req.query.tipoMovimiento,
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin,
            operador: req.query.operador,
            limite: req.query.limite || 50,
            pagina: req.query.pagina || 1
        };
        
        const resultado = await movimientoUnificadoService.obtenerHistorialMovimientos(filtros);
        
        // VALIDACIÓN DEFENSIVA: Asegurar que resultado tenga la estructura correcta
        if (!resultado || typeof resultado !== 'object') {
            throw new Error('Resultado de historial inválido');
        }
        
        if (!Array.isArray(resultado.movimientos)) {
            console.error('🚨 PROBLEMA: resultado.movimientos no es un array:', typeof resultado.movimientos, resultado.movimientos);
            throw new Error('Los movimientos del historial no son un array válido');
        }
        
        console.log(`✅ ${resultado.movimientos.length} movimientos obtenidos`);
        
        console.log('🔄 Preparando respuesta JSON...');
        
        const respuestaFinal = {
            success: true,
            data: resultado,
            message: 'Historial obtenido exitosamente'
        };
        
        console.log('📤 Enviando respuesta al cliente...');
        
        try {
            res.json(respuestaFinal);
            console.log('✅ Respuesta enviada exitosamente');
        } catch (jsonError) {
            console.error('🚨 ERROR AL ENVIAR JSON:', jsonError);
            console.error('🚨 Stack trace:', jsonError.stack);
            throw jsonError;
        }
        
    } catch (error) {
        console.error('❌ Error en GET /historial:', error.message);
        console.error('📍 Stack trace completo:', error.stack);
        console.error('📍 Error completo:', error);
        
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/movimientos-unificados/estadisticas - Obtener estadísticas
router.get('/estadisticas', async (req, res) => {
    try {
        console.log('📊 GET /api/movimientos-unificados/estadisticas');
        console.log('📊 Query params:', req.query);
        console.log('📊 Usuario:', req.user?.email || 'No identificado');
        
        const filtros = {
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin
        };
        
        const estadisticas = await movimientoUnificadoService.obtenerEstadisticas(filtros);
        
        console.log('✅ Estadísticas generadas exitosamente');
        
        res.json({
            success: true,
            data: estadisticas,
            message: 'Estadísticas obtenidas exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error en GET /estadisticas:', error.message);
        
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/movimientos-unificados/producto/:tipo/:id - Obtener detalles de un producto específico
router.get('/producto/:tipo/:id', async (req, res) => {
    try {
        console.log('📊 GET /api/movimientos-unificados/producto/:tipo/:id');
        console.log('📊 Tipo:', req.params.tipo, 'ID:', req.params.id);
        console.log('📊 Usuario:', req.user?.email || 'No identificado');
        
        const { tipo, id } = req.params;
        
        // Validar tipos permitidos
        const tiposPermitidos = ['ingredientes', 'materiales', 'recetas', 'produccion'];
        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({
                success: false,
                message: `Tipo no válido. Tipos permitidos: ${tiposPermitidos.join(', ')}`
            });
        }
        
        const resultado = await movimientoUnificadoService.obtenerDetalleProducto(tipo, id);
        
        console.log('✅ Detalles del producto obtenidos exitosamente');
        
        res.json({
            success: true,
            data: resultado,
            message: 'Detalles del producto obtenidos exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error en GET /producto/:tipo/:id:', error.message);
        
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/movimientos-unificados/tipos - Obtener tipos de productos disponibles
router.get('/tipos', async (req, res) => {
    try {
        console.log('📊 GET /api/movimientos-unificados/tipos');
        console.log('📊 Usuario:', req.user?.email || 'No identificado');
        
        const tipos = [
            {
                id: 'ingredientes',
                nombre: 'Ingredientes',
                descripcion: 'Materias primas para producción',
                icono: '🥕'
            },
            {
                id: 'materiales',
                nombre: 'Materiales',
                descripcion: 'Materiales de producción',
                icono: '📦'
            },
            {
                id: 'recetas',
                nombre: 'Recetas',
                descripcion: 'Productos con recetas definidas',
                icono: '📋'
            },
            {
                id: 'produccion',
                nombre: 'Producción',
                descripcion: 'Productos del catálogo de producción',
                icono: '🏭'
            }
        ];
        
        res.json({
            success: true,
            data: tipos,
            message: 'Tipos de productos obtenidos exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error en GET /tipos:', error.message);
        
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
