const express = require('express');
const router = express.Router();
const MovimientosCajaFinanzasService = require('../../services/Finanzas/movimientosCajaFinanzasService');
const { authenticate } = require('../../middleware/authenticate');

// === REGISTRAR MOVIMIENTOS ===

/**
 * POST /api/movimientos-caja/ingreso
 * Registrar nuevo ingreso
 */
router.post('/ingreso', authenticate, async (req, res) => {
    try {
        console.log('📥 Registrando ingreso:', req.body);
        console.log('👤 Usuario autenticado:', req.user);
        
        const userData = {
            userId: req.user._id || req.user.id,
            creatorId: req.user._id || req.user.id,
            creatorName: req.user.nombre_negocio || req.user.firstName || 'Usuario',
            creatorEmail: req.user.email
        };
        
        console.log('📋 Datos de usuario para movimiento:', userData);
        
        const movimiento = await MovimientosCajaFinanzasService.registrarIngreso(req.body, userData);
        
        res.status(201).json({
            success: true,
            message: 'Ingreso registrado exitosamente',
            data: movimiento
        });
        
    } catch (error) {
        console.error('❌ Error registrando ingreso:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar ingreso',
            error: error.message
        });
    }
});

/**
 * POST /api/movimientos-caja/egreso
 * Registrar nuevo egreso
 */
router.post('/egreso', authenticate, async (req, res) => {
    try {
        console.log('📤 Registrando egreso:', req.body);
        console.log('👤 Usuario autenticado:', req.user);
        
        const userData = {
            userId: req.user._id || req.user.id,
            creatorId: req.user._id || req.user.id,
            creatorName: req.user.nombre_negocio || req.user.firstName || 'Usuario',
            creatorEmail: req.user.email
        };
        
        console.log('📋 Datos de usuario para movimiento:', userData);
        
        const movimiento = await MovimientosCajaFinanzasService.registrarEgreso(req.body, userData);
        
        res.status(201).json({
            success: true,
            message: 'Egreso registrado exitosamente',
            data: movimiento
        });
        
    } catch (error) {
        console.error('❌ Error registrando egreso:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar egreso',
            error: error.message
        });
    }
});

// === CONSULTAS ===

/**
 * GET /api/movimientos-caja/resumen-dia
 * Obtener resumen del día
 */
router.get('/resumen-dia', authenticate, async (req, res) => {
    try {
        const fecha = req.query.fecha ? new Date(req.query.fecha) : new Date();
        const userId = req.user._id || req.user.id;
        
        console.log('📊 Obteniendo resumen para usuario:', userId);
        console.log('📅 Fecha de consulta:', fecha);
        
        const resumen = await MovimientosCajaFinanzasService.obtenerResumenDia(userId, fecha);
        
        console.log('✅ Resumen obtenido:', resumen);
        
        res.json({
            success: true,
            data: resumen
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo resumen:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener resumen',
            error: error.message
        });
    }
});

/**
 * GET /api/movimientos-caja/movimientos
 * Obtener lista de movimientos con filtros
 */
router.get('/movimientos', authenticate, async (req, res) => {
    try {
        const {
            fechaInicio,
            fechaFin,
            tipo,
            categoria,
            metodoPago,
            estado,
            limite,
            pagina
        } = req.query;
        
        const filtros = {};
        
        if (fechaInicio) filtros.fechaInicio = new Date(fechaInicio);
        if (fechaFin) filtros.fechaFin = new Date(fechaFin);
        if (tipo) filtros.tipo = tipo;
        if (categoria) filtros.categoria = categoria;
        if (metodoPago) filtros.metodoPago = metodoPago;
        if (estado) filtros.estado = estado;
        if (limite) filtros.limite = parseInt(limite);
        if (pagina) filtros.pagina = parseInt(pagina);
        
        const resultado = await MovimientosCajaFinanzasService.obtenerMovimientos(req.user._id || req.user.id, filtros);
        
        res.json({
            success: true,
            data: resultado
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo movimientos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener movimientos',
            error: error.message
        });
    }
});

