const MovimientoBancario = require('../../models/finanzas/MovimientoBancario');
const CuentaBancaria = require('../../models/finanzas/CuentaBancaria');

class MovimientosBancariosService {
    /**
     * Obtener movimientos bancarios con filtros
     */
    static async obtenerMovimientos(filtros = {}, limite = 50, pagina = 1) {
        try {
            console.log('🔍 Obteniendo movimientos bancarios con filtros:', filtros);
            
            const skip = (pagina - 1) * limite;
            let query = {};
            
            // Filtros básicos
            if (filtros.userId) query.userId = filtros.userId;
            if (filtros.cuentaBancariaId) query.cuentaBancariaId = filtros.cuentaBancariaId;
            if (filtros.tipo) query.tipo = filtros.tipo;
            if (filtros.categoria) query.categoria = filtros.categoria;
            if (filtros.estado) query.estado = filtros.estado;
            
            // Filtro por rango de fechas
            if (filtros.fechaInicio || filtros.fechaFin) {
                query.fechaMovimiento = {};
                if (filtros.fechaInicio) {
                    query.fechaMovimiento.$gte = new Date(filtros.fechaInicio);
                }
                if (filtros.fechaFin) {
                    query.fechaMovimiento.$lte = new Date(filtros.fechaFin);
                }
            }
            
            // Filtro por rango de montos
            if (filtros.montoMin || filtros.montoMax) {
                query.monto = {};
                if (filtros.montoMin) {
                    query.monto.$gte = parseFloat(filtros.montoMin);
                }
                if (filtros.montoMax) {
                    query.monto.$lte = parseFloat(filtros.montoMax);
                }
            }
            
            // Búsqueda por texto
            if (filtros.buscar) {
                query.$or = [
                    { descripcion: { $regex: filtros.buscar, $options: 'i' } },
                    { numeroOperacion: { $regex: filtros.buscar, $options: 'i' } },
                    { observaciones: { $regex: filtros.buscar, $options: 'i' } },
                    { 'responsable.nombre': { $regex: filtros.buscar, $options: 'i' } }
                ];
            }
            
            const [movimientos, total] = await Promise.all([
                MovimientoBancario.find(query)
                    .populate('cuentaBancariaId', 'nombre banco tipoCuenta moneda')
                    .populate('cuentaDestinoId', 'nombre banco tipoCuenta moneda')
                    .sort({ fechaMovimiento: -1 })
                    .skip(skip)
                    .limit(limite),
                MovimientoBancario.countDocuments(query)
            ]);
            
            console.log(`✅ ${movimientos.length} movimientos obtenidos de ${total} totales`);
            
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
            throw new Error(`Error al obtener movimientos bancarios: ${error.message}`);
        }
    }
    
    /**
     * Obtener movimiento por ID
     */
    static async obtenerMovimientoPorId(id) {
        try {
            console.log('🔍 Buscando movimiento por ID:', id);
            
            const movimiento = await MovimientoBancario.findById(id)
                .populate('cuentaBancariaId', 'nombre banco tipoCuenta moneda')
                .populate('cuentaDestinoId', 'nombre banco tipoCuenta moneda');
            
            if (!movimiento) {
                throw new Error('Movimiento bancario no encontrado');
            }
            
            console.log('✅ Movimiento encontrado:', movimiento.descripcion);
            return movimiento;
            
        } catch (error) {
            console.error('❌ Error obteniendo movimiento:', error);
            throw new Error(`Error al obtener movimiento bancario: ${error.message}`);
        }
    }
    
