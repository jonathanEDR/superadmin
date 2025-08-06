const express = require('express');
const router = express.Router();
const GarantiasService = require('../../services/Finanzas/garantiasService');
const { authenticate } = require('../../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

/**
 * @route GET /api/garantias
 * @desc Obtener garantías con filtros
 * @access Private
 */
router.get('/', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            prestamoId, 
            tipo, 
            estado, 
            valorMin, 
            valorMax, 
            buscar 
        } = req.query;
        
        const filtros = {
            userId: req.user.userId,
            ...(prestamoId && { prestamoId }),
            ...(tipo && { tipo }),
            ...(estado && { estado }),
            ...(valorMin && { valorMin }),
            ...(valorMax && { valorMax }),
            ...(buscar && { buscar })
        };
        
        const resultado = await GarantiasService.obtenerGarantias(
            filtros,
            parseInt(limit),
            parseInt(page)
        );
        
        res.json({
            success: true,
            data: resultado
        });
        
    } catch (error) {
        console.error('Error obteniendo garantías:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/garantias/resumen
 * @desc Obtener resumen de garantías del usuario
 * @access Private
 */
router.get('/resumen', async (req, res) => {
    try {
        const resumen = await GarantiasService.obtenerResumenGarantias(req.user.userId);
        
        res.json({
            success: true,
            data: resumen
        });
        
    } catch (error) {
        console.error('Error obteniendo resumen de garantías:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/garantias/estadisticas
 * @desc Obtener estadísticas de garantías
 * @access Private
 */
router.get('/estadisticas', async (req, res) => {
    try {
        const estadisticas = await GarantiasService.obtenerEstadisticas(req.user.userId);
        
        res.json({
            success: true,
            data: estadisticas
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas de garantías:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/garantias/proximas-vencer
 * @desc Obtener garantías con seguros próximos a vencer
 * @access Private
 */
router.get('/proximas-vencer', async (req, res) => {
    try {
        const { dias = 30 } = req.query;
        
        const garantiasProximas = await GarantiasService.obtenerGarantiasProximasVencer(
            parseInt(dias),
            req.user.userId
        );
        
        res.json({
            success: true,
            data: garantiasProximas
        });
        
    } catch (error) {
        console.error('Error obteniendo garantías próximas a vencer:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/garantias/tipos
 * @desc Obtener tipos de garantía disponibles
 * @access Private
 */
router.get('/tipos', (req, res) => {
    try {
        const tipos = GarantiasService.obtenerTiposGarantia();
        
        res.json({
            success: true,
            data: tipos
        });
        
    } catch (error) {
        console.error('Error obteniendo tipos de garantía:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/garantias/estados
 * @desc Obtener estados de garantía disponibles
 * @access Private
 */
router.get('/estados', (req, res) => {
    try {
        const estados = GarantiasService.obtenerEstadosGarantia();
        
        res.json({
            success: true,
            data: estados
        });
        
    } catch (error) {
        console.error('Error obteniendo estados de garantía:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/garantias/prestamo/:prestamoId
 * @desc Obtener garantías de un préstamo específico
 * @access Private
 */
router.get('/prestamo/:prestamoId', async (req, res) => {
    try {
        const { prestamoId } = req.params;
        
        const garantias = await GarantiasService.obtenerGarantiasPorPrestamo(prestamoId);
        
        // Filtrar por usuario
        const garantiasUsuario = garantias.filter(g => g.userId === req.user.userId);
        
        res.json({
            success: true,
            data: garantiasUsuario
        });
        
    } catch (error) {
        console.error('Error obteniendo garantías del préstamo:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/garantias/:id
 * @desc Obtener garantía por ID
 * @access Private
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const garantia = await GarantiasService.obtenerGarantiaPorId(id);
        
        // Verificar que pertenezca al usuario
        if (garantia.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para ver esta garantía'
            });
        }
        
        res.json({
            success: true,
            data: garantia
        });
        
    } catch (error) {
        console.error('Error obteniendo garantía:', error);
        res.status(404).json({
            success: false,
            message: error.message || 'Garantía no encontrada'
        });
    }
});

/**
 * @route POST /api/garantias
 * @desc Crear nueva garantía
 * @access Private
 */
router.post('/', async (req, res) => {
    try {
        const userData = {
            userId: req.user.userId,
            username: req.user.username
        };
        
        const garantia = await GarantiasService.crearGarantia(req.body, userData);
        
        res.status(201).json({
            success: true,
            data: garantia,
            message: 'Garantía creada exitosamente'
        });
        
    } catch (error) {
        console.error('Error creando garantía:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al crear garantía'
        });
    }
});

/**
 * @route PUT /api/garantias/:id
 * @desc Actualizar garantía
 * @access Private
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para editar esta garantía'
            });
        }
        
        const garantia = await GarantiasService.actualizarGarantia(id, req.body);
        
        res.json({
            success: true,
            data: garantia,
            message: 'Garantía actualizada exitosamente'
        });
        
    } catch (error) {
        console.error('Error actualizando garantía:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al actualizar garantía'
        });
    }
});

/**
 * @route DELETE /api/garantias/:id
 * @desc Eliminar garantía
 * @access Private
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para eliminar esta garantía'
            });
        }
        
        const resultado = await GarantiasService.eliminarGarantia(id);
        
        res.json({
            success: true,
            data: resultado,
            message: 'Garantía eliminada exitosamente'
        });
        
    } catch (error) {
        console.error('Error eliminando garantía:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al eliminar garantía'
        });
    }
});

/**
 * @route POST /api/garantias/:id/aprobar
 * @desc Aprobar garantía
 * @access Private
 */
router.post('/:id/aprobar', async (req, res) => {
    try {
        const { id } = req.params;
        const { valorTasacion, observaciones } = req.body;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para aprobar esta garantía'
            });
        }
        
        const garantia = await GarantiasService.aprobarGarantia(id, valorTasacion, observaciones);
        
        res.json({
            success: true,
            data: garantia,
            message: 'Garantía aprobada exitosamente'
        });
        
    } catch (error) {
        console.error('Error aprobando garantía:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al aprobar garantía'
        });
    }
});

/**
 * @route POST /api/garantias/:id/rechazar
 * @desc Rechazar garantía
 * @access Private
 */
router.post('/:id/rechazar', async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para rechazar esta garantía'
            });
        }
        
        const garantia = await GarantiasService.rechazarGarantia(id, motivo);
        
        res.json({
            success: true,
            data: garantia,
            message: 'Garantía rechazada exitosamente'
        });
        
    } catch (error) {
        console.error('Error rechazando garantía:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al rechazar garantía'
        });
    }
});

/**
 * @route POST /api/garantias/:id/activar
 * @desc Activar garantía
 * @access Private
 */
router.post('/:id/activar', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para activar esta garantía'
            });
        }
        
        const garantia = await GarantiasService.activarGarantia(id);
        
        res.json({
            success: true,
            data: garantia,
            message: 'Garantía activada exitosamente'
        });
        
    } catch (error) {
        console.error('Error activando garantía:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al activar garantía'
        });
    }
});

/**
 * @route POST /api/garantias/:id/liberar
 * @desc Liberar garantía
 * @access Private
 */
router.post('/:id/liberar', async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo } = req.body;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para liberar esta garantía'
            });
        }
        
        const garantia = await GarantiasService.liberarGarantia(id, motivo);
        
        res.json({
            success: true,
            data: garantia,
            message: 'Garantía liberada exitosamente'
        });
        
    } catch (error) {
        console.error('Error liberando garantía:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al liberar garantía'
        });
    }
});

