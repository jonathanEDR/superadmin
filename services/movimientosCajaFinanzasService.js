const MovimientoCajaFinanzas = require('../models/finanzas/MovimientoCaja');

class MovimientosCajaFinanzasService {
    
    // === REGISTRAR MOVIMIENTOS ===
    
    /**
     * Registrar nuevo ingreso
     */
    static async registrarIngreso(data, userData) {
        try {
            console.log('💰 Registrando ingreso en caja finanzas:', data);
            console.log('👤 Usuario data recibida:', userData);
            
            const movimiento = new MovimientoCajaFinanzas({
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
                userId: userData.userId.toString(), // Convertir explícitamente a string
                creatorId: userData.creatorId,
                creatorName: userData.creatorName,
                creatorEmail: userData.creatorEmail
            });
            
            console.log('📋 Objeto movimiento antes de save:', {
                tipo: movimiento.tipo,
                userId: movimiento.userId,
                isNew: movimiento.isNew,
                codigo: movimiento.codigo
            });
            
            console.log('🔄 Intentando guardar movimiento...');
            await movimiento.save();
            console.log('✅ Movimiento guardado exitosamente!');
            
            console.log('✅ Ingreso registrado:', movimiento.codigo);
            return movimiento;
            
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
            console.log('💸 Registrando egreso en caja finanzas:', data);
            
            const movimiento = new MovimientoCajaFinanzas({
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
                userId: userData.userId,
                creatorId: userData.creatorId,
                creatorName: userData.creatorName,
                creatorEmail: userData.creatorEmail
            });
            
            await movimiento.save();
            
            console.log('✅ Egreso registrado:', movimiento.codigo);
            return movimiento;
            
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
            console.log('📊 Obteniendo resumen del día para userId:', userId);
            console.log('📅 Fecha de consulta:', fecha);
            
            // Convertir userId a string si es necesario
            const userIdString = userId.toString();
            
            const inicioDelDia = new Date(fecha);
            inicioDelDia.setHours(0, 0, 0, 0);
            
            const finDelDia = new Date(fecha);
            finDelDia.setHours(23, 59, 59, 999);
            
            console.log('⏰ Rango de fechas:', { inicioDelDia, finDelDia });
            
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
            
            console.log('📊 Resultado del aggregate:', resumen);
            
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
            
            console.log('💵 Efectivo aggregate:', totalEfectivo);
            
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
            
            console.log('📋 Resumen calculado:', resultado);
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
            console.log('📋 Obteniendo movimientos con filtros:', filtros);
            console.log('👤 UserId para consulta:', userId);
            
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
                console.log('📅 Rango de fechas aplicado:', { fechaInicioFinal, fechaFinFinal });
            } else {
                console.log('📅 Sin filtros de fecha - buscando todos los movimientos');
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
            
            console.log('� Query construida:', JSON.stringify(query, null, 2));
            
            const [movimientos, total] = await Promise.all([
                MovimientoCajaFinanzas.find(query)
                    .sort({ fecha: -1, createdAt: -1 })
                    .limit(limite)
                    .skip(skip)
                    .lean(),
                MovimientoCajaFinanzas.countDocuments(query)
            ]);
            
            console.log('📊 Resultados de consulta:', {
                movimientosEncontrados: movimientos.length,
                totalRegistros: total,
                primerosMovimientos: movimientos.slice(0, 2).map(m => ({
                    codigo: m.codigo,
                    tipo: m.tipo,
                    monto: m.monto,
                    fecha: m.fecha,
                    userId: m.userId
                }))
            });
            
            // Debug adicional: contar todos los movimientos del usuario sin filtros
            const totalMovimientosUsuario = await MovimientoCajaFinanzas.countDocuments({
                userId: userId.toString()
            });
            console.log('📊 Total de movimientos del usuario (sin filtros):', totalMovimientosUsuario);
            
            // Mostrar algunos movimientos de ejemplo
            if (totalMovimientosUsuario > 0) {
                const ejemploMovimientos = await MovimientoCajaFinanzas.find({
                    userId: userId.toString()
                }).limit(3).lean();
                console.log('📋 Ejemplo de movimientos del usuario:', ejemploMovimientos.map(m => ({
                    codigo: m.codigo,
                    tipo: m.tipo,
                    monto: m.monto,
                    fecha: m.fecha,
                    categoria: m.categoria,
                    estado: m.estado
                })));
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
}

module.exports = MovimientosCajaFinanzasService;