    /**
     * Registrar nuevo ingreso
     */
    static async registrarIngreso(datosIngreso, userData) {
        try {
            console.log('💰 Registrando nuevo ingreso:', datosIngreso.descripcion);
            
            // Validaciones básicas
            if (!datosIngreso.cuentaBancariaId || !datosIngreso.monto || datosIngreso.monto <= 0) {
                throw new Error('Cuenta bancaria y monto válido son requeridos');
            }
            
            if (!datosIngreso.descripcion) {
                throw new Error('La descripción es requerida');
            }
            
            // Verificar que la cuenta existe y está activa
            const cuenta = await CuentaBancaria.findById(datosIngreso.cuentaBancariaId);
            if (!cuenta) {
                throw new Error('Cuenta bancaria no encontrada');
            }
            
            if (!cuenta.activa) {
                throw new Error('No se pueden realizar movimientos en una cuenta inactiva');
            }
            
            // Crear el movimiento
            const movimiento = new MovimientoBancario({
                cuentaBancariaId: datosIngreso.cuentaBancariaId,
                tipo: 'ingreso',
                categoria: datosIngreso.categoria || 'ingreso_extra',
                subcategoria: datosIngreso.subcategoria || 'otro',
                descripcion: datosIngreso.descripcion,
                monto: datosIngreso.monto,
                moneda: datosIngreso.moneda || cuenta.moneda,
                fechaMovimiento: datosIngreso.fechaMovimiento ? new Date(datosIngreso.fechaMovimiento) : new Date(),
                fechaValor: datosIngreso.fechaValor ? new Date(datosIngreso.fechaValor) : new Date(),
                numeroOperacion: datosIngreso.numeroOperacion || `ING-${Date.now()}`,
                saldoAnterior: cuenta.saldoActual,
                saldoPosterior: cuenta.saldoActual + datosIngreso.monto,
                estado: 'procesado',
                responsable: datosIngreso.responsable || {
                    nombre: userData.creatorName,
                    email: userData.creatorEmail
                },
                observaciones: datosIngreso.observaciones || '',
                ...userData
            });
            
            // Actualizar saldo de la cuenta
            cuenta.saldoActual += datosIngreso.monto;
            cuenta.fechaUltimoMovimiento = movimiento.fechaMovimiento;
            
            // Guardar en transacción simulada
            await movimiento.save();
            await cuenta.save();
            
            console.log('✅ Ingreso registrado exitosamente:', movimiento.numeroOperacion);
            return movimiento;
            
        } catch (error) {
            console.error('❌ Error registrando ingreso:', error);
            throw new Error(`Error al registrar ingreso: ${error.message}`);
        }
    }
    
    /**
     * Registrar nuevo egreso
     */
    static async registrarEgreso(datosEgreso, userData) {
        try {
            console.log('💸 Registrando nuevo egreso:', datosEgreso.descripcion);
            
            // Validaciones básicas
            if (!datosEgreso.cuentaBancariaId || !datosEgreso.monto || datosEgreso.monto <= 0) {
                throw new Error('Cuenta bancaria y monto válido son requeridos');
            }
            
            if (!datosEgreso.descripcion) {
                throw new Error('La descripción es requerida');
            }
            
            // Verificar que la cuenta existe y está activa
            const cuenta = await CuentaBancaria.findById(datosEgreso.cuentaBancariaId);
            if (!cuenta) {
                throw new Error('Cuenta bancaria no encontrada');
            }
            
            if (!cuenta.activa) {
                throw new Error('No se pueden realizar movimientos en una cuenta inactiva');
            }
            
            // Verificar saldo suficiente
            if (cuenta.saldoActual < datosEgreso.monto) {
                throw new Error('Saldo insuficiente en la cuenta');
            }
            
            // Crear el movimiento
            const movimiento = new MovimientoBancario({
                cuentaBancariaId: datosEgreso.cuentaBancariaId,
                tipo: 'egreso',
                categoria: datosEgreso.categoria || 'egreso_operativo',
                subcategoria: datosEgreso.subcategoria || 'otro',
                descripcion: datosEgreso.descripcion,
                monto: datosEgreso.monto,
                moneda: datosEgreso.moneda || cuenta.moneda,
                fechaMovimiento: datosEgreso.fechaMovimiento ? new Date(datosEgreso.fechaMovimiento) : new Date(),
                fechaValor: datosEgreso.fechaValor ? new Date(datosEgreso.fechaValor) : new Date(),
                numeroOperacion: datosEgreso.numeroOperacion || `EGR-${Date.now()}`,
                saldoAnterior: cuenta.saldoActual,
                saldoPosterior: cuenta.saldoActual - datosEgreso.monto,
                estado: 'procesado',
                responsable: datosEgreso.responsable || {
                    nombre: userData.creatorName,
                    email: userData.creatorEmail
                },
                observaciones: datosEgreso.observaciones || '',
                ...userData
            });
            
            // Actualizar saldo de la cuenta
            cuenta.saldoActual -= datosEgreso.monto;
            cuenta.fechaUltimoMovimiento = movimiento.fechaMovimiento;
            
            // Guardar en transacción simulada
            await movimiento.save();
            await cuenta.save();
            
            console.log('✅ Egreso registrado exitosamente:', movimiento.numeroOperacion);
            return movimiento;
            
        } catch (error) {
            console.error('❌ Error registrando egreso:', error);
            throw new Error(`Error al registrar egreso: ${error.message}`);
        }
    }
    
