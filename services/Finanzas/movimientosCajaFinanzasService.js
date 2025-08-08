const MovimientoCajaFinanzas = require('../../models/finanzas/MovimientoCaja');
const IntegracionFinanzasService = require('./integracionFinanzasService');

class MovimientosCajaFinanzasService {
    
    // === REGISTRAR MOVIMIENTOS ===
    
    /**
     * Registrar ingreso automático por préstamo
     * Este método se llama automáticamente cuando se crea un nuevo préstamo
     * IMPORTANTE: Los préstamos NO se mezclan con cuentas bancarias
     * Solo registra el INGRESO del dinero recibido en caja
     */
    static async registrarIngresoPorPrestamo(prestamo, userData) {
        try {
            console.log(`💰 Registrando ingreso automático por préstamo: ${prestamo.codigo}`);
            
            // Preparar datos del movimiento - SOLO INGRESO DE CAJA
            const datosMovimiento = {
                tipo: 'ingreso',
                monto: prestamo.montoAprobado,
                concepto: `Préstamo recibido - ${prestamo.codigo}`,
                descripcion: `Ingreso por préstamo de ${prestamo.entidadFinanciera.nombre} - Tipo: ${prestamo.tipo}`,
                metodoPago: {
                    tipo: 'transferencia', // Los préstamos generalmente llegan por transferencia
                    detalles: {
                        numeroOperacion: `PREST-${prestamo.codigo}`,
                        entidadOrigen: prestamo.entidadFinanciera.nombre,
                        referencia: prestamo.entidadFinanciera.numeroCredito || prestamo.codigo
                    }
                },
                categoria: 'prestamo_recibido',
                subcategoria: prestamo.tipo,
                documento: {
                    tipo: 'contrato_prestamo',
                    numero: prestamo.codigo,
                    serie: prestamo.entidadFinanciera.numeroCredito || '',
                    fechaEmision: prestamo.fechaAprobacion || new Date()
                },
                // Información de la entidad financiera (quien otorga el préstamo)
                proveedor: {
                    nombre: prestamo.entidadFinanciera.nombre,
                    ruc: prestamo.entidadFinanciera.ruc || '',
                    contacto: prestamo.entidadFinanciera.ejecutivo?.telefono || '',
                    email: prestamo.entidadFinanciera.ejecutivo?.email || ''
                },
                // Distribución automática al módulo de préstamos
                distribucion: {
                    moduloDestino: 'prestamos',
                    aplicado: true,
                    fechaAplicacion: new Date(),
                    referenciaModulo: {
                        tipo: 'prestamo',
                        id: prestamo._id,
                        numero: prestamo.codigo
                    }
                },
                // Observaciones con detalles del préstamo
                observaciones: `
                    Ingreso automático por préstamo aprobado.
                    Entidad Financiera: ${prestamo.entidadFinanciera.nombre}
                    Tipo de Préstamo: ${prestamo.tipo}
                    Plazo: ${prestamo.plazoMeses} meses
                    Tasa de Interés: ${prestamo.tasaInteres}%
                    Prestatario: ${prestamo.prestatario.nombre}
                    Fecha Aprobación: ${prestamo.fechaAprobacion || 'N/A'}
                `.trim(),
                fecha: prestamo.fechaDesembolso || new Date(),
                // NO afecta cuentas bancarias - es ingreso puro a caja
                afectaCuentaBancaria: false,
                cuentaBancariaId: null
            };
            
            console.log(`💵 Registrando como ingreso directo a caja - Monto: ${prestamo.montoAprobado}`);
            
            // Crear movimiento de caja directo (sin integración bancaria)
            const movimiento = new MovimientoCajaFinanzas({
                ...datosMovimiento,
                userId: userData.userId.toString(),
                creatorId: userData.creatorId,
                creatorName: userData.creatorName,
                creatorEmail: userData.creatorEmail,
                creatorRole: userData.creatorRole,
                estado: 'aplicado' // Los movimientos por préstamos se marcan como aplicados automáticamente
            });
            
            await movimiento.save();
            console.log(`✅ Ingreso por préstamo registrado en caja: ${movimiento.codigo}`);
            
            return movimiento;
            
        } catch (error) {
            console.error('❌ Error registrando ingreso por préstamo:', error);
            // No lanzamos el error para que no falle la creación del préstamo
            // Solo lo registramos para revisión posterior
            console.error('⚠️ ADVERTENCIA: El préstamo se creó pero el movimiento de caja falló');
            console.error('⚠️ Detalles del error:', error.message);
            return null;
        }
    }
    