/**
 * @route POST /api/garantias/:id/ejecutar
 * @desc Ejecutar garantía
 * @access Private
 */
router.post('/:id/ejecutar', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para ejecutar esta garantía'
            });
        }
        
        const garantia = await GarantiasService.ejecutarGarantia(id, req.body);
        
        res.json({
            success: true,
            data: garantia,
            message: 'Garantía ejecutada exitosamente'
        });
        
    } catch (error) {
        console.error('Error ejecutando garantía:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al ejecutar garantía'
        });
    }
});

/**
 * @route GET /api/garantias/:id/cobertura
 * @desc Calcular cobertura de garantía
 * @access Private
 */
router.get('/:id/cobertura', async (req, res) => {
    try {
        const { id } = req.params;
        const { montoCredito } = req.query;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para ver esta garantía'
            });
        }
        
        const cobertura = await GarantiasService.calcularCobertura(
            id, 
            montoCredito ? parseFloat(montoCredito) : null
        );
        
        res.json({
            success: true,
            data: cobertura
        });
        
    } catch (error) {
        console.error('Error calculando cobertura:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al calcular cobertura'
        });
    }
});

/**
 * @route GET /api/garantias/:id/documentacion
 * @desc Validar documentación de garantía
 * @access Private
 */
router.get('/:id/documentacion', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para ver esta garantía'
            });
        }
        
        const validacion = await GarantiasService.validarDocumentacion(id);
        
        res.json({
            success: true,
            data: validacion
        });
        
    } catch (error) {
        console.error('Error validando documentación:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al validar documentación'
        });
    }
});

/**
 * @route GET /api/garantias/:id/seguros
 * @desc Verificar seguros de garantía
 * @access Private
 */
router.get('/:id/seguros', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para ver esta garantía'
            });
        }
        
        const verificacion = await GarantiasService.verificarSeguros(id);
        
        res.json({
            success: true,
            data: verificacion
        });
        
    } catch (error) {
        console.error('Error verificando seguros:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al verificar seguros'
        });
    }
});

/**
 * @route POST /api/garantias/:id/seguros
 * @desc Agregar seguro a garantía
 * @access Private
 */
router.post('/:id/seguros', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la garantía pertenezca al usuario
        const garantiaExistente = await GarantiasService.obtenerGarantiaPorId(id);
        if (garantiaExistente.userId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permisos para modificar esta garantía'
            });
        }
        
        const garantia = await GarantiasService.agregarSeguro(id, req.body);
        
        res.json({
            success: true,
            data: garantia,
            message: 'Seguro agregado exitosamente'
        });
        
    } catch (error) {
        console.error('Error agregando seguro:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al agregar seguro'
        });
    }
});

module.exports = router;