    /**
     * Registrar transferencia entre cuentas
     */
    static async registrarTransferencia(datosTransferencia, userData) {
        try {
            console.log('🔄 Registrando transferencia entre cuentas');
            
            // Validaciones básicas
            if (!datosTransferencia.cuentaOrigenId || !datosTransferencia.cuentaDestinoId) {
                throw new Error('Cuenta origen y destino son requeridas');
            }
            
            if (datosTransferencia.cuentaOrigenId === datosTransferencia.cuentaDestinoId) {
                throw new Error('La cuenta origen y destino no pueden ser la misma');
            }
            
            if (!datosTransferencia.monto || datosTransferencia.monto <= 0) {
                throw new Error('Monto válido es requerido');
            }
            
            if (!datosTransferencia.descripcion) {
                throw new Error('La descripción es requerida');
            }
            
            // Verificar cuentas
            const [cuentaOrigen, cuentaDestino] = await Promise.all([
                CuentaBancaria.findById(datosTransferencia.cuentaOrigenId),
                CuentaBancaria.findById(datosTransferencia.cuentaDestinoId)
            ]);
            
            if (!cuentaOrigen) {
                throw new Error('Cuenta origen no encontrada');
            }
            
            if (!cuentaDestino) {
                throw new Error('Cuenta destino no encontrada');
            }
            
            if (!cuentaOrigen.activa || !cuentaDestino.activa) {
                throw new Error('No se pueden realizar transferencias con cuentas inactivas');
            }
            
            // Verificar saldo suficiente
            if (cuentaOrigen.saldoActual < datosTransferencia.monto) {
                throw new Error('Saldo insuficiente en la cuenta origen');
            }
            
            const fechaMovimiento = datosTransferencia.fechaMovimiento ? 
                new Date(datosTransferencia.fechaMovimiento) : new Date();
            const numeroOperacion = datosTransferencia.numeroOperacion || `TRF-${Date.now()}`;
            
            // Crear movimiento de egreso (cuenta origen)
            const movimientoEgreso = new MovimientoBancario({
                cuentaBancariaId: cuentaOrigen._id,
                cuentaDestinoId: cuentaDestino._id,
                tipo: 'transferencia_salida',
                categoria: 'transferencia',
                subcategoria: 'transferencia_interna',
                descripcion: `Transferencia a ${cuentaDestino.nombre}: ${datosTransferencia.descripcion}`,
                monto: datosTransferencia.monto,
                moneda: datosTransferencia.moneda || cuentaOrigen.moneda,
                fechaMovimiento: fechaMovimiento,
                fechaValor: datosTransferencia.fechaValor ? new Date(datosTransferencia.fechaValor) : fechaMovimiento,
                numeroOperacion: numeroOperacion,
                saldoAnterior: cuentaOrigen.saldoActual,
                saldoPosterior: cuentaOrigen.saldoActual - datosTransferencia.monto,
                estado: 'procesado',
                responsable: datosTransferencia.responsable || {
                    nombre: userData.creatorName,
                    email: userData.creatorEmail
                },
                observaciones: datosTransferencia.observaciones || '',
                ...userData
            });
            
            // Crear movimiento de ingreso (cuenta destino)
            const movimientoIngreso = new MovimientoBancario({
                cuentaBancariaId: cuentaDestino._id,
                cuentaOrigenId: cuentaOrigen._id,
                tipo: 'transferencia_entrada',
                categoria: 'transferencia',
                subcategoria: 'transferencia_interna',
                descripcion: `Transferencia desde ${cuentaOrigen.nombre}: ${datosTransferencia.descripcion}`,
                monto: datosTransferencia.monto,
                moneda: datosTransferencia.moneda || cuentaDestino.moneda,
                fechaMovimiento: fechaMovimiento,
                fechaValor: datosTransferencia.fechaValor ? new Date(datosTransferencia.fechaValor) : fechaMovimiento,
                numeroOperacion: numeroOperacion,
                saldoAnterior: cuentaDestino.saldoActual,
                saldoPosterior: cuentaDestino.saldoActual + datosTransferencia.monto,
                estado: 'procesado',
                responsable: datosTransferencia.responsable || {
                    nombre: userData.creatorName,
                    email: userData.creatorEmail
                },
                observaciones: datosTransferencia.observaciones || '',
                ...userData
            });
            
            // Actualizar saldos
            cuentaOrigen.saldoActual -= datosTransferencia.monto;
            cuentaOrigen.fechaUltimoMovimiento = fechaMovimiento;
            
            cuentaDestino.saldoActual += datosTransferencia.monto;
            cuentaDestino.fechaUltimoMovimiento = fechaMovimiento;
            
            // Guardar todo en transacción simulada
            await movimientoEgreso.save();
            await movimientoIngreso.save();
            await cuentaOrigen.save();
            await cuentaDestino.save();
            
            console.log('✅ Transferencia registrada exitosamente:', numeroOperacion);
            
            return {
                numeroOperacion,
                movimientoEgreso,
                movimientoIngreso,
                cuentaOrigen: {
                    id: cuentaOrigen._id,
                    nombre: cuentaOrigen.nombre,
                    saldoAnterior: movimientoEgreso.saldoAnterior,
                    saldoActual: cuentaOrigen.saldoActual
                },
                cuentaDestino: {
                    id: cuentaDestino._id,
                    nombre: cuentaDestino.nombre,
                    saldoAnterior: movimientoIngreso.saldoAnterior,
                    saldoActual: cuentaDestino.saldoActual
                }
            };
            
        } catch (error) {
            console.error('❌ Error registrando transferencia:', error);
            throw new Error(`Error al registrar transferencia: ${error.message}`);
        }
    }
    
