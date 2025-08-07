const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authenticate');
const PrestamosService = require('../../services/Finanzas/prestamosService');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// ==================== RUTAS PRINCIPALES ====================

/**
 * @route GET /api/prestamos
 * @desc Obtener todos los préstamos con filtros
 */
router.get('/', async (req, res) => {
    try {
        const filtros = {
            userId: req.user.id, // ✅ Corregido: usar req.user.id en lugar de req.user.userId
            estado: req.query.estado,
            tipo: req.query.tipo,
            entidad: req.query.entidad,
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin,
            montoMin: req.query.montoMin,
            montoMax: req.query.montoMax,
            buscar: req.query.buscar
        };
        
        const limite = parseInt(req.query.limite) || 50;
        const pagina = parseInt(req.query.pagina) || 1;
        
        const resultado = await PrestamosService.obtenerPrestamos(filtros, limite, pagina);
        
        res.json({
            success: true,
            data: resultado.prestamos,
            paginacion: resultado.paginacion,
            mensaje: `${resultado.prestamos.length} préstamos obtenidos exitosamente`
        });
        
    } catch (error) {
        console.error('Error obteniendo préstamos:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/prestamos/:id
 * @desc Obtener un préstamo por ID
 */
router.get('/:id', async (req, res) => {
    try {
        const prestamo = await PrestamosService.obtenerPrestamoPorId(req.params.id);
        
        res.json({
            success: true,
            data: prestamo,
            mensaje: 'Préstamo obtenido exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo préstamo:', error);
        res.status(error.message.includes('no encontrado') ? 404 : 500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route POST /api/prestamos
 * @desc Crear nuevo préstamo
 */
router.post('/', async (req, res) => {
    try {
        const userData = {
            userId: req.user.clerk_id, // 🔧 Usar clerk_id para consistencia con movimientos de caja
            creatorId: req.user.id, // ObjectId del usuario en la base de datos
            creatorName: req.user.nombre_negocio || req.user.email,
            creatorEmail: req.user.email,
            creatorRole: req.user.role || 'user'
        };
        
        const prestamo = await PrestamosService.crearPrestamo(req.body, userData);
        
        res.status(201).json({
            success: true,
            data: prestamo,
            mensaje: 'Préstamo creado exitosamente'
        });
        
    } catch (error) {
        console.error('Error creando préstamo:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al crear préstamo'
        });
    }
});

/**
 * @route PUT /api/prestamos/:id
 * @desc Actualizar préstamo
 */
router.put('/:id', async (req, res) => {
    try {
        const prestamo = await PrestamosService.actualizarPrestamo(req.params.id, req.body);
        
        res.json({
            success: true,
            data: prestamo,
            mensaje: 'Préstamo actualizado exitosamente'
        });
        
    } catch (error) {
        console.error('Error actualizando préstamo:', error);
        res.status(error.message.includes('no encontrado') ? 404 : 400).json({
            success: false,
            message: error.message || 'Error al actualizar préstamo'
        });
    }
});

/**
 * @route DELETE /api/prestamos/:id
 * @desc Eliminar préstamo
 */
router.delete('/:id', async (req, res) => {
    try {
        const resultado = await PrestamosService.eliminarPrestamo(req.params.id);
        
        res.json({
            success: true,
            data: resultado,
            mensaje: 'Préstamo eliminado exitosamente'
        });
        
    } catch (error) {
        console.error('Error eliminando préstamo:', error);
        res.status(error.message.includes('no encontrado') ? 404 : 400).json({
            success: false,
            message: error.message || 'Error al eliminar préstamo'
        });
    }
});

// ==================== OPERACIONES ESPECÍFICAS ====================

/**
 * @route POST /api/prestamos/:id/aprobar
 * @desc Aprobar préstamo
 */
router.post('/:id/aprobar', async (req, res) => {
    try {
        const { montoAprobado, observaciones } = req.body;
        
        const prestamo = await PrestamosService.aprobarPrestamo(
            req.params.id, 
            montoAprobado, 
            observaciones
        );
        
        res.json({
            success: true,
            data: prestamo,
            mensaje: 'Préstamo aprobado exitosamente'
        });
        
    } catch (error) {
        console.error('Error aprobando préstamo:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al aprobar préstamo'
        });
    }
});

/**
 * @route POST /api/prestamos/:id/desembolsar
 * @desc Desembolsar préstamo
 */
router.post('/:id/desembolsar', async (req, res) => {
    try {
        const { montoDesembolsado, cuentaDesembolsoId, observaciones } = req.body;
        
        const userData = {
            userId: req.user.clerk_id, // 🔧 Usar clerk_id para consistencia con movimientos de caja
            creatorId: req.user.id, // ObjectId del usuario en la base de datos
            creatorName: req.user.nombre_negocio || req.user.email,
            creatorEmail: req.user.email,
            creatorRole: req.user.role || 'user'
        };
        
        const resultado = await PrestamosService.desembolsarPrestamo(
            req.params.id, 
            montoDesembolsado, 
            cuentaDesembolsoId, 
            observaciones,
            userData
        );
        
        res.json({
            success: true,
            data: resultado,
            mensaje: 'Préstamo desembolsado exitosamente'
        });
        
    } catch (error) {
        console.error('Error desembolsando préstamo:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al desembolsar préstamo'
        });
    }
});

/**
 * @route POST /api/prestamos/:id/cancelar
 * @desc Cancelar préstamo
 */
router.post('/:id/cancelar', async (req, res) => {
    try {
        const { motivo } = req.body;
        
        const prestamo = await PrestamosService.cancelarPrestamo(req.params.id, motivo);
        
        res.json({
            success: true,
            data: prestamo,
            mensaje: 'Préstamo cancelado exitosamente'
        });
        
    } catch (error) {
        console.error('Error cancelando préstamo:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al cancelar préstamo'
        });
    }
});

// ==================== CONSULTAS Y REPORTES ====================

/**
 * @route GET /api/prestamos/:id/tabla-amortizacion
 * @desc Obtener tabla de amortización del préstamo
 */
router.get('/:id/tabla-amortizacion', async (req, res) => {
    try {
        const tabla = await PrestamosService.obtenerTablaAmortizacion(req.params.id);
        
        res.json({
            success: true,
            data: tabla,
            mensaje: 'Tabla de amortización obtenida exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo tabla de amortización:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al obtener tabla de amortización'
        });
    }
});

/**
 * @route GET /api/prestamos/:id/pagos
 * @desc Obtener pagos del préstamo
 */
router.get('/:id/pagos', async (req, res) => {
    try {
        const estado = req.query.estado;
        const limite = parseInt(req.query.limite) || 50;
        const pagina = parseInt(req.query.pagina) || 1;
        
        const resultado = await PrestamosService.obtenerPagosPrestamo(
            req.params.id, 
            estado, 
            limite, 
            pagina
        );
        
        res.json({
            success: true,
            data: resultado.pagos,
            paginacion: resultado.paginacion,
            mensaje: `${resultado.pagos.length} pagos obtenidos exitosamente`
        });
        
    } catch (error) {
        console.error('Error obteniendo pagos del préstamo:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al obtener pagos'
        });
    }
});

/**
 * @route GET /api/prestamos/:id/garantias
 * @desc Obtener garantías del préstamo
 */
router.get('/:id/garantias', async (req, res) => {
    try {
        const garantias = await PrestamosService.obtenerGarantiasPrestamo(req.params.id);
        
        res.json({
            success: true,
            data: garantias,
            mensaje: `${garantias.length} garantías obtenidas exitosamente`
        });
        
    } catch (error) {
        console.error('Error obteniendo garantías del préstamo:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al obtener garantías'
        });
    }
});

/**
 * @route GET /api/prestamos/vencidos
 * @desc Obtener préstamos vencidos
 */
router.get('/consultas/vencidos', async (req, res) => {
    try {
        const prestamosVencidos = await PrestamosService.obtenerPrestamosVencidos(req.user.userId);
        
        res.json({
            success: true,
            data: prestamosVencidos,
            mensaje: `${prestamosVencidos.length} préstamos vencidos encontrados`
        });
        
    } catch (error) {
        console.error('Error obteniendo préstamos vencidos:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/prestamos/proximos-vencer
 * @desc Obtener préstamos próximos a vencer
 */
router.get('/consultas/proximos-vencer', async (req, res) => {
    try {
        const dias = parseInt(req.query.dias) || 30;
        const prestamosProximos = await PrestamosService.obtenerPrestamosProximosVencer(dias, req.user.userId);
        
        res.json({
            success: true,
            data: prestamosProximos,
            mensaje: `${prestamosProximos.length} préstamos próximos a vencer encontrados`
        });
        
    } catch (error) {
        console.error('Error obteniendo préstamos próximos a vencer:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/prestamos/estadisticas
 * @desc Obtener estadísticas de préstamos
 */
router.get('/reportes/estadisticas', async (req, res) => {
    try {
        const estadisticas = await PrestamosService.obtenerEstadisticas(req.user.userId);
        
        res.json({
            success: true,
            data: estadisticas,
            mensaje: 'Estadísticas obtenidas exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/prestamos/resumen
 * @desc Obtener resumen de préstamos
 */
router.get('/reportes/resumen', async (req, res) => {
    try {
        const resumen = await PrestamosService.obtenerResumenPrestamos(req.user.userId);
        
        res.json({
            success: true,
            data: resumen,
            mensaje: 'Resumen obtenido exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo resumen:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

// ==================== UTILIDADES ====================

/**
 * @route GET /api/prestamos/utilidades/entidades
 * @desc Obtener lista de entidades financieras
 */
router.get('/utilidades/entidades', (req, res) => {
    try {
        const entidades = PrestamosService.obtenerEntidadesFinancieras();
        
        res.json({
            success: true,
            data: entidades,
            mensaje: 'Entidades financieras obtenidas exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo entidades:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/prestamos/utilidades/tipos
 * @desc Obtener tipos de préstamo disponibles
 */
router.get('/utilidades/tipos', (req, res) => {
    try {
        const tipos = PrestamosService.obtenerTiposPrestamo();
        
        res.json({
            success: true,
            data: tipos,
            mensaje: 'Tipos de préstamo obtenidos exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo tipos:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route POST /api/prestamos/utilidades/calcular-cuota
 * @desc Calcular cuota mensual
 */
router.post('/utilidades/calcular-cuota', (req, res) => {
    try {
        const { monto, tasaInteres, plazoMeses } = req.body;
        
        if (!monto || !tasaInteres || !plazoMeses) {
            return res.status(400).json({
                success: false,
                message: 'Monto, tasa de interés y plazo son requeridos'
            });
        }
        
        const cuota = PrestamosService.calcularCuotaMensual(monto, tasaInteres, plazoMeses);
        
        res.json({
            success: true,
            data: {
                monto,
                tasaInteres,
                plazoMeses,
                cuotaMensual: cuota,
                totalAPagar: cuota * plazoMeses,
                totalIntereses: (cuota * plazoMeses) - monto
            },
            mensaje: 'Cuota calculada exitosamente'
        });
        
    } catch (error) {
        console.error('Error calculando cuota:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al calcular cuota'
        });
    }
});

module.exports = router;
