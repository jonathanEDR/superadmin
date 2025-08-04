const PagoFinanciamiento = require('../models/finanzas/PagoFinanciamiento');
const Prestamo = require('../models/finanzas/Prestamo');
const CuentaBancaria = require('../models/finanzas/CuentaBancaria');
const MovimientoBancario = require('../models/finanzas/MovimientoBancario');

class PagosFinanciamientoService {
    /**
     * Obtener pagos con filtros
     */
    static async obtenerPagos(filtros = {}, limite = 50, pagina = 1) {
        try {
            console.log('🔍 Obteniendo pagos de financiamiento con filtros:', filtros);
            
            const skip = (pagina - 1) * limite;
            let query = {};
            
            // Filtros básicos
            if (filtros.userId) query.userId = filtros.userId;
            if (filtros.prestamoId) query.prestamoId = filtros.prestamoId;
            if (filtros.estado) {
                if (Array.isArray(filtros.estado)) {
                    query.estado = { $in: filtros.estado };
                } else {
                    query.estado = filtros.estado;
                }
            }
            if (filtros.tipo) query.tipo = filtros.tipo;
            
            // Filtro por rango de fechas
            if (filtros.fechaInicio || filtros.fechaFin) {
                query.fechaProgramada = {};
                if (filtros.fechaInicio) {
                    query.fechaProgramada.$gte = new Date(filtros.fechaInicio);
                }
                if (filtros.fechaFin) {
                    query.fechaProgramada.$lte = new Date(filtros.fechaFin);
                }
            }
            
            // Filtro por rango de montos
            if (filtros.montoMin || filtros.montoMax) {
                query.montoTotal = {};
                if (filtros.montoMin) {
                    query.montoTotal.$gte = parseFloat(filtros.montoMin);
                }
                if (filtros.montoMax) {
                    query.montoTotal.$lte = parseFloat(filtros.montoMax);
                }
            }
            
            // Búsqueda por texto
            if (filtros.buscar) {
                query.$or = [
                    { descripcion: { $regex: filtros.buscar, $options: 'i' } },
                    { numeroOperacion: { $regex: filtros.buscar, $options: 'i' } },
                    { 'responsable.nombre': { $regex: filtros.buscar, $options: 'i' } }
                ];
            }
            
            const [pagos, total] = await Promise.all([
                PagoFinanciamiento.find(query)
                    .populate('prestamoId', 'codigo entidadFinanciera.nombre prestatario.nombre')
                    .populate('cuentaOrigenId', 'nombre banco')
                    .sort({ fechaProgramada: -1 })
                    .skip(skip)
                    .limit(limite),
                PagoFinanciamiento.countDocuments(query)
            ]);
            
            console.log(`✅ ${pagos.length} pagos obtenidos de ${total} totales`);
            
            return {
                pagos,
                paginacion: {
                    paginaActual: pagina,
                    totalPaginas: Math.ceil(total / limite),
                    totalRegistros: total,
                    registrosPorPagina: limite
                }
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo pagos:', error);
            throw new Error(`Error al obtener pagos de financiamiento: ${error.message}`);
        }
    }
    
    /**
     * Obtener pago por ID
     */
    static async obtenerPagoPorId(id) {
        try {
            console.log('🔍 Buscando pago por ID:', id);
            
            const pago = await PagoFinanciamiento.findById(id)
                .populate('prestamoId', 'codigo entidadFinanciera prestatario')
                .populate('cuentaOrigenId', 'nombre banco tipoCuenta');
            
            if (!pago) {
                throw new Error('Pago de financiamiento no encontrado');
            }
            
            console.log('✅ Pago encontrado:', pago.codigo);
            return pago;
            
        } catch (error) {
            console.error('❌ Error obteniendo pago:', error);
            throw new Error(`Error al obtener pago de financiamiento: ${error.message}`);
        }
    }
    
    /**
     * Registrar nuevo pago
     */
    static async registrarPago(datosPago, userData) {
        try {
            console.log('➕ Registrando nuevo pago de financiamiento');
            
            // Validaciones básicas
            if (!datosPago.prestamoId) {
                throw new Error('El préstamo es requerido');
            }
            
            if (!datosPago.numeroCuota || datosPago.numeroCuota <= 0) {
                throw new Error('El número de cuota debe ser mayor a cero');
            }
            
            if (!datosPago.montoTotal || datosPago.montoTotal <= 0) {
                throw new Error('El monto total debe ser mayor a cero');
            }
            
            if (!datosPago.fechaProgramada) {
                throw new Error('La fecha programada es requerida');
            }
            
            // Verificar que el préstamo existe
            const prestamo = await Prestamo.findById(datosPago.prestamoId);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            if (prestamo.userId !== userData.userId) {
                throw new Error('No tienes permisos para este préstamo');
            }
            
            // Verificar que no exista otro pago con el mismo número de cuota
            const pagoExistente = await PagoFinanciamiento.findOne({
                prestamoId: datosPago.prestamoId,
                numeroCuota: datosPago.numeroCuota
            });
            
            if (pagoExistente) {
                throw new Error('Ya existe un pago registrado para esta cuota');
            }
            
            // Crear el pago
            const pago = new PagoFinanciamiento({
                ...datosPago,
                moneda: datosPago.moneda || prestamo.moneda,
                responsable: datosPago.responsable || {
                    nombre: userData.creatorName,
                    email: userData.creatorEmail
                },
                ...userData
            });
            
            await pago.save();
            
            console.log('✅ Pago registrado exitosamente:', pago.codigo);
            return pago;
            
        } catch (error) {
            console.error('❌ Error registrando pago:', error);
            throw new Error(`Error al registrar pago: ${error.message}`);
        }
    }
    
    /**
     * Actualizar pago
     */
    static async actualizarPago(id, datosActualizacion) {
        try {
            console.log('✏️ Actualizando pago de financiamiento:', id);
            
            const pago = await PagoFinanciamiento.findById(id);
            if (!pago) {
                throw new Error('Pago de financiamiento no encontrado');
            }
            
            // Validar que el pago se puede actualizar
            if (pago.estado === 'procesado') {
                throw new Error('No se puede modificar un pago ya procesado');
            }
            
            // No permitir cambiar ciertos campos críticos
            const camposProtegidos = ['codigo', 'prestamoId', 'userId', 'montoPagado', 'createdAt'];
            camposProtegidos.forEach(campo => {
                if (datosActualizacion.hasOwnProperty(campo)) {
                    delete datosActualizacion[campo];
                }
            });
            
            // Actualizar pago
            Object.assign(pago, datosActualizacion);
            await pago.save();
            
            console.log('✅ Pago actualizado exitosamente');
            return pago;
            
        } catch (error) {
            console.error('❌ Error actualizando pago:', error);
            throw new Error(`Error al actualizar pago: ${error.message}`);
        }
    }
    
    /**
     * Procesar pago
     */
    static async procesarPago(id, montoPagado, metodoPago, numeroOperacion, cuentaOrigenId, userData) {
        try {
            console.log(`💰 Procesando pago ${id} por monto: ${montoPagado}`);
            
            const pago = await PagoFinanciamiento.findById(id)
                .populate('prestamoId');
            
            if (!pago) {
                throw new Error('Pago de financiamiento no encontrado');
            }
            
            if (pago.estado !== 'pendiente') {
                throw new Error('Solo se pueden procesar pagos pendientes');
            }
            
            if (!montoPagado || montoPagado <= 0) {
                throw new Error('El monto pagado debe ser mayor a cero');
            }
            
            if (montoPagado > pago.montoTotal) {
                throw new Error('El monto pagado no puede ser mayor al monto total');
            }
            
            // Verificar cuenta origen si se proporciona
            let cuentaOrigen = null;
            if (cuentaOrigenId) {
                cuentaOrigen = await CuentaBancaria.findById(cuentaOrigenId);
                if (!cuentaOrigen) {
                    throw new Error('Cuenta origen no encontrada');
                }
                
                if (!cuentaOrigen.activa) {
                    throw new Error('La cuenta origen debe estar activa');
                }
                
                if (cuentaOrigen.saldoActual < montoPagado) {
                    throw new Error('Saldo insuficiente en la cuenta origen');
                }
            }
            
            // Procesar el pago
            await pago.procesar(montoPagado, metodoPago, numeroOperacion);
            
            // Actualizar saldo de la cuenta origen si aplica
            let movimiento = null;
            if (cuentaOrigen) {
                movimiento = new MovimientoBancario({
                    cuentaBancariaId: cuentaOrigen._id,
                    tipo: 'egreso',
                    categoria: 'prestamo',
                    subcategoria: 'pago_cuota',
                    descripcion: `Pago cuota ${pago.numeroCuota} - Préstamo ${pago.prestamoId.codigo}`,
                    monto: montoPagado,
                    moneda: pago.moneda,
                    fechaMovimiento: new Date(),
                    fechaValor: new Date(),
                    numeroOperacion: numeroOperacion || `PAGO-${pago.codigo}`,
                    saldoAnterior: cuentaOrigen.saldoActual,
                    saldoPosterior: cuentaOrigen.saldoActual - montoPagado,
                    estado: 'procesado',
                    responsable: {
                        nombre: userData.creatorName,
                        email: userData.creatorEmail
                    },
                    observaciones: `Pago automático de cuota de financiamiento`,
                    ...userData
                });
                
                cuentaOrigen.saldoActual -= montoPagado;
                cuentaOrigen.fechaUltimoMovimiento = new Date();
                
                await movimiento.save();
                await cuentaOrigen.save();
                
                pago.cuentaOrigenId = cuentaOrigenId;
                await pago.save();
            }
            
            // Actualizar estadísticas del préstamo
            await this.actualizarEstadisticasPrestamo(pago.prestamoId._id, montoPagado);
            
            console.log('✅ Pago procesado exitosamente');
            
            return {
                pago,
                movimiento,
                cuentaActualizada: cuentaOrigen
            };
            
        } catch (error) {
            console.error('❌ Error procesando pago:', error);
            throw new Error(`Error al procesar pago: ${error.message}`);
        }
    }
    
    /**
     * Rechazar pago
     */
    static async rechazarPago(id, motivo = '') {
        try {
            console.log(`❌ Rechazando pago ${id}`);
            
            const pago = await PagoFinanciamiento.findById(id);
            if (!pago) {
                throw new Error('Pago de financiamiento no encontrado');
            }
            
            if (pago.estado !== 'pendiente') {
                throw new Error('Solo se pueden rechazar pagos pendientes');
            }
            
            await pago.rechazar(motivo);
            
            console.log('✅ Pago rechazado exitosamente');
            return pago;
            
        } catch (error) {
            console.error('❌ Error rechazando pago:', error);
            throw new Error(`Error al rechazar pago: ${error.message}`);
        }
    }
    
    /**
     * Cancelar pago
     */
    static async cancelarPago(id, motivo = '') {
        try {
            console.log(`🚫 Cancelando pago ${id}`);
            
            const pago = await PagoFinanciamiento.findById(id);
            if (!pago) {
                throw new Error('Pago de financiamiento no encontrado');
            }
            
            if (pago.estado === 'procesado') {
                throw new Error('No se pueden cancelar pagos ya procesados');
            }
            
            await pago.cancelar(motivo);
            
            console.log('✅ Pago cancelado exitosamente');
            return pago;
            
        } catch (error) {
            console.error('❌ Error cancelando pago:', error);
            throw new Error(`Error al cancelar pago: ${error.message}`);
        }
    }
    
    /**
     * Aplicar descuento a un pago
     */
    static async aplicarDescuento(id, tipo, monto = 0, porcentaje = 0, descripcion = '') {
        try {
            console.log(`💸 Aplicando descuento al pago ${id}`);
            
            const pago = await PagoFinanciamiento.findById(id);
            if (!pago) {
                throw new Error('Pago de financiamiento no encontrado');
            }
            
            if (pago.estado === 'procesado') {
                throw new Error('No se pueden aplicar descuentos a pagos ya procesados');
            }
            
            if (!tipo) {
                throw new Error('El tipo de descuento es requerido');
            }
            
            if (monto <= 0 && porcentaje <= 0) {
                throw new Error('Se debe especificar un monto o porcentaje de descuento');
            }
            
            await pago.aplicarDescuento(tipo, monto, porcentaje, descripcion);
            
            console.log('✅ Descuento aplicado exitosamente');
            return pago;
            
        } catch (error) {
            console.error('❌ Error aplicando descuento:', error);
            throw new Error(`Error al aplicar descuento: ${error.message}`);
        }
    }
    
    /**
     * Calcular mora de un pago
     */
    static async calcularMora(id, tasaMoraDiaria = 0.033) {
        try {
            console.log(`⏰ Calculando mora para pago ${id}`);
            
            const pago = await PagoFinanciamiento.findById(id);
            if (!pago) {
                throw new Error('Pago de financiamiento no encontrado');
            }
            
            if (pago.estado === 'procesado') {
                throw new Error('No se puede calcular mora en pagos ya procesados');
            }
            
            // Calcular días de mora
            const hoy = new Date();
            if (pago.fechaVencimiento > hoy) {
                throw new Error('El pago no está vencido, no se puede calcular mora');
            }
            
            const diasMora = Math.floor((hoy - pago.fechaVencimiento) / (1000 * 60 * 60 * 24));
            pago.diasMora = diasMora;
            
            const mora = pago.calcularMora(tasaMoraDiaria);
            await pago.save();
            
            console.log(`✅ Mora calculada: ${mora} por ${diasMora} días`);
            return pago;
            
        } catch (error) {
            console.error('❌ Error calculando mora:', error);
            throw new Error(`Error al calcular mora: ${error.message}`);
        }
    }
    
    /**
     * Obtener pagos vencidos
     */
    static async obtenerPagosVencidos(userId) {
        try {
            console.log('⏰ Obteniendo pagos vencidos');
            
            const pagosVencidos = await PagoFinanciamiento.obtenerVencidos(userId);
            
            console.log(`✅ ${pagosVencidos.length} pagos vencidos encontrados`);
            return pagosVencidos;
            
        } catch (error) {
            console.error('❌ Error obteniendo pagos vencidos:', error);
            throw new Error(`Error al obtener pagos vencidos: ${error.message}`);
        }
    }
    
    /**
     * Obtener pagos próximos a vencer
     */
    static async obtenerPagosProximosVencer(dias = 7, userId = null) {
        try {
            console.log(`⏰ Obteniendo pagos próximos a vencer en ${dias} días`);
            
            const pagosProximos = await PagoFinanciamiento.obtenerProximosVencer(dias, userId);
            
            console.log(`✅ ${pagosProximos.length} pagos próximos a vencer encontrados`);
            return pagosProximos;
            
        } catch (error) {
            console.error('❌ Error obteniendo pagos próximos a vencer:', error);
            throw new Error(`Error al obtener pagos próximos a vencer: ${error.message}`);
        }
    }
    
    /**
     * Obtener pagos por préstamo
     */
    static async obtenerPagosPorPrestamo(prestamoId, estado = null, limite = 50, pagina = 1) {
        try {
            console.log(`📋 Obteniendo pagos del préstamo ${prestamoId}`);
            
            const skip = (pagina - 1) * limite;
            
            let query = { prestamoId };
            if (estado) {
                if (Array.isArray(estado)) {
                    query.estado = { $in: estado };
                } else {
                    query.estado = estado;
                }
            }
            
            const [pagos, total] = await Promise.all([
                PagoFinanciamiento.find(query)
                    .populate('cuentaOrigenId', 'nombre banco')
                    .sort({ numeroCuota: 1 })
                    .skip(skip)
                    .limit(limite),
                PagoFinanciamiento.countDocuments(query)
            ]);
            
            console.log(`✅ ${pagos.length} pagos obtenidos de ${total} totales`);
            
            return {
                pagos,
                paginacion: {
                    paginaActual: pagina,
                    totalPaginas: Math.ceil(total / limite),
                    totalRegistros: total,
                    registrosPorPagina: limite
                }
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo pagos del préstamo:', error);
            throw new Error(`Error al obtener pagos del préstamo: ${error.message}`);
        }
    }
    
    /**
     * Obtener cronograma de pagos
     */
    static async obtenerCronogramaPagos(prestamoId) {
        try {
            console.log(`📅 Obteniendo cronograma de pagos para préstamo ${prestamoId}`);
            
            const pagos = await PagoFinanciamiento.obtenerPorPrestamo(prestamoId);
            
            const cronograma = pagos.map(pago => pago.obtenerResumen());
            
            console.log(`✅ Cronograma obtenido con ${cronograma.length} pagos`);
            return cronograma;
            
        } catch (error) {
            console.error('❌ Error obteniendo cronograma:', error);
            throw new Error(`Error al obtener cronograma de pagos: ${error.message}`);
        }
    }
    
    /**
     * Generar cronograma de pagos para un préstamo
     */
    static async generarCronogramaPagos(prestamoId, userData) {
        try {
            console.log(`📅 Generando cronograma de pagos para préstamo ${prestamoId}`);
            
            const prestamo = await Prestamo.findById(prestamoId);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            // Verificar si ya tiene pagos generados
            const pagosExistentes = await PagoFinanciamiento.countDocuments({ prestamoId });
            if (pagosExistentes > 0) {
                throw new Error('El préstamo ya tiene pagos generados');
            }
            
            const pagos = await PagoFinanciamiento.generarPagosParaPrestamo(prestamo, userData);
            
            console.log(`✅ Cronograma generado con ${pagos.length} pagos`);
            return pagos;
            
        } catch (error) {
            console.error('❌ Error generando cronograma:', error);
            throw new Error(`Error al generar cronograma de pagos: ${error.message}`);
        }
    }
    
    /**
     * Procesar pagos en lote
     */
    static async procesarPagosEnLote(pagos, userData) {
        try {
            console.log(`🔄 Procesando ${pagos.length} pagos en lote`);
            
            const resultados = {
                exitosos: [],
                fallidos: []
            };
            
            for (const datosPago of pagos) {
                try {
                    const resultado = await this.procesarPago(
                        datosPago.id,
                        datosPago.montoPagado,
                        datosPago.metodoPago,
                        datosPago.numeroOperacion,
                        datosPago.cuentaOrigenId,
                        userData
                    );
                    
                    resultados.exitosos.push({
                        id: datosPago.id,
                        resultado
                    });
                    
                } catch (error) {
                    resultados.fallidos.push({
                        id: datosPago.id,
                        error: error.message
                    });
                }
            }
            
            console.log(`✅ Lote procesado: ${resultados.exitosos.length} exitosos, ${resultados.fallidos.length} fallidos`);
            return resultados;
            
        } catch (error) {
            console.error('❌ Error procesando lote de pagos:', error);
            throw new Error(`Error al procesar lote de pagos: ${error.message}`);
        }
    }
    
    /**
     * Obtener estadísticas de pagos
     */
    static async obtenerEstadisticas(userId, fechaInicio = null, fechaFin = null) {
        try {
            console.log('📈 Obteniendo estadísticas de pagos de financiamiento');
            
            const estadisticas = await PagoFinanciamiento.obtenerEstadisticas(userId, fechaInicio, fechaFin);
            
            // Agregar estadísticas adicionales
            const pagos = await PagoFinanciamiento.find({
                userId,
                ...(fechaInicio && { fechaPago: { $gte: new Date(fechaInicio) } }),
                ...(fechaFin && { fechaPago: { $lte: new Date(fechaFin) } })
            });
            
            const estadisticasDetalladas = {
                ...estadisticas,
                eficienciaCobranza: this.calcularEficienciaCobranza(pagos),
                distribucionPorMetodo: this.calcularDistribucionPorMetodo(pagos),
                promedioMora: this.calcularPromedioMora(pagos),
                ultimaActualizacion: new Date().toISOString()
            };
            
            console.log('✅ Estadísticas obtenidas exitosamente');
            return estadisticasDetalladas;
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            throw new Error(`Error al obtener estadísticas: ${error.message}`);
        }
    }
    
    /**
     * Obtener resumen por período
     */
    static async obtenerResumenPorPeriodo(userId, fechaInicio, fechaFin, agruparPor = 'mes') {
        try {
            console.log('📊 Obteniendo resumen de pagos por período');
            
            const inicio = new Date(fechaInicio);
            const fin = new Date(fechaFin);
            
            // Configurar agrupación
            let formatoFecha;
            switch (agruparPor) {
                case 'dia':
                    formatoFecha = '%Y-%m-%d';
                    break;
                case 'semana':
                    formatoFecha = '%Y-%U';
                    break;
                case 'mes':
                    formatoFecha = '%Y-%m';
                    break;
                default:
                    formatoFecha = '%Y-%m';
            }
            
            const pipeline = [
                {
                    $match: {
                        userId: userId,
                        fechaPago: { $gte: inicio, $lte: fin },
                        estado: 'procesado'
                    }
                },
                {
                    $group: {
                        _id: {
                            fecha: { $dateToString: { format: formatoFecha, date: '$fechaPago' } },
                            tipo: '$tipo'
                        },
                        totalPagado: { $sum: '$montoPagado' },
                        cantidadPagos: { $sum: 1 },
                        totalCapital: { $sum: '$montoCapital' },
                        totalInteres: { $sum: '$montoInteres' },
                        totalMora: { $sum: '$montoMora' }
                    }
                },
                {
                    $group: {
                        _id: '$_id.fecha',
                        detalles: {
                            $push: {
                                tipo: '$_id.tipo',
                                totalPagado: '$totalPagado',
                                cantidadPagos: '$cantidadPagos',
                                totalCapital: '$totalCapital',
                                totalInteres: '$totalInteres',
                                totalMora: '$totalMora'
                            }
                        },
                        totalGeneral: { $sum: '$totalPagado' },
                        totalPagos: { $sum: '$cantidadPagos' }
                    }
                },
                { $sort: { _id: 1 } }
            ];
            
            const resultado = await PagoFinanciamiento.aggregate(pipeline);
            
            console.log(`✅ Resumen generado para ${resultado.length} períodos`);
            return resultado;
            
        } catch (error) {
            console.error('❌ Error obteniendo resumen por período:', error);
            throw new Error(`Error al obtener resumen por período: ${error.message}`);
        }
    }
    
    /**
     * Obtener métodos de pago disponibles
     */
    static obtenerMetodosPago() {
        return [
            { codigo: 'transferencia', nombre: 'Transferencia Bancaria', descripcion: 'Transferencia desde cuenta bancaria' },
            { codigo: 'debito_automatico', nombre: 'Débito Automático', descripcion: 'Cargo automático a cuenta' },
            { codigo: 'efectivo', nombre: 'Efectivo', descripcion: 'Pago en efectivo' },
            { codigo: 'cheque', nombre: 'Cheque', descripcion: 'Pago con cheque' },
            { codigo: 'deposito', nombre: 'Depósito', descripcion: 'Depósito en cuenta bancaria' }
        ];
    }
    
    /**
     * Obtener tipos de descuento disponibles
     */
    static obtenerTiposDescuento() {
        return [
            { codigo: 'pronto_pago', nombre: 'Pronto Pago', descripcion: 'Descuento por pago anticipado' },
            { codigo: 'cliente_frecuente', nombre: 'Cliente Frecuente', descripcion: 'Descuento por fidelidad' },
            { codigo: 'promocion', nombre: 'Promoción', descripcion: 'Descuento promocional' },
            { codigo: 'condonacion', nombre: 'Condonación', descripcion: 'Condonación de deuda' },
            { codigo: 'otro', nombre: 'Otro', descripcion: 'Otro tipo de descuento' }
        ];
    }
    
    // ==================== MÉTODOS AUXILIARES ====================
    
    static async actualizarEstadisticasPrestamo(prestamoId, montoPagado) {
        try {
            const prestamo = await Prestamo.findById(prestamoId);
            if (prestamo) {
                prestamo.estadisticas.cuotasPagadas += 1;
                prestamo.estadisticas.cuotasPendientes = 
                    prestamo.plazoMeses - prestamo.estadisticas.cuotasPagadas;
                prestamo.saldoPendiente = Math.max(0, prestamo.saldoPendiente - montoPagado);
                
                await prestamo.save();
            }
        } catch (error) {
            console.error('❌ Error actualizando estadísticas del préstamo:', error);
        }
    }
    
    static calcularEficienciaCobranza(pagos) {
        const totalProgramado = pagos.reduce((sum, pago) => sum + pago.montoTotal, 0);
        const totalPagado = pagos.reduce((sum, pago) => sum + pago.montoPagado, 0);
        
        return totalProgramado > 0 ? (totalPagado / totalProgramado) * 100 : 0;
    }
    
    static calcularDistribucionPorMetodo(pagos) {
        const distribucion = {};
        
        pagos.forEach(pago => {
            if (pago.estado === 'procesado') {
                if (!distribucion[pago.metodoPago]) {
                    distribucion[pago.metodoPago] = {
                        metodo: pago.metodoPago,
                        cantidad: 0,
                        montoTotal: 0
                    };
                }
                
                distribucion[pago.metodoPago].cantidad++;
                distribucion[pago.metodoPago].montoTotal += pago.montoPagado;
            }
        });
        
        return Object.values(distribucion);
    }
    
    static calcularPromedioMora(pagos) {
        const pagosConMora = pagos.filter(pago => pago.diasMora > 0);
        
        if (pagosConMora.length === 0) return 0;
        
        const totalDiasMora = pagosConMora.reduce((sum, pago) => sum + pago.diasMora, 0);
        return totalDiasMora / pagosConMora.length;
    }
}

module.exports = PagosFinanciamientoService;