    /**
     * Actualizar movimiento bancario
     */
    static async actualizarMovimiento(id, datosActualizacion) {
        try {
            console.log('✏️ Actualizando movimiento bancario:', id);
            
            const movimiento = await MovimientoBancario.findById(id);
            if (!movimiento) {
                throw new Error('Movimiento bancario no encontrado');
            }
            
            // Validar que el movimiento se puede actualizar
            if (movimiento.estado === 'procesado' && 
                (datosActualizacion.monto !== undefined || datosActualizacion.cuentaBancariaId)) {
                throw new Error('No se puede modificar el monto o cuenta de un movimiento procesado');
            }
            
            // Campos que no se pueden modificar
            const camposProtegidos = ['codigo', 'userId', 'saldoAnterior', 'saldoPosterior', 'createdAt'];
            camposProtegidos.forEach(campo => {
                if (datosActualizacion.hasOwnProperty(campo)) {
                    delete datosActualizacion[campo];
                }
            });
            
            // Actualizar movimiento
            Object.assign(movimiento, datosActualizacion);
            await movimiento.save();
            
            console.log('✅ Movimiento actualizado exitosamente');
            return movimiento;
            
        } catch (error) {
            console.error('❌ Error actualizando movimiento:', error);
            throw new Error(`Error al actualizar movimiento bancario: ${error.message}`);
        }
    }
    