/**
 * GET /api/movimientos-caja/arqueo
 * Obtener arqueo de caja (conteo físico)
 */
router.get('/arqueo', authenticate, async (req, res) => {
    try {
        const fecha = req.query.fecha ? new Date(req.query.fecha) : new Date();
        const arqueo = await MovimientosCajaFinanzasService.generarArqueo(req.user._id || req.user.id, fecha);
        
        res.json({
            success: true,
            data: arqueo
        });
        
    } catch (error) {
        console.error('❌ Error generando arqueo:', error);
        res.status(500).json({
            success: false,
            message: 'Error al generar arqueo',
            error: error.message
        });
    }
});

/**
 * GET /api/movimientos-caja/estadisticas-metodos-pago
 * Obtener estadísticas por método de pago
 */
router.get('/estadisticas-metodos-pago', authenticate, async (req, res) => {
    try {
        const fechaInicio = req.query.fechaInicio ? new Date(req.query.fechaInicio) : new Date(new Date().setDate(1));
        const fechaFin = req.query.fechaFin ? new Date(req.query.fechaFin) : new Date();
        
        const estadisticas = await MovimientosCajaFinanzasService.obtenerEstadisticasMetodosPago(
            req.user._id || req.user.id,
            fechaInicio,
            fechaFin
        );
        
        res.json({
            success: true,
            data: estadisticas
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas',
            error: error.message
        });
    }
});

// === OPERACIONES ESPECIALES ===

/**
 * PUT /api/movimientos-caja/:id/validar
 * Validar un movimiento
 */
router.put('/:id/validar', authenticate, async (req, res) => {
    try {
        const { observaciones } = req.body;
        const validadorData = {
            validadorId: req.user._id || req.user.id,
            validadorNombre: req.user.username || req.user.firstName || 'Usuario'
        };
        
        const movimiento = await MovimientosCajaFinanzasService.validarMovimiento(
            req.params.id,
            validadorData,
            observaciones
        );
        
        res.json({
            success: true,
            message: 'Movimiento validado exitosamente',
            data: movimiento
        });
        
    } catch (error) {
        console.error('❌ Error validando movimiento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al validar movimiento',
            error: error.message
        });
    }
});

/**
 * PUT /api/movimientos-caja/:id/anular
 * Anular un movimiento
 */
router.put('/:id/anular', authenticate, async (req, res) => {
    try {
        const { motivo } = req.body;
        
        if (!motivo) {
            return res.status(400).json({
                success: false,
                message: 'El motivo de anulación es requerido'
            });
        }
        
        const movimiento = await MovimientosCajaFinanzasService.anularMovimiento(
            req.params.id,
            motivo,
            req.user._id || req.user.id
        );
        
        res.json({
            success: true,
            message: 'Movimiento anulado exitosamente',
            data: movimiento
        });
        
    } catch (error) {
        console.error('❌ Error anulando movimiento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al anular movimiento',
            error: error.message
        });
    }
});

// === UTILIDADES ===

/**
 * GET /api/movimientos-caja/categorias
 * Obtener categorías disponibles
 */
router.get('/categorias', (req, res) => {
    try {
        const categorias = MovimientosCajaFinanzasService.obtenerCategorias();
        
        res.json({
            success: true,
            data: categorias
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo categorías:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener categorías',
            error: error.message
        });
    }
});

/**
 * GET /api/movimientos-caja/metodos-pago
 * Obtener métodos de pago disponibles
 */
router.get('/metodos-pago', (req, res) => {
    try {
        const metodos = MovimientosCajaFinanzasService.obtenerMetodosPago();
        
        res.json({
            success: true,
            data: metodos
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo métodos de pago:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener métodos de pago',
            error: error.message
        });
    }
});

module.exports = router;