    /**
     * Registrar nuevo ingreso
     */
    static async registrarIngreso(data, userData) {
        try {
            // Preparar datos del movimiento
            const datosMovimiento = {
                tipo: 'ingreso',
                monto: data.monto,
                concepto: data.concepto,
                descripcion: data.descripcion,
                metodoPago: data.metodoPago,
                categoria: data.categoria,
                subcategoria: data.subcategoria,
                documento: data.documento,
                cliente: data.cliente,
                observaciones: data.observaciones,
                // Nuevos campos para integración bancaria
                afectaCuentaBancaria: data.afectaCuentaBancaria || false,
                cuentaBancariaId: data.cuentaBancariaId || null,
                fecha: data.fecha || new Date()
            };
            
            // Usar servicio de integración si afecta cuenta bancaria
            if (datosMovimiento.afectaCuentaBancaria) {
                const resultado = await IntegracionFinanzasService.registrarMovimientoIntegrado(datosMovimiento, userData);
                return resultado.movimientoCaja;
            } else {
                const movimiento = new MovimientoCajaFinanzas({
                    ...datosMovimiento,
                    userId: userData.userId.toString(),
                    creatorId: userData.creatorId,
                    creatorName: userData.creatorName,
                    creatorEmail: userData.creatorEmail
                });
                
                await movimiento.save();
                return movimiento;
            }
            
        } catch (error) {
            console.error('❌ Error registrando ingreso:', error);
            throw error;
        }
    }
    
    /**
     * Registrar nuevo egreso
     */
    static async registrarEgreso(data, userData) {
        try {
            // Preparar datos del movimiento
            const datosMovimiento = {
                tipo: 'egreso',
                monto: data.monto,
                concepto: data.concepto,
                descripcion: data.descripcion,
                metodoPago: data.metodoPago,
                categoria: data.categoria,
                subcategoria: data.subcategoria,
                documento: data.documento,
                proveedor: data.proveedor,
                observaciones: data.observaciones,
                // Nuevos campos para integración bancaria
                afectaCuentaBancaria: data.afectaCuentaBancaria || false,
                cuentaBancariaId: data.cuentaBancariaId || null,
                fecha: data.fecha || new Date()
            };
            
            // Usar servicio de integración si afecta cuenta bancaria
            if (datosMovimiento.afectaCuentaBancaria) {
                const resultado = await IntegracionFinanzasService.registrarMovimientoIntegrado(datosMovimiento, userData);
                return resultado.movimientoCaja;
            } else {
                // Registro tradicional solo en caja
                const movimiento = new MovimientoCajaFinanzas({
                    ...datosMovimiento,
                    userId: userData.userId.toString(),
                    creatorId: userData.creatorId,
                    creatorName: userData.creatorName,
                    creatorEmail: userData.creatorEmail
                });
                
                await movimiento.save();
                return movimiento;
            }
            
        } catch (error) {
            console.error('❌ Error registrando egreso:', error);
            throw error;
        }
    }
    
    // === CONSULTAS Y REPORTES ===
    