    /**
     * Cancelar movimiento bancario
     */
    static async cancelarMovimiento(id, motivo, userData) {
        try {
            console.log('❌ Cancelando movimiento bancario:', id);
            
            const movimiento = await MovimientoBancario.findById(id)
                .populate('cuentaBancariaId');
            
            if (!movimiento) {
                throw new Error('Movimiento bancario no encontrado');
            }
            
            if (movimiento.estado === 'cancelado') {
                throw new Error('El movimiento ya está cancelado');
            }
            
            if (movimiento.estado !== 'procesado') {
                throw new Error('Solo se pueden cancelar movimientos procesados');
            }
            
            const cuenta = movimiento.cuentaBancariaId;
            
            // Crear movimiento de reversión
            const tipoReversion = movimiento.tipo === 'ingreso' || movimiento.tipo === 'transferencia_entrada' ? 
                'egreso' : 'ingreso';
            
            const movimientoReversion = new MovimientoBancario({
                cuentaBancariaId: cuenta._id,
                tipo: tipoReversion,
                categoria: 'ajuste',
                subcategoria: 'cancelacion',
                descripcion: `Cancelación de: ${movimiento.descripcion}`,
                monto: movimiento.monto,
                moneda: movimiento.moneda,
                fechaMovimiento: new Date(),
                fechaValor: new Date(),
                numeroOperacion: `CANCEL-${movimiento.numeroOperacion}`,
                saldoAnterior: cuenta.saldoActual,
                saldoPosterior: tipoReversion === 'egreso' ? 
                    cuenta.saldoActual - movimiento.monto : 
                    cuenta.saldoActual + movimiento.monto,
                estado: 'procesado',
                responsable: {
                    nombre: userData.creatorName,
                    email: userData.creatorEmail
                },
                observaciones: `Cancelación del movimiento ${movimiento.numeroOperacion}. Motivo: ${motivo}`,
                movimientoRelacionadoId: movimiento._id,
                ...userData
            });
            
            // Actualizar saldo de la cuenta
            if (tipoReversion === 'egreso') {
                cuenta.saldoActual -= movimiento.monto;
            } else {
                cuenta.saldoActual += movimiento.monto;
            }
            
            cuenta.fechaUltimoMovimiento = new Date();
            
            // Marcar movimiento original como cancelado
            movimiento.estado = 'cancelado';
            movimiento.motivoCancelacion = motivo;
            movimiento.fechaCancelacion = new Date();
            movimiento.canceladoPor = {
                nombre: userData.creatorName,
                email: userData.creatorEmail
            };
            
            // Guardar cambios
            await movimientoReversion.save();
            await movimiento.save();
            await cuenta.save();
            
            console.log('✅ Movimiento cancelado exitosamente');
            
            return {
                movimientoOriginal: movimiento,
                movimientoReversion: movimientoReversion,
                cuentaActualizada: cuenta
            };
            
        } catch (error) {
            console.error('❌ Error cancelando movimiento:', error);
            throw new Error(`Error al cancelar movimiento bancario: ${error.message}`);
        }
    }
    
