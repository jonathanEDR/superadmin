const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authenticate');
const PagosFinanciamientoService = require('../../services/Finanzas/pagosFinanciamientoService');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// ==================== RUTAS PRINCIPALES ====================

/**
 * @route GET /api/pagos-financiamiento
 * @desc Obtener todos los pagos de financiamiento con filtros
 */
router.get('/', async (req, res) => {
    try {
        const filtros = {
            userId: req.user.userId,
            prestamoId: req.query.prestamoId,
            estado: req.query.estado,
            tipo: req.query.tipo,
            fechaInicio: req.query.fechaInicio,
            fechaFin: req.query.fechaFin,
            montoMin: req.query.montoMin,
            montoMax: req.query.montoMax,
            buscar: req.query.buscar
        };
        
        const limite = parseInt(req.query.limite) || 50;
        const pagina = parseInt(req.query.pagina) || 1;
        
        const resultado = await PagosFinanciamientoService.obtenerPagos(filtros, limite, pagina);
        
        res.json({
            success: true,
            data: resultado.pagos,
            paginacion: resultado.paginacion,
            mensaje: `${resultado.pagos.length} pagos obtenidos exitosamente`
        });
        
    } catch (error) {
        console.error('Error obteniendo pagos:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/pagos-financiamiento/:id
 * @desc Obtener un pago por ID
 */
router.get('/:id', async (req, res) => {
    try {
        const pago = await PagosFinanciamientoService.obtenerPagoPorId(req.params.id);
        
        res.json({
            success: true,
            data: pago,
            mensaje: 'Pago obtenido exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo pago:', error);
        res.status(error.message.includes('no encontrado') ? 404 : 500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route POST /api/pagos-financiamiento
 * @desc Registrar nuevo pago
 */
router.post('/', async (req, res) => {
    try {
        const userData = {
            userId: req.user.userId,
            creatorId: req.user.userId,
            creatorName: req.user.name || req.user.email,
            creatorEmail: req.user.email,
            creatorRole: req.user.role || 'user'
        };
        
        const pago = await PagosFinanciamientoService.registrarPago(req.body, userData);
        
        res.status(201).json({
            success: true,
            data: pago,
            mensaje: 'Pago registrado exitosamente'
        });
        
    } catch (error) {
        console.error('Error registrando pago:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al registrar pago'
        });
    }
});

/**
 * @route PUT /api/pagos-financiamiento/:id
 * @desc Actualizar pago
 */
router.put('/:id', async (req, res) => {
    try {
        const pago = await PagosFinanciamientoService.actualizarPago(req.params.id, req.body);
        
        res.json({
            success: true,
            data: pago,
            mensaje: 'Pago actualizado exitosamente'
        });
        
    } catch (error) {
        console.error('Error actualizando pago:', error);
        res.status(error.message.includes('no encontrado') ? 404 : 400).json({
            success: false,
            message: error.message || 'Error al actualizar pago'
        });
    }
});

// ==================== OPERACIONES ESPECÍFICAS ====================

/**
 * @route POST /api/pagos-financiamiento/:id/procesar
 * @desc Procesar pago
 */
router.post('/:id/procesar', async (req, res) => {
    try {
        const { montoPagado, metodoPago, numeroOperacion, cuentaOrigenId } = req.body;
        
        const userData = {
            userId: req.user.userId,
            creatorId: req.user.userId,
            creatorName: req.user.name || req.user.email,
            creatorEmail: req.user.email,
            creatorRole: req.user.role || 'user'
        };
        
        const resultado = await PagosFinanciamientoService.procesarPago(
            req.params.id,
            montoPagado,
            metodoPago,
            numeroOperacion,
            cuentaOrigenId,
            userData
        );
        
        res.json({
            success: true,
            data: resultado,
            mensaje: 'Pago procesado exitosamente'
        });
        
    } catch (error) {
        console.error('Error procesando pago:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al procesar pago'
        });
    }
});

/**
 * @route POST /api/pagos-financiamiento/:id/rechazar
 * @desc Rechazar pago
 */
router.post('/:id/rechazar', async (req, res) => {
    try {
        const { motivo } = req.body;
        
        const pago = await PagosFinanciamientoService.rechazarPago(req.params.id, motivo);
        
        res.json({
            success: true,
            data: pago,
            mensaje: 'Pago rechazado exitosamente'
        });
        
    } catch (error) {
        console.error('Error rechazando pago:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al rechazar pago'
        });
    }
});

/**
 * @route POST /api/pagos-financiamiento/:id/cancelar
 * @desc Cancelar pago
 */
router.post('/:id/cancelar', async (req, res) => {
    try {
        const { motivo } = req.body;
        
        const pago = await PagosFinanciamientoService.cancelarPago(req.params.id, motivo);
        
        res.json({
            success: true,
            data: pago,
            mensaje: 'Pago cancelado exitosamente'
        });
        
    } catch (error) {
        console.error('Error cancelando pago:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al cancelar pago'
        });
    }
});

/**
 * @route POST /api/pagos-financiamiento/:id/aplicar-descuento
 * @desc Aplicar descuento a un pago
 */
router.post('/:id/aplicar-descuento', async (req, res) => {
    try {
        const { tipo, monto, porcentaje, descripcion } = req.body;
        
        const pago = await PagosFinanciamientoService.aplicarDescuento(
            req.params.id,
            tipo,
            monto,
            porcentaje,
            descripcion
        );
        
        res.json({
            success: true,
            data: pago,
            mensaje: 'Descuento aplicado exitosamente'
        });
        
    } catch (error) {
        console.error('Error aplicando descuento:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al aplicar descuento'
        });
    }
});

/**
 * @route POST /api/pagos-financiamiento/:id/calcular-mora
 * @desc Calcular mora de un pago
 */
router.post('/:id/calcular-mora', async (req, res) => {
    try {
        const { tasaMoraDiaria } = req.body;
        
        const pago = await PagosFinanciamientoService.calcularMora(
            req.params.id,
            tasaMoraDiaria
        );
        
        res.json({
            success: true,
            data: pago,
            mensaje: 'Mora calculada exitosamente'
        });
        
    } catch (error) {
        console.error('Error calculando mora:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al calcular mora'
        });
    }
});

// ==================== CONSULTAS Y REPORTES ====================

/**
 * @route GET /api/pagos-financiamiento/vencidos
 * @desc Obtener pagos vencidos
 */
router.get('/consultas/vencidos', async (req, res) => {
    try {
        const pagosVencidos = await PagosFinanciamientoService.obtenerPagosVencidos(req.user.userId);
        
        res.json({
            success: true,
            data: pagosVencidos,
            mensaje: `${pagosVencidos.length} pagos vencidos encontrados`
        });
        
    } catch (error) {
        console.error('Error obteniendo pagos vencidos:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/pagos-financiamiento/proximos-vencer
 * @desc Obtener pagos próximos a vencer
 */
router.get('/consultas/proximos-vencer', async (req, res) => {
    try {
        const dias = parseInt(req.query.dias) || 7;
        const pagosProximos = await PagosFinanciamientoService.obtenerPagosProximosVencer(dias, req.user.userId);
        
        res.json({
            success: true,
            data: pagosProximos,
            mensaje: `${pagosProximos.length} pagos próximos a vencer encontrados`
        });
        
    } catch (error) {
        console.error('Error obteniendo pagos próximos a vencer:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/pagos-financiamiento/por-prestamo/:prestamoId
 * @desc Obtener pagos de un préstamo específico
 */
router.get('/por-prestamo/:prestamoId', async (req, res) => {
    try {
        const estado = req.query.estado;
        const limite = parseInt(req.query.limite) || 50;
        const pagina = parseInt(req.query.pagina) || 1;
        
        const resultado = await PagosFinanciamientoService.obtenerPagosPorPrestamo(
            req.params.prestamoId,
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
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/pagos-financiamiento/estadisticas
 * @desc Obtener estadísticas de pagos
 */
router.get('/reportes/estadisticas', async (req, res) => {
    try {
        const fechaInicio = req.query.fechaInicio;
        const fechaFin = req.query.fechaFin;
        
        const estadisticas = await PagosFinanciamientoService.obtenerEstadisticas(
            req.user.userId,
            fechaInicio,
            fechaFin
        );
        
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
 * @route GET /api/pagos-financiamiento/resumen-periodo
 * @desc Obtener resumen de pagos por período
 */
router.get('/reportes/resumen-periodo', async (req, res) => {
    try {
        const fechaInicio = req.query.fechaInicio;
        const fechaFin = req.query.fechaFin;
        const agruparPor = req.query.agruparPor || 'mes';
        
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                message: 'Fecha de inicio y fin son requeridas'
            });
        }
        
        const resumen = await PagosFinanciamientoService.obtenerResumenPorPeriodo(
            req.user.userId,
            fechaInicio,
            fechaFin,
            agruparPor
        );
        
        res.json({
            success: true,
            data: resumen,
            mensaje: 'Resumen por período obtenido exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo resumen por período:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/pagos-financiamiento/cronograma/:prestamoId
 * @desc Obtener cronograma de pagos de un préstamo
 */
router.get('/cronograma/:prestamoId', async (req, res) => {
    try {
        const cronograma = await PagosFinanciamientoService.obtenerCronogramaPagos(req.params.prestamoId);
        
        res.json({
            success: true,
            data: cronograma,
            mensaje: 'Cronograma de pagos obtenido exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo cronograma:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

// ==================== OPERACIONES MASIVAS ====================

/**
 * @route POST /api/pagos-financiamiento/generar-cronograma
 * @desc Generar cronograma de pagos para un préstamo
 */
router.post('/generar-cronograma', async (req, res) => {
    try {
        const { prestamoId } = req.body;
        
        const userData = {
            userId: req.user.userId,
            creatorId: req.user.userId,
            creatorName: req.user.name || req.user.email,
            creatorEmail: req.user.email,
            creatorRole: req.user.role || 'user'
        };
        
        const cronograma = await PagosFinanciamientoService.generarCronogramaPagos(prestamoId, userData);
        
        res.status(201).json({
            success: true,
            data: cronograma,
            mensaje: 'Cronograma de pagos generado exitosamente'
        });
        
    } catch (error) {
        console.error('Error generando cronograma:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al generar cronograma'
        });
    }
});

/**
 * @route POST /api/pagos-financiamiento/procesar-lote
 * @desc Procesar múltiples pagos
 */
router.post('/procesar-lote', async (req, res) => {
    try {
        const { pagos } = req.body;
        
        const userData = {
            userId: req.user.userId,
            creatorId: req.user.userId,
            creatorName: req.user.name || req.user.email,
            creatorEmail: req.user.email,
            creatorRole: req.user.role || 'user'
        };
        
        const resultado = await PagosFinanciamientoService.procesarPagosEnLote(pagos, userData);
        
        res.json({
            success: true,
            data: resultado,
            mensaje: 'Lote de pagos procesado exitosamente'
        });
        
    } catch (error) {
        console.error('Error procesando lote de pagos:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error al procesar lote de pagos'
        });
    }
});

// ==================== UTILIDADES ====================

/**
 * @route GET /api/pagos-financiamiento/utilidades/metodos-pago
 * @desc Obtener métodos de pago disponibles
 */
router.get('/utilidades/metodos-pago', (req, res) => {
    try {
        const metodos = PagosFinanciamientoService.obtenerMetodosPago();
        
        res.json({
            success: true,
            data: metodos,
            mensaje: 'Métodos de pago obtenidos exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo métodos de pago:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

/**
 * @route GET /api/pagos-financiamiento/utilidades/tipos-descuento
 * @desc Obtener tipos de descuento disponibles
 */
router.get('/utilidades/tipos-descuento', (req, res) => {
    try {
        const tipos = PagosFinanciamientoService.obtenerTiposDescuento();
        
        res.json({
            success: true,
            data: tipos,
            mensaje: 'Tipos de descuento obtenidos exitosamente'
        });
        
    } catch (error) {
        console.error('Error obteniendo tipos de descuento:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error interno del servidor'
        });
    }
});

module.exports = router;
