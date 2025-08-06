const express = require('express');
const router = express.Router();
const cuentasBancariasService = require('../../services/Finanzas/cuentasBancariasService');
const { authenticate, requireAdmin, requireUser } = require('../../middleware/authenticate');

console.log('🎯 cuentasBancariasRoutes.js cargado correctamente');

// Middleware de logging para este router específico
router.use((req, res, next) => {
    console.log(`🏦 CuentasBancarias Route: ${req.method} ${req.originalUrl}`);
    console.log(`🏦 Full path: ${req.baseUrl}${req.path}`);
    console.log(`🏦 Query params:`, req.query);
    next();
});

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// ==================== CRUD PRINCIPAL ====================

// GET /api/cuentas-bancarias - Obtener todas las cuentas bancarias
router.get('/', requireUser, async (req, res) => {
    try {
        console.log('📋 Obteniendo cuentas bancarias para usuario:', req.user.email);
        
        const userId = req.user.clerk_id || req.user.id;
        const { activas, banco, tipoCuenta, moneda, buscar } = req.query;
        
        let filtros = { userId };
        
        if (activas !== undefined) {
            filtros.activas = activas === 'true';
        }
        
        if (banco) {
            filtros.banco = banco;
        }
        
        if (tipoCuenta) {
            filtros.tipoCuenta = tipoCuenta;
        }
        
        if (moneda) {
            filtros.moneda = moneda;
        }
        
        if (buscar) {
            filtros.buscar = buscar;
        }
        
        console.log('🔍 Filtros aplicados:', filtros);
        
        const cuentas = await cuentasBancariasService.obtenerCuentas(filtros);
        
        res.json({
            success: true,
            data: cuentas,
            message: 'Cuentas bancarias obtenidas exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo cuentas bancarias:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/cuentas-bancarias/resumen - Resumen de cuentas bancarias
router.get('/resumen', requireUser, async (req, res) => {
    try {
        console.log('📊 Obteniendo resumen de cuentas bancarias');
        
        const userId = req.user.clerk_id || req.user.id;
        
        const resumen = await cuentasBancariasService.obtenerResumenCuentas(userId);
        
        res.json({
            success: true,
            data: resumen,
            message: 'Resumen de cuentas obtenido exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo resumen:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/cuentas-bancarias/estadisticas - Estadísticas de cuentas
router.get('/estadisticas', requireUser, async (req, res) => {
    try {
        console.log('📈 Obteniendo estadísticas de cuentas bancarias');
        
        const userId = req.user.clerk_id || req.user.id;
        
        const estadisticas = await cuentasBancariasService.obtenerEstadisticas(userId);
        
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

// GET /api/cuentas-bancarias/:id - Obtener cuenta específica
router.get('/:id', requireUser, async (req, res) => {
    try {
        console.log('🔍 Obteniendo cuenta bancaria:', req.params.id);
        
        const cuenta = await cuentasBancariasService.obtenerCuentaPorId(req.params.id);
        
        res.json({
            success: true,
            data: cuenta,
            message: 'Cuenta bancaria obtenida exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo cuenta bancaria:', error);
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/cuentas-bancarias - Crear nueva cuenta bancaria
router.post('/', requireUser, async (req, res) => {
    try {
        console.log('➕ Creando nueva cuenta bancaria');
        console.log('📝 Datos recibidos:', req.body);
        
        const userData = {
            userId: req.user.clerk_id || req.user.id,
            creatorId: req.user.clerk_id || req.user.id,
            creatorName: req.user.email?.split('@')[0] || 'Usuario',
            creatorEmail: req.user.email,
            creatorRole: req.user.role
        };
        
        const cuenta = await cuentasBancariasService.crearCuenta(req.body, userData);
        
        res.status(201).json({
            success: true,
            data: cuenta,
            message: 'Cuenta bancaria creada exitosamente'
        });
    } catch (error) {
        console.error('❌ Error creando cuenta bancaria:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/cuentas-bancarias/:id - Actualizar cuenta bancaria
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        console.log('✏️ Actualizando cuenta bancaria:', req.params.id);
        console.log('📝 Datos de actualización:', req.body);
        
        const cuenta = await cuentasBancariasService.actualizarCuenta(req.params.id, req.body);
        
        res.json({
            success: true,
            data: cuenta,
            message: 'Cuenta bancaria actualizada exitosamente'
        });
    } catch (error) {
        console.error('❌ Error actualizando cuenta bancaria:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PATCH /api/cuentas-bancarias/:id/estado - Activar/Desactivar cuenta
router.patch('/:id/estado', requireAdmin, async (req, res) => {
    try {
        console.log('🔄 Cambiando estado de cuenta bancaria:', req.params.id);
        
        const { activa } = req.body;
        
        if (typeof activa !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'El campo "activa" debe ser true o false'
            });
        }
        
        const cuenta = await cuentasBancariasService.cambiarEstadoCuenta(req.params.id, activa);
        
        res.json({
            success: true,
            data: cuenta,
            message: `Cuenta bancaria ${activa ? 'activada' : 'desactivada'} exitosamente`
        });
    } catch (error) {
        console.error('❌ Error cambiando estado de cuenta:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/cuentas-bancarias/:id - Eliminar cuenta bancaria
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        console.log('🗑️ Eliminando cuenta bancaria:', req.params.id);
        
        const resultado = await cuentasBancariasService.eliminarCuenta(req.params.id);
        
        res.json({
            success: true,
            data: resultado,
            message: 'Cuenta bancaria eliminada exitosamente'
        });
    } catch (error) {
        console.error('❌ Error eliminando cuenta bancaria:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== OPERACIONES ESPECÍFICAS ====================

// POST /api/cuentas-bancarias/:id/ajustar-saldo - Ajustar saldo de cuenta
router.post('/:id/ajustar-saldo', requireAdmin, async (req, res) => {
    try {
        console.log('💰 Ajustando saldo de cuenta:', req.params.id);
        
        const { nuevoSaldo, motivo } = req.body;
        const operador = req.user.email?.split('@')[0] || 'Usuario';
        
        if (typeof nuevoSaldo !== 'number' || nuevoSaldo < 0) {
            return res.status(400).json({
                success: false,
                message: 'El nuevo saldo debe ser un número mayor o igual a 0'
            });
        }
        
        if (!motivo || motivo.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'El motivo del ajuste es requerido'
            });
        }
        
        const resultado = await cuentasBancariasService.ajustarSaldo(
            req.params.id,
            nuevoSaldo,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: resultado,
            message: 'Saldo ajustado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error ajustando saldo:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/cuentas-bancarias/:id/movimientos - Obtener movimientos de una cuenta
router.get('/:id/movimientos', requireUser, async (req, res) => {
    try {
        console.log('📊 Obteniendo movimientos de cuenta:', req.params.id);
        
        const { limite = 50, pagina = 1, fechaInicio, fechaFin, tipo } = req.query;
        
        const filtros = {};
        if (fechaInicio) filtros.fechaInicio = fechaInicio;
        if (fechaFin) filtros.fechaFin = fechaFin;
        if (tipo) filtros.tipo = tipo;
        
        const movimientos = await cuentasBancariasService.obtenerMovimientosCuenta(
            req.params.id,
            filtros,
            parseInt(limite),
            parseInt(pagina)
        );
        
        res.json({
            success: true,
            data: movimientos,
            message: 'Movimientos obtenidos exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo movimientos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/cuentas-bancarias/:id/depositar - Realizar depósito
router.post('/:id/depositar', requireUser, async (req, res) => {
    try {
        console.log('💰 Realizando depósito en cuenta:', req.params.id);
        
        const { monto, motivo } = req.body;
        const operador = req.user.email?.split('@')[0] || 'Usuario';
        
        if (!monto || typeof monto !== 'number' || monto <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El monto debe ser un número mayor a 0'
            });
        }
        
        if (!motivo || motivo.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'El motivo del depósito es requerido'
            });
        }
        
        const resultado = await cuentasBancariasService.realizarDeposito(
            req.params.id,
            monto,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: resultado,
            message: 'Depósito realizado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error realizando depósito:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/cuentas-bancarias/:id/retirar - Realizar retiro
router.post('/:id/retirar', requireUser, async (req, res) => {
    try {
        console.log('💸 Realizando retiro de cuenta:', req.params.id);
        
        const { monto, motivo } = req.body;
        const operador = req.user.email?.split('@')[0] || 'Usuario';
        
        if (!monto || typeof monto !== 'number' || monto <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El monto debe ser un número mayor a 0'
            });
        }
        
        if (!motivo || motivo.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'El motivo del retiro es requerido'
            });
        }
        
        const resultado = await cuentasBancariasService.realizarRetiro(
            req.params.id,
            monto,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: resultado,
            message: 'Retiro realizado exitosamente'
        });
    } catch (error) {
        console.error('❌ Error realizando retiro:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/cuentas-bancarias/:id/saldo-historico - Histórico de saldos
router.get('/:id/saldo-historico', requireUser, async (req, res) => {
    try {
        console.log('📈 Obteniendo histórico de saldos:', req.params.id);
        
        const { fechaInicio, fechaFin, intervalo = 'dia' } = req.query;
        
        const historico = await cuentasBancariasService.obtenerHistoricoSaldos(
            req.params.id,
            fechaInicio,
            fechaFin,
            intervalo
        );
        
        res.json({
            success: true,
            data: historico,
            message: 'Histórico de saldos obtenido exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo histórico de saldos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== UTILIDADES ====================

// GET /api/cuentas-bancarias/bancos/disponibles - Obtener lista de bancos
router.get('/bancos/disponibles', requireUser, async (req, res) => {
    try {
        console.log('🏦 Obteniendo lista de bancos disponibles');
        
        const bancos = cuentasBancariasService.obtenerBancosDisponibles();
        
        res.json({
            success: true,
            data: bancos,
            message: 'Lista de bancos obtenida exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo bancos:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/cuentas-bancarias/tipos/disponibles - Obtener tipos de cuenta
router.get('/tipos/disponibles', requireUser, async (req, res) => {
    try {
        console.log('📋 Obteniendo tipos de cuenta disponibles');
        
        const tipos = cuentasBancariasService.obtenerTiposCuentaDisponibles();
        
        res.json({
            success: true,
            data: tipos,
            message: 'Tipos de cuenta obtenidos exitosamente'
        });
    } catch (error) {
        console.error('❌ Error obteniendo tipos de cuenta:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/cuentas-bancarias/verificar-numero - Verificar si número de cuenta existe
router.post('/verificar-numero', requireUser, async (req, res) => {
    try {
        console.log('🔍 Verificando número de cuenta');
        
        const { numeroCuenta, excluirId } = req.body;
        const userId = req.user.clerk_id || req.user.id;
        
        if (!numeroCuenta) {
            return res.status(400).json({
                success: false,
                message: 'El número de cuenta es requerido'
            });
        }
        
        const existe = await cuentasBancariasService.verificarNumeroCuentaExiste(
            numeroCuenta,
            userId,
            excluirId
        );
        
        res.json({
            success: true,
            data: { existe },
            message: existe ? 'El número de cuenta ya existe' : 'Número de cuenta disponible'
        });
    } catch (error) {
        console.error('❌ Error verificando número de cuenta:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