    /**
     * Obtener resumen de movimientos por período
     */
    static async obtenerResumenPorPeriodo(userId, fechaInicio, fechaFin, agruparPor = 'dia') {
        try {
            console.log('📊 Obteniendo resumen de movimientos por período');
            
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
                    formatoFecha = '%Y-%m-%d';
            }
            
            const pipeline = [
                {
                    $match: {
                        userId: userId,
                        fechaMovimiento: { $gte: inicio, $lte: fin },
                        estado: 'procesado'
                    }
                },
                {
                    $group: {
                        _id: {
                            fecha: { $dateToString: { format: formatoFecha, date: '$fechaMovimiento' } },
                            tipo: '$tipo'
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                {
                    $group: {
                        _id: '$_id.fecha',
                        movimientos: {
                            $push: {
                                tipo: '$_id.tipo',
                                total: '$total',
                                cantidad: '$cantidad'
                            }
                        },
                        totalGeneral: { $sum: '$total' }
                    }
                },
                { $sort: { _id: 1 } }
            ];
            
            const resultado = await MovimientoBancario.aggregate(pipeline);
            
            // Procesar resultado para formato más amigable
            const resumen = resultado.map(item => {
                const ingresos = item.movimientos.find(m => 
                    m.tipo === 'ingreso' || m.tipo === 'transferencia_entrada'
                ) || { total: 0, cantidad: 0 };
                
                const egresos = item.movimientos.find(m => 
                    m.tipo === 'egreso' || m.tipo === 'transferencia_salida'
                ) || { total: 0, cantidad: 0 };
                
                return {
                    fecha: item._id,
                    ingresos: {
                        total: ingresos.total,
                        cantidad: ingresos.cantidad
                    },
                    egresos: {
                        total: egresos.total,
                        cantidad: egresos.cantidad
                    },
                    flujoNeto: ingresos.total - egresos.total,
                    totalMovimientos: item.movimientos.reduce((sum, m) => sum + m.cantidad, 0)
                };
            });
            
            console.log(`✅ Resumen generado para ${resumen.length} períodos`);
            return resumen;
            
        } catch (error) {
            console.error('❌ Error obteniendo resumen:', error);
            throw new Error(`Error al obtener resumen de movimientos: ${error.message}`);
        }
    }
    
    /**
     * Obtener estadísticas de movimientos
     */
    static async obtenerEstadisticas(userId, filtros = {}) {
        try {
            console.log('📈 Obteniendo estadísticas de movimientos bancarios');
            
            let matchQuery = { userId, estado: 'procesado' };
            
            // Aplicar filtros temporales
            if (filtros.fechaInicio || filtros.fechaFin) {
                matchQuery.fechaMovimiento = {};
                if (filtros.fechaInicio) {
                    matchQuery.fechaMovimiento.$gte = new Date(filtros.fechaInicio);
                }
                if (filtros.fechaFin) {
                    matchQuery.fechaMovimiento.$lte = new Date(filtros.fechaFin);
                }
            }
            
            const pipeline = [
                { $match: matchQuery },
                {
                    $group: {
                        _id: '$tipo',
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 },
                        promedio: { $avg: '$monto' },
                        maximo: { $max: '$monto' },
                        minimo: { $min: '$monto' }
                    }
                }
            ];
            
            const estadisticasPorTipo = await MovimientoBancario.aggregate(pipeline);
            
            // Estadísticas por categoría
            const pipelineCategoria = [
                { $match: matchQuery },
                {
                    $group: {
                        _id: {
                            categoria: '$categoria',
                            tipo: '$tipo'
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ];
            
            const estadisticasPorCategoria = await MovimientoBancario.aggregate(pipelineCategoria);
            
            // Resumen general
            const totalIngresos = estadisticasPorTipo
                .filter(e => e._id === 'ingreso' || e._id === 'transferencia_entrada')
                .reduce((sum, e) => sum + e.total, 0);
            
            const totalEgresos = estadisticasPorTipo
                .filter(e => e._id === 'egreso' || e._id === 'transferencia_salida')
                .reduce((sum, e) => sum + e.total, 0);
            
            const totalMovimientos = estadisticasPorTipo
                .reduce((sum, e) => sum + e.cantidad, 0);
            
            console.log('✅ Estadísticas obtenidas exitosamente');
            
            return {
                resumenGeneral: {
                    totalIngresos,
                    totalEgresos,
                    flujoNeto: totalIngresos - totalEgresos,
                    totalMovimientos,
                    promedioTransaccion: totalMovimientos > 0 ? 
                        (totalIngresos + totalEgresos) / totalMovimientos : 0
                },
                porTipo: estadisticasPorTipo,
                porCategoria: estadisticasPorCategoria,
                periodo: {
                    fechaInicio: filtros.fechaInicio,
                    fechaFin: filtros.fechaFin
                },
                generadoEl: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            throw new Error(`Error al obtener estadísticas de movimientos: ${error.message}`);
        }
    }
    
    /**
     * Obtener categorías disponibles
     */
    static obtenerCategoriasDisponibles() {
        return {
            ingreso: [
                { codigo: 'venta', nombre: 'Ventas', descripcion: 'Ingresos por ventas de productos/servicios' },
                { codigo: 'servicio', nombre: 'Servicios', descripcion: 'Ingresos por prestación de servicios' },
                { codigo: 'interes', nombre: 'Intereses', descripcion: 'Intereses bancarios o de inversiones' },
                { codigo: 'renta', nombre: 'Rentas', descripcion: 'Ingresos por alquileres o rentas' },
                { codigo: 'comision', nombre: 'Comisiones', descripcion: 'Ingresos por comisiones' },
                { codigo: 'ingreso_extra', nombre: 'Ingresos Extraordinarios', descripcion: 'Otros ingresos no recurrentes' },
                { codigo: 'devolucion', nombre: 'Devoluciones', descripcion: 'Devoluciones de gastos o compras' }
            ],
            egreso: [
                { codigo: 'compra', nombre: 'Compras', descripcion: 'Compra de productos para inventario' },
                { codigo: 'gasto_operativo', nombre: 'Gastos Operativos', descripcion: 'Gastos del día a día del negocio' },
                { codigo: 'gasto_administrativo', nombre: 'Gastos Administrativos', descripcion: 'Gastos de administración' },
                { codigo: 'salario', nombre: 'Salarios', descripcion: 'Pago de sueldos y salarios' },
                { codigo: 'servicios', nombre: 'Servicios', descripcion: 'Pagos por servicios (luz, agua, internet, etc.)' },
                { codigo: 'impuesto', nombre: 'Impuestos', descripcion: 'Pago de impuestos y tasas' },
                { codigo: 'prestamo', nombre: 'Préstamos', descripcion: 'Pagos de préstamos y financiamientos' },
                { codigo: 'egreso_extra', nombre: 'Egresos Extraordinarios', descripcion: 'Otros egresos no recurrentes' }
            ],
            transferencia: [
                { codigo: 'transferencia_interna', nombre: 'Transferencia Interna', descripcion: 'Entre cuentas propias' },
                { codigo: 'transferencia_externa', nombre: 'Transferencia Externa', descripcion: 'A cuentas de terceros' }
            ]
        };
    }
    
    /**
     * Validar número de operación único
     */
    static async validarNumeroOperacion(numeroOperacion, excluirId = null) {
        try {
            let query = { numeroOperacion };
            
            if (excluirId) {
                query._id = { $ne: excluirId };
            }
            
            const movimiento = await MovimientoBancario.findOne(query);
            return !movimiento; // Retorna true si no existe (es único)
            
        } catch (error) {
            console.error('❌ Error validando número de operación:', error);
            throw new Error(`Error al validar número de operación: ${error.message}`);
        }
    }
    
    /**
     * Obtener últimos movimientos de una cuenta
     */
    static async obtenerUltimosMovimientos(cuentaId, limite = 10) {
        try {
            console.log(`📋 Obteniendo últimos ${limite} movimientos de cuenta ${cuentaId}`);
            
            const movimientos = await MovimientoBancario.find({
                cuentaBancariaId: cuentaId,
                estado: 'procesado'
            })
            .populate('cuentaDestinoId', 'nombre banco')
            .populate('cuentaOrigenId', 'nombre banco')
            .sort({ fechaMovimiento: -1 })
            .limit(limite);
            
            console.log(`✅ ${movimientos.length} movimientos obtenidos`);
            return movimientos;
            
        } catch (error) {
            console.error('❌ Error obteniendo últimos movimientos:', error);
            throw new Error(`Error al obtener últimos movimientos: ${error.message}`);
        }
    }
}

module.exports = MovimientosBancariosService;