    /**
     * Obtener resumen de caja del día
     */
    static async obtenerResumenDia(userId, fecha = new Date()) {
        try {
            
            // Convertir userId a string si es necesario
            const userIdString = userId.toString();
            
            const inicioDelDia = new Date(fecha);
            inicioDelDia.setHours(0, 0, 0, 0);
            
            const finDelDia = new Date(fecha);
            finDelDia.setHours(23, 59, 59, 999);
            
            
            const resumen = await MovimientoCajaFinanzas.aggregate([
                {
                    $match: {
                        userId: userIdString,
                        fecha: { $gte: inicioDelDia, $lte: finDelDia },
                        estado: { $ne: 'anulado' }
                    }
                },
                {
                    $group: {
                        _id: '$tipo',
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                }
            ]);
            
            
            let ingresos = 0;
            let egresos = 0;
            let cantidadIngresos = 0;
            let cantidadEgresos = 0;
            
            resumen.forEach(item => {
                if (item._id === 'ingreso') {
                    ingresos = item.total;
                    cantidadIngresos = item.cantidad;
                }
                if (item._id === 'egreso') {
                    egresos = item.total;
                    cantidadEgresos = item.cantidad;
                }
            });
            
            // Obtener total en efectivo
            const totalEfectivo = await MovimientoCajaFinanzas.aggregate([
                {
                    $match: {
                        userId: userIdString,
                        fecha: { $gte: inicioDelDia, $lte: finDelDia },
                        'metodoPago.tipo': 'efectivo',
                        estado: { $ne: 'anulado' }
                    }
                },
                {
                    $group: {
                        _id: '$tipo',
                        total: { $sum: '$monto' }
                    }
                }
            ]);
            
            
            let efectivoIngresos = 0;
            let efectivoEgresos = 0;
            
            totalEfectivo.forEach(item => {
                if (item._id === 'ingreso') efectivoIngresos = item.total;
                if (item._id === 'egreso') efectivoEgresos = item.total;
            });
            
            const resultado = {
                fecha: fecha.toISOString().split('T')[0],
                resumenGeneral: {
                    ingresos: {
                        monto: ingresos,
                        cantidad: cantidadIngresos
                    },
                    egresos: {
                        monto: egresos,
                        cantidad: cantidadEgresos
                    },
                    saldoNeto: ingresos - egresos
                },
                efectivo: {
                    ingresos: efectivoIngresos,
                    egresos: efectivoEgresos,
                    saldoEfectivo: efectivoIngresos - efectivoEgresos
                },
                ultimaActualizacion: new Date().toISOString()
            };
            
            return resultado;
            
        } catch (error) {
            console.error('❌ Error obteniendo resumen:', error);
            throw error;
        }
    }
    
    /**
     * Obtener movimientos por período
     */
    static async obtenerMovimientos(userId, filtros = {}) {
        try {
            
            const {
                fechaInicio,
                fechaFin,
                tipo,
                categoria,
                metodoPago,
                estado,
                limite = 50,
                pagina = 1
            } = filtros;
            
            const skip = (pagina - 1) * limite;
            
            const query = {
                userId: userId.toString() // Convertir ObjectId a string para la comparación
            };
            
            // Solo agregar filtro de fechas si se proporcionan
            if (fechaInicio || fechaFin) {
                const fechaInicioFinal = fechaInicio ? new Date(fechaInicio) : new Date('2020-01-01'); // Fecha muy antigua si no se especifica
                const fechaFinFinal = fechaFin ? new Date(fechaFin) : new Date(); // Hoy si no se especifica
                
                // Asegurar que fechaFin incluya todo el día
                fechaFinFinal.setHours(23, 59, 59, 999);
                
                query.fecha = { $gte: fechaInicioFinal, $lte: fechaFinFinal };
            } else {
            }
            
            if (tipo) query.tipo = tipo;
            if (categoria) query.categoria = categoria;
            if (metodoPago) query['metodoPago.tipo'] = metodoPago;
            if (estado) {
                query.estado = estado;
            } else {
                // Por defecto excluir anulados
                query.estado = { $ne: 'anulado' };
            }
            
            
            const [movimientos, total] = await Promise.all([
                MovimientoCajaFinanzas.find(query)
                    .sort({ fecha: -1, createdAt: -1 })
                    .limit(limite)
                    .skip(skip)
                    .lean(),
                MovimientoCajaFinanzas.countDocuments(query)
            ]);
            
            
            // Debug adicional: contar todos los movimientos del usuario sin filtros
            const totalMovimientosUsuario = await MovimientoCajaFinanzas.countDocuments({
                userId: userId.toString()
            });
            
            // Mostrar algunos movimientos de ejemplo
            if (totalMovimientosUsuario > 0) {
                const ejemploMovimientos = await MovimientoCajaFinanzas.find({
                    userId: userId.toString()
                }).limit(3).lean();
            }
            
            return {
                movimientos,
                paginacion: {
                    paginaActual: pagina,
                    totalPaginas: Math.ceil(total / limite),
                    totalRegistros: total,
                    registrosPorPagina: limite
                }
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo movimientos:', error);
            throw error;
        }
    }
    
    /**
     * Obtener estadísticas por método de pago
     */
    static async obtenerEstadisticasMetodosPago(userId, fechaInicio, fechaFin) {
        try {
            const estadisticas = await MovimientoCajaFinanzas.aggregate([
                {
                    $match: {
                        userId,
                        fecha: { $gte: fechaInicio, $lte: fechaFin },
                        estado: { $ne: 'anulado' }
                    }
                },
                {
                    $group: {
                        _id: {
                            tipo: '$tipo',
                            metodoPago: '$metodoPago.tipo'
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                {
                    $sort: { total: -1 }
                }
            ]);
            
            return estadisticas;
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            throw error;
        }
    }
    
    // === OPERACIONES ESPECIALES ===
    
    /**
     * Validar movimiento
     */
    static async validarMovimiento(movimientoId, validadorData, observaciones = '') {
        try {
            console.log('✓ Validando movimiento:', movimientoId);
            
            const movimiento = await MovimientoCajaFinanzas.findById(movimientoId);
            if (!movimiento) {
                throw new Error('Movimiento no encontrado');
            }
            
            if (movimiento.estado !== 'pendiente') {
                throw new Error('Solo se pueden validar movimientos pendientes');
            }
            
            movimiento.estado = 'validado';
            movimiento.validacion = {
                validadoPor: validadorData.validadorNombre,
                fechaValidacion: new Date(),
                observaciones: observaciones
            };
            
            await movimiento.save();
            
            console.log('✅ Movimiento validado');
            return movimiento;
            
        } catch (error) {
            console.error('❌ Error validando movimiento:', error);
            throw error;
        }
    }
    
    /**
     * Anular movimiento
     */
    static async anularMovimiento(movimientoId, motivo, userId) {
        try {
            console.log('❌ Anulando movimiento:', movimientoId);
            
            const movimiento = await MovimientoCajaFinanzas.findOne({
                _id: movimientoId,
                userId
            });
            
            if (!movimiento) {
                throw new Error('Movimiento no encontrado');
            }
            
            if (movimiento.estado === 'anulado') {
                throw new Error('El movimiento ya está anulado');
            }
            
            if (movimiento.estado === 'aplicado') {
                throw new Error('No se puede anular un movimiento ya aplicado a un módulo');
            }
            
            movimiento.estado = 'anulado';
            movimiento.observaciones = `ANULADO: ${motivo}. ${movimiento.observaciones || ''}`;
            
            await movimiento.save();
            
            console.log('✅ Movimiento anulado');
            return movimiento;
            
        } catch (error) {
            console.error('❌ Error anulando movimiento:', error);
            throw error;
        }
    }
    
    /**
     * Obtener arqueo de caja (conteo físico)
     */
    static async generarArqueo(userId, fecha = new Date()) {
        try {
            console.log('🔍 Generando arqueo de caja');
            
            const inicioDelDia = new Date(fecha);
            inicioDelDia.setHours(0, 0, 0, 0);
            
            const finDelDia = new Date(fecha);
            finDelDia.setHours(23, 59, 59, 999);
            
            const movimientosEfectivo = await MovimientoCajaFinanzas.find({
                userId,
                fecha: { $gte: inicioDelDia, $lte: finDelDia },
                'metodoPago.tipo': 'efectivo',
                estado: { $ne: 'anulado' }
            }).lean();
            
            let totalBilletes = {
                b200: 0, b100: 0, b50: 0, b20: 0, b10: 0
            };
            let totalMonedas = {
                m5: 0, m2: 0, m1: 0, c50: 0, c20: 0, c10: 0
            };
            let totalIngresos = 0;
            let totalEgresos = 0;
            
            movimientosEfectivo.forEach(mov => {
                const detalles = mov.metodoPago.detalles || {};
                
                if (mov.tipo === 'ingreso') {
                    totalIngresos += mov.monto;
                    // Sumar billetes y monedas de ingresos
                    if (detalles.billetes) {
                        Object.keys(totalBilletes).forEach(key => {
                            totalBilletes[key] += detalles.billetes[key] || 0;
                        });
                    }
                    if (detalles.monedas) {
                        Object.keys(totalMonedas).forEach(key => {
                            totalMonedas[key] += detalles.monedas[key] || 0;
                        });
                    }
                } else {
                    totalEgresos += mov.monto;
                    // Restar billetes y monedas de egresos
                    if (detalles.billetes) {
                        Object.keys(totalBilletes).forEach(key => {
                            totalBilletes[key] -= detalles.billetes[key] || 0;
                        });
                    }
                    if (detalles.monedas) {
                        Object.keys(totalMonedas).forEach(key => {
                            totalMonedas[key] -= detalles.monedas[key] || 0;
                        });
                    }
                }
            });
            
            const valorTotal = 
                (totalBilletes.b200 * 200) + (totalBilletes.b100 * 100) + 
                (totalBilletes.b50 * 50) + (totalBilletes.b20 * 20) + 
                (totalBilletes.b10 * 10) + (totalMonedas.m5 * 5) + 
                (totalMonedas.m2 * 2) + (totalMonedas.m1 * 1) + 
                (totalMonedas.c50 * 0.5) + (totalMonedas.c20 * 0.2) + 
                (totalMonedas.c10 * 0.1);
            
            return {
                fecha: fecha.toISOString().split('T')[0],
                efectivoEsperado: totalIngresos - totalEgresos,
                desglose: {
                    billetes: totalBilletes,
                    monedas: totalMonedas
                },
                valorCalculado: parseFloat(valorTotal.toFixed(2)),
                diferencia: parseFloat((valorTotal - (totalIngresos - totalEgresos)).toFixed(2)),
                movimientos: {
                    ingresos: totalIngresos,
                    egresos: totalEgresos,
                    cantidad: movimientosEfectivo.length
                }
            };
            
        } catch (error) {
            console.error('❌ Error generando arqueo:', error);
            throw error;
        }
    }
    
    // === UTILIDADES ===
    
    /**
     * Obtener categorías disponibles
     */
    static obtenerCategorias() {
        return {
            ingresos: [
                'venta_producto',
                'venta_servicio', 
                'cobro_cliente',
                'prestamo_recibido',
                'devolucion',
                'otros_ingresos'
            ],
            egresos: [
                'compra_materia_prima',
                'pago_proveedor',
                'pago_servicio',
                'gasto_operativo',
                'pago_prestamo',
                'gasto_personal',
                'impuestos',
                'otros_egresos'
            ]
        };
    }
    
    /**
     * Obtener métodos de pago disponibles
     */
    static obtenerMetodosPago() {
        return [
            'efectivo',
            'yape',
            'plin', 
            'transferencia',
            'tarjeta'
        ];
    }

    // === MÉTODOS PARA INTEGRACIÓN BANCARIA ===

    /**
     * Obtener cuentas bancarias disponibles para el usuario
     */
    static async obtenerCuentasDisponibles(userId, userData = null) {
        try {
            const CuentaBancaria = require('../../models/finanzas/CuentaBancaria');
            
            
            // Primero verificar todas las cuentas en la BD
            const todasLasCuentas = await CuentaBancaria.find({}).select('userId nombre activa').lean();
            
            // Construir filtro para buscar por múltiples identificadores
            const filtroUserId = [];
            
            // Agregar el userId principal
            if (userId) {
                filtroUserId.push({ userId: userId.toString() });
            }
            
            // Si tenemos userData, agregar el clerk_id también
            if (userData && userData.clerk_id) {
                filtroUserId.push({ userId: userData.clerk_id });
            }
            
            // Si no hay userData pero podemos inferir clerk_id desde las cuentas existentes
            if (!userData && todasLasCuentas.length > 0) {
                // Buscar si alguna cuenta tiene un clerk_id pattern
                const clerkIds = todasLasCuentas
                    .map(c => c.userId)
                    .filter(id => id.startsWith('user_'));
                
                if (clerkIds.length > 0) {
                    clerkIds.forEach(clerkId => {
                        filtroUserId.push({ userId: clerkId });
                    });
                }
            }
            
            
            const cuentas = await CuentaBancaria.find({
                $or: filtroUserId,
                activa: true
            }).select('nombre banco tipoCuenta numeroCuenta moneda saldoActual').lean();
            
            
            // Log detallado de cada cuenta
            cuentas.forEach((cuenta, index) => {
                console.log(`🏦 [obtenerCuentasDisponibles] Cuenta ${index + 1}:`, {
                    id: cuenta._id,
                    nombre: cuenta.nombre,
                    banco: cuenta.banco,
                    saldoActual: cuenta.saldoActual,
                    moneda: cuenta.moneda
                });
            });
            
            const cuentasFormateadas = cuentas.map(cuenta => ({
                _id: cuenta._id.toString(),
                nombre: cuenta.nombre,
                banco: cuenta.banco,
                tipoCuenta: cuenta.tipoCuenta,
                numeroCuenta: cuenta.numeroCuenta,
                moneda: cuenta.moneda,
                saldo: cuenta.saldoActual,
                saldoActual: cuenta.saldoActual,
                // También mantener el formato original para compatibilidad
                value: cuenta._id.toString(),
                label: `${cuenta.nombre} - ${cuenta.banco} (${cuenta.moneda} ${cuenta.saldoActual.toFixed(2)})`,
                data: cuenta
            }));
            
            
            return cuentasFormateadas;
            
        } catch (error) {
            console.error('❌ Error obteniendo cuentas disponibles:', error);
            throw new Error(`Error al obtener cuentas disponibles: ${error.message}`);
        }
    }

    /**
     * Obtener movimientos integrados (caja + bancarios)
     */
    static async obtenerMovimientosIntegrados(userId, filtros = {}) {
        try {
            return await IntegracionFinanzasService.obtenerMovimientosIntegrados(userId, filtros);
        } catch (error) {
            console.error('❌ Error obteniendo movimientos integrados:', error);
            throw error;
        }
    }

    /**
     * Anular movimiento (incluye reversión bancaria si aplica)
     */
    static async anularMovimiento(movimientoId, motivo, userData) {
        try {
            return await IntegracionFinanzasService.anularMovimientoIntegrado(movimientoId, motivo, userData);
        } catch (error) {
            console.error('❌ Error anulando movimiento:', error);
            throw error;
        }
    }

    /**
     * Obtener resumen de integración
     */
    static async obtenerResumenIntegracion(userId, fechaInicio, fechaFin) {
        try {
            return await IntegracionFinanzasService.obtenerResumenIntegracion(userId, fechaInicio, fechaFin);
        } catch (error) {
            console.error('❌ Error obteniendo resumen de integración:', error);
            throw error;
        }
    }

    /**
     * Eliminar movimiento (solo para préstamos eliminados)
     */
    static async eliminarMovimiento(movimientoId) {
        try {
            console.log('🗑️ Eliminando movimiento de caja:', movimientoId);
            
            const movimiento = await MovimientoCajaFinanzas.findById(movimientoId);
            
            if (!movimiento) {
                console.log('⚠️ Movimiento no encontrado, posiblemente ya eliminado');
                return { eliminado: false, razon: 'Movimiento no encontrado' };
            }
            
            // Verificar que sea un movimiento relacionado con préstamos
            if (!movimiento.categoria || movimiento.categoria !== 'prestamo_recibido') {
                throw new Error('Solo se pueden eliminar movimientos de préstamos');
            }
            
            // Eliminar el movimiento
            await MovimientoCajaFinanzas.findByIdAndDelete(movimientoId);
            
            console.log('✅ Movimiento de caja eliminado exitosamente');
            
            return { 
                eliminado: true, 
                codigo: movimiento.codigo,
                monto: movimiento.monto,
                mensaje: 'Movimiento eliminado exitosamente' 
            };
            
        } catch (error) {
            console.error('❌ Error eliminando movimiento de caja:', error);
            throw new Error(`Error al eliminar movimiento de caja: ${error.message}`);
        }
    }
}

module.exports = MovimientosCajaFinanzasService;
