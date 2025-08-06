const express = require('express');
const router = express.Router();
const finanzasService = require('../../services/Finanzas/finanzasService');
const cuentasBancariasService = require('../../services/Finanzas/cuentasBancariasService');
const { authenticate, requireAdmin, requireUser } = require('../../middleware/authenticate');

// Importar sub-rutas
const cuentasBancariasRoutes = require('./cuentasBancariasRoutes');

console.log('🎯 finanzasRoutes.js cargado correctamente');

// Middleware de logging para este router específico
router.use((req, res, next) => {
    console.log(`💰 Finanzas Route: ${req.method} ${req.originalUrl}`);
    console.log(`💰 Full path: ${req.baseUrl}${req.path}`);
    console.log(`💰 Query params:`, req.query);
    next();
});

// ==================== RUTAS PÚBLICAS DE PRUEBA ====================

// GET /api/finanzas/test - Endpoint de prueba (sin autenticación)
router.get('/test', (req, res) => {
    console.log('✅ Test endpoint alcanzado correctamente');
    res.json({
        success: true,
        message: 'Módulo de finanzas funcionando correctamente!',
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        modules: [
            'cuentas_bancarias',
            'movimientos_bancarios', 
            'flujo_caja',
            'prestamos',
            'inversiones',
            'proyecciones'
        ]
    });
});

// GET /api/finanzas/test-cuentas - Endpoint de prueba para cuentas bancarias (sin autenticación)
router.get('/test-cuentas', (req, res) => {
    console.log('✅ Test cuentas endpoint alcanzado');
    res.json({
        success: true,
        message: 'Endpoint de cuentas bancarias funcionando',
        timestamp: new Date().toISOString(),
        data: [
            {
                id: 1,
                nombre: 'Cuenta Test',
                banco: 'Banco Test',
                saldoActual: 1000,
                moneda: 'PEN'
            }
        ]
    });
});

// Middleware de autenticación para las rutas protegidas
router.use(authenticate);

// ==================== SUB-RUTAS ANIDADAS ====================
// IMPORTANTE: Registrar las sub-rutas ANTES que las rutas principales
// para evitar conflictos de coincidencia de patrones

// Rutas de cuentas bancarias anidadas: /api/finanzas/cuentas-bancarias
console.log('🏦 Registrando sub-rutas de cuentas bancarias...');
router.use('/cuentas-bancarias', cuentasBancariasRoutes);
console.log('✅ Sub-rutas de cuentas bancarias registradas exitosamente');

// ==================== DASHBOARD PRINCIPAL ====================

// GET /api/finanzas/dashboard - Dashboard principal de finanzas
router.get('/dashboard', requireUser, async (req, res) => {
    try {
        console.log('📊 Obteniendo dashboard de finanzas para usuario:', req.user.email);
        
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
        console.log('📋 Obteniendo resumen financiero para usuario:', req.user.email);
        
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
        console.log('📈 Obteniendo estadísticas de finanzas');
        
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
        console.log('📊 Obteniendo KPIs financieros');
        
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
        console.log('🚨 Obteniendo alertas financieras');
        
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
        console.log('📄 Generando estado financiero');
        
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
        console.log('💸 Generando reporte de flujo de efectivo');
        
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
        console.log('⚙️ Obteniendo configuración del módulo de finanzas');
        
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
        console.log('🔧 Inicializando datos por defecto del módulo de finanzas');
        
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
        console.log('🛡️ Obteniendo garantías para usuario:', req.user.email);
        
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
        console.log('➕ Creando nueva garantía');
        
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
        console.log('💰 Obteniendo préstamos para usuario:', req.user.email);
        
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
        console.log('➕ Creando nuevo préstamo');
        
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

// ==================== CUENTAS BANCARIAS ====================
// NOTA: Las rutas de cuentas bancarias están manejadas por cuentasBancariasRoutes.js
// para evitar duplicación de rutas

// // GET /api/finanzas/cuentas-bancarias - Obtener todas las cuentas bancarias
// router.get('/cuentas-bancarias', requireUser, async (req, res) => {
//     try {
//         console.log('🏦 Obteniendo cuentas bancarias para usuario:', req.user.email);
        
//         const userId = req.user.clerk_id || req.user.id;
//         const { estado, banco, tipo, limite, pagina } = req.query;
        
//         const cuentas = await finanzasService.obtenerCuentasBancarias(userId, {
//             estado,
//             banco,
//             tipo,
//             limite: parseInt(limite) || 10,
//             pagina: parseInt(pagina) || 1
//         });
        
//         res.json({
//             success: true,
//             data: Array.isArray(cuentas) ? cuentas : [],
//             message: 'Cuentas bancarias obtenidas exitosamente'
//         });
//     } catch (error) {
//         console.error('❌ Error obteniendo cuentas bancarias:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message,
//             data: []
//         });
//     }
// });

// // POST /api/finanzas/cuentas-bancarias - Crear nueva cuenta bancaria
// router.post('/cuentas-bancarias', requireUser, async (req, res) => {
//     try {
//         console.log('➕ Creando nueva cuenta bancaria');
//         console.log('📝 Datos recibidos:', req.body);
        
//         const userId = req.user.clerk_id || req.user.id;
        
//         const userData = {
//             userId: userId,
//             creatorId: userId,
//             creatorName: req.user.email?.split('@')[0] || 'Usuario',
//             creatorEmail: req.user.email,
//             creatorRole: req.user.role || 'user'
//         };
        
//         const cuenta = await cuentasBancariasService.crearCuenta(req.body, userData);
        
//         res.status(201).json({
//             success: true,
//             data: cuenta,
//             message: 'Cuenta bancaria creada exitosamente'
//         });
//     } catch (error) {
//         console.error('❌ Error creando cuenta bancaria:', error);
//         res.status(400).json({
//             success: false,
//             message: error.message,
//             error: error.toString()
//         });
//     }
// });

// ==================== PAGOS FINANCIAMIENTO ====================

// GET /api/finanzas/pagos-financiamiento - Obtener todos los pagos de financiamiento
router.get('/pagos-financiamiento', requireUser, async (req, res) => {
    try {
        console.log('💸 Obteniendo pagos de financiamiento para usuario:', req.user.email);
        
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
        console.log('➕ Creando nuevo pago de financiamiento');
        
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
        console.log('📋 Obteniendo categorías financieras');
        
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
        console.log('💱 Obteniendo monedas soportadas');
        
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
