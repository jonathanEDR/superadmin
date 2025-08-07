const express = require('express');
const router = express.Router();
const finanzasService = require('../../services/Finanzas/finanzasService');
const cuentasBancariasService = require('../../services/Finanzas/cuentasBancariasService');
const { authenticate, requireAdmin, requireUser } = require('../../middleware/authenticate');

// Importar sub-rutas
const cuentasBancariasRoutes = require('./cuentasBancariasRoutes');
const movimientosCajaRoutes = require('./movimientosCajaRoutes');


// Middleware de autenticación para las rutas protegidas
router.use(authenticate);

// ==================== SUB-RUTAS ANIDADAS ====================
// IMPORTANTE: Registrar las sub-rutas ANTES que las rutas principales
// para evitar conflictos de coincidencia de patrones

// Rutas de cuentas bancarias anidadas: /api/finanzas/cuentas-bancarias
// ...existing code...
router.use('/cuentas-bancarias', cuentasBancariasRoutes);
// ...existing code...

// Rutas de movimientos de caja anidadas: /api/finanzas/movimientos-caja
// ...existing code...
router.use('/movimientos-caja', movimientosCajaRoutes);
// ...existing code...

// ==================== DASHBOARD PRINCIPAL ====================

// GET /api/finanzas/dashboard - Dashboard principal de finanzas
router.get('/dashboard', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const { periodo = 'mes' } = req.query;
        
        const dashboard = await finanzasService.obtenerDashboard(userId, periodo);
        
        res.json({
            success: true,
            data: dashboard,
            message: 'Dashboard de finanzas obtenido exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo dashboard de finanzas:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/finanzas/resumen - Resumen financiero consolidado
router.get('/resumen', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        
        // Obtener resumen de cuentas bancarias desde el servicio especializado
        const resumenCuentas = await cuentasBancariasService.obtenerResumenCuentas(userId);
        
        // Por ahora solo devolvemos el resumen de cuentas bancarias
        // En el futuro aquí se pueden agregar otros módulos financieros
        const resumen = {
            cuentasBancarias: resumenCuentas,
            prestamos: { total: 0, activos: 0 },
            inversiones: { total: 0, activas: 0 },
            garantias: { total: 0, activas: 0 }
        };
        
        res.json({
            success: true,
            data: resumen,
            message: 'Resumen financiero obtenido exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo resumen financiero:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== ESTADÍSTICAS GENERALES ====================

// GET /api/finanzas/estadisticas - Estadísticas generales del módulo
router.get('/estadisticas', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const { periodo = 'año' } = req.query;
        
        const estadisticas = await finanzasService.obtenerEstadisticasGenerales(userId, periodo);
        
        res.json({
            success: true,
            data: estadisticas,
            message: 'Estadísticas obtenidas exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/finanzas/kpis - Indicadores clave de rendimiento financiero
router.get('/kpis', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const { fechaInicio, fechaFin } = req.query;
        
        const kpis = await finanzasService.obtenerKPIsFinancieros(userId, fechaInicio, fechaFin);
        
        res.json({
            success: true,
            data: kpis,
            message: 'KPIs financieros obtenidos exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo KPIs:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== ALERTAS Y NOTIFICACIONES ====================

// GET /api/finanzas/alertas - Obtener alertas financieras
router.get('/alertas', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        
        const alertas = await finanzasService.obtenerAlertasFinancieras(userId);
        
        res.json({
            success: true,
            data: alertas,
            message: 'Alertas financieras obtenidas exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo alertas:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== REPORTES CONSOLIDADOS ====================

// GET /api/finanzas/reportes/estado-financiero - Estado financiero consolidado
router.get('/reportes/estado-financiero', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const { año, mes, incluirDetalle = false } = req.query;
        
        const estadoFinanciero = await finanzasService.generarEstadoFinanciero(
            userId,
            año ? parseInt(año) : new Date().getFullYear(),
            mes ? parseInt(mes) : new Date().getMonth() + 1,
            incluirDetalle === 'true'
        );
        
        res.json({
            success: true,
            data: estadoFinanciero,
            message: 'Estado financiero generado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error generando estado financiero:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/finanzas/reportes/flujo-efectivo - Reporte de flujo de efectivo
router.get('/reportes/flujo-efectivo', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const { fechaInicio, fechaFin, agruparPor = 'mes' } = req.query;
        
        const flujoEfectivo = await finanzasService.generarReporteFlujoEfectivo(
            userId,
            fechaInicio,
            fechaFin,
            agruparPor
        );
        
        res.json({
            success: true,
            data: flujoEfectivo,
            message: 'Reporte de flujo de efectivo generado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error generando reporte de flujo de efectivo:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== CONFIGURACIÓN DEL MÓDULO ====================

// GET /api/finanzas/configuracion - Obtener configuración del módulo
router.get('/configuracion', requireAdmin, async (req, res) => {
    try {
        // ...existing code...
        
        const configuracion = finanzasService.obtenerConfiguracionModulo();
        
        res.json({
            success: true,
            data: configuracion,
            message: 'Configuración obtenida exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo configuración:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/finanzas/inicializar - Inicializar datos por defecto
router.post('/inicializar', requireAdmin, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const userData = {
            userId,
            creatorId: req.user.clerk_id || req.user.id,
            creatorName: req.user.email?.split('@')[0] || 'Usuario',
            creatorEmail: req.user.email,
            creatorRole: req.user.role
        };
        
        const resultado = await finanzasService.inicializarDatosDefecto(userData);
        
        res.json({
            success: true,
            data: resultado,
            message: 'Datos por defecto inicializados exitosamente'
        });
    } catch (error) {
        console.error('❌ Error inicializando datos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== GARANTÍAS ====================

// GET /api/finanzas/garantias - Obtener todas las garantías
router.get('/garantias', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const { estado, tipo, desde, hasta, limite, pagina } = req.query;
        
        const garantias = await finanzasService.obtenerGarantias(userId, {
            estado,
            tipo,
            desde,
            hasta,
            limite: parseInt(limite) || 10,
            pagina: parseInt(pagina) || 1
        });
        
        res.json({
            success: true,
            data: Array.isArray(garantias) ? garantias : [],
            message: 'Garantías obtenidas exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo garantías:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            data: []
        });
    }
});

// POST /api/finanzas/garantias - Crear nueva garantía
router.post('/garantias', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const garantia = await finanzasService.crearGarantia(userId, req.body);
        
        res.status(201).json({
            success: true,
            data: garantia,
            message: 'Garantía creada exitosamente'
        });
    } catch (error) {
        console.error('❌ Error creando garantía:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== PRÉSTAMOS ====================

// GET /api/finanzas/prestamos - Obtener todos los préstamos
router.get('/prestamos', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const { estado, tipo, desde, hasta, limite, pagina } = req.query;
        
        const prestamos = await finanzasService.obtenerPrestamos(userId, {
            estado,
            tipo,
            desde,
            hasta,
            limite: parseInt(limite) || 10,
            pagina: parseInt(pagina) || 1
        });
        
        res.json({
            success: true,
            data: Array.isArray(prestamos) ? prestamos : [],
            message: 'Préstamos obtenidos exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo préstamos:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            data: []
        });
    }
});

// POST /api/finanzas/prestamos - Crear nuevo préstamo
router.post('/prestamos', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const prestamo = await finanzasService.crearPrestamo(userId, req.body);
        
        res.status(201).json({
            success: true,
            data: prestamo,
            message: 'Préstamo creado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error creando préstamo:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});



// ==================== PAGOS FINANCIAMIENTO ====================

// GET /api/finanzas/pagos-financiamiento - Obtener todos los pagos de financiamiento
router.get('/pagos-financiamiento', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const { estado, tipo, desde, hasta, limite, pagina } = req.query;
        
        const pagos = await finanzasService.obtenerPagosFinanciamiento(userId, {
            estado,
            tipo,
            desde,
            hasta,
            limite: parseInt(limite) || 10,
            pagina: parseInt(pagina) || 1
        });
        
        res.json({
            success: true,
            data: Array.isArray(pagos) ? pagos : [],
            message: 'Pagos de financiamiento obtenidos exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo pagos de financiamiento:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            data: []
        });
    }
});

// POST /api/finanzas/pagos-financiamiento - Crear nuevo pago de financiamiento
router.post('/pagos-financiamiento', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const userId = req.user.clerk_id || req.user.id;
        const pago = await finanzasService.crearPagoFinanciamiento(userId, req.body);
        
        res.status(201).json({
            success: true,
            data: pago,
            message: 'Pago de financiamiento creado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error creando pago de financiamiento:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== UTILITARIAS ====================

// GET /api/finanzas/categorias - Obtener categorías disponibles
router.get('/categorias', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const categorias = finanzasService.obtenerCategoriasFinancieras();
        
        res.json({
            success: true,
            data: categorias,
            message: 'Categorías obtenidas exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo categorías:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/finanzas/monedas - Obtener monedas soportadas
router.get('/monedas', requireUser, async (req, res) => {
    try {
        // ...existing code...
        
        const monedas = finanzasService.obtenerMonedasSoportadas();
        
        res.json({
            success: true,
            data: monedas,
            message: 'Monedas obtenidas exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo monedas:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
