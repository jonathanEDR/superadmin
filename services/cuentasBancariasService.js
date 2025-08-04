const CuentaBancaria = require('../models/finanzas/CuentaBancaria');
const MovimientoBancario = require('../models/finanzas/MovimientoBancario');

class CuentasBancariasService {
    /**
     * Obtener cuentas bancarias con filtros
     */
    static async obtenerCuentas(filtros = {}) {
        try {
            console.log('🔍 Obteniendo cuentas bancarias con filtros:', filtros);
            
            let query = {};
            
            // Filtros básicos
            if (filtros.userId) query.userId = filtros.userId;
            if (filtros.activas !== undefined) query.activa = filtros.activas;
            if (filtros.banco) query.banco = { $regex: filtros.banco, $options: 'i' };
            if (filtros.tipoCuenta) query.tipoCuenta = filtros.tipoCuenta;
            if (filtros.moneda) query.moneda = filtros.moneda;
            
            // Búsqueda por texto
            if (filtros.buscar) {
                query.$or = [
                    { nombre: { $regex: filtros.buscar, $options: 'i' } },
                    { banco: { $regex: filtros.buscar, $options: 'i' } },
                    { numeroCuenta: { $regex: filtros.buscar, $options: 'i' } },
                    { titular: { $regex: filtros.buscar, $options: 'i' } }
                ];
            }
            
            const cuentas = await CuentaBancaria.find(query)
                .sort({ activa: -1, createdAt: -1 });
            
            console.log(`✅ ${cuentas.length} cuentas encontradas`);
            return cuentas;
            
        } catch (error) {
            console.error('❌ Error obteniendo cuentas:', error);
            throw new Error(`Error al obtener cuentas bancarias: ${error.message}`);
        }
    }
    
    /**
     * Obtener cuenta por ID
     */
    static async obtenerCuentaPorId(id) {
        try {
            console.log('🔍 Buscando cuenta por ID:', id);
            
            const cuenta = await CuentaBancaria.findById(id);
            
            if (!cuenta) {
                throw new Error('Cuenta bancaria no encontrada');
            }
            
            console.log('✅ Cuenta encontrada:', cuenta.nombre);
            return cuenta;
            
        } catch (error) {
            console.error('❌ Error obteniendo cuenta:', error);
            throw new Error(`Error al obtener cuenta bancaria: ${error.message}`);
        }
    }
    
    /**
     * Crear nueva cuenta bancaria
     */
    static async crearCuenta(datosCuenta, userData) {
        try {
            console.log('➕ Creando nueva cuenta bancaria:', datosCuenta.nombre);
            
            // Validaciones básicas
            if (!datosCuenta.nombre || !datosCuenta.banco || !datosCuenta.numeroCuenta) {
                throw new Error('Nombre, banco y número de cuenta son requeridos');
            }
            
            if (!datosCuenta.titular) {
                throw new Error('El titular de la cuenta es requerido');
            }
            
            // Verificar que no exista otra cuenta con el mismo número
            const cuentaExistente = await CuentaBancaria.findOne({
                userId: userData.userId,
                numeroCuenta: datosCuenta.numeroCuenta,
                banco: datosCuenta.banco
            });
            
            if (cuentaExistente) {
                throw new Error('Ya existe una cuenta con este número en el mismo banco');
            }
            
            // Crear la cuenta
            const nuevaCuenta = new CuentaBancaria({
                ...datosCuenta,
                ...userData,
                saldoActual: datosCuenta.saldoInicial || 0
            });
            
            await nuevaCuenta.save();
            
            // Registrar movimiento inicial si hay saldo inicial
            if (datosCuenta.saldoInicial && datosCuenta.saldoInicial > 0) {
                await this.registrarMovimientoInicial(nuevaCuenta, userData);
            }
            
            console.log('✅ Cuenta bancaria creada exitosamente:', nuevaCuenta.codigo);
            return nuevaCuenta;
            
        } catch (error) {
            console.error('❌ Error creando cuenta:', error);
            throw new Error(`Error al crear cuenta bancaria: ${error.message}`);
        }
    }
    
    /**
     * Actualizar cuenta bancaria
     */
    static async actualizarCuenta(id, datosActualizacion) {
        try {
            console.log('✏️ Actualizando cuenta bancaria:', id);
            
            const cuenta = await CuentaBancaria.findById(id);
            if (!cuenta) {
                throw new Error('Cuenta bancaria no encontrada');
            }
            
            // No permitir cambiar ciertos campos críticos
            const camposProtegidos = ['codigo', 'userId', 'saldoActual', 'createdAt'];
            camposProtegidos.forEach(campo => {
                if (datosActualizacion.hasOwnProperty(campo)) {
                    delete datosActualizacion[campo];
                }
            });
            
            // Verificar número de cuenta único si se está cambiando
            if (datosActualizacion.numeroCuenta && 
                datosActualizacion.numeroCuenta !== cuenta.numeroCuenta) {
                
                const cuentaConNumero = await CuentaBancaria.findOne({
                    userId: cuenta.userId,
                    numeroCuenta: datosActualizacion.numeroCuenta,
                    banco: datosActualizacion.banco || cuenta.banco,
                    _id: { $ne: id }
                });
                
                if (cuentaConNumero) {
                    throw new Error('Ya existe una cuenta con este número en el mismo banco');
                }
            }
            
            // Actualizar cuenta
            Object.assign(cuenta, datosActualizacion);
            await cuenta.save();
            
            console.log('✅ Cuenta actualizada exitosamente');
            return cuenta;
            
        } catch (error) {
            console.error('❌ Error actualizando cuenta:', error);
            throw new Error(`Error al actualizar cuenta bancaria: ${error.message}`);
        }
    }
    
    /**
     * Cambiar estado de cuenta (activar/desactivar)
     */
    static async cambiarEstadoCuenta(id, activa) {
        try {
            console.log(`🔄 Cambiando estado de cuenta ${id} a ${activa ? 'activa' : 'inactiva'}`);
            
            const cuenta = await CuentaBancaria.findById(id);
            if (!cuenta) {
                throw new Error('Cuenta bancaria no encontrada');
            }
            
            if (activa) {
                await cuenta.activar();
            } else {
                await cuenta.desactivar();
            }
            
            console.log('✅ Estado de cuenta cambiado exitosamente');
            return cuenta;
            
        } catch (error) {
            console.error('❌ Error cambiando estado de cuenta:', error);
            throw new Error(`Error al cambiar estado de cuenta: ${error.message}`);
        }
    }
    
    /**
     * Eliminar cuenta bancaria
     */
    static async eliminarCuenta(id) {
        try {
            console.log('🗑️ Eliminando cuenta bancaria:', id);
            
            const cuenta = await CuentaBancaria.findById(id);
            if (!cuenta) {
                throw new Error('Cuenta bancaria no encontrada');
            }
            
            // Verificar que no tenga movimientos recientes
            const movimientosRecientes = await MovimientoBancario.countDocuments({
                cuentaBancariaId: id,
                fechaMovimiento: {
                    $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Últimos 30 días
                }
            });
            
            if (movimientosRecientes > 0) {
                throw new Error('No se puede eliminar una cuenta con movimientos recientes. Desactívela en su lugar.');
            }
            
            // Verificar saldo cero
            if (cuenta.saldoActual !== 0) {
                throw new Error('No se puede eliminar una cuenta con saldo diferente de cero');
            }
            
            await CuentaBancaria.findByIdAndDelete(id);
            
            console.log('✅ Cuenta eliminada exitosamente');
            return { id, mensaje: 'Cuenta bancaria eliminada exitosamente' };
            
        } catch (error) {
            console.error('❌ Error eliminando cuenta:', error);
            throw new Error(`Error al eliminar cuenta bancaria: ${error.message}`);
        }
    }
    
    /**
     * Ajustar saldo de cuenta
     */
    static async ajustarSaldo(id, nuevoSaldo, motivo, operador) {
        try {
            console.log(`💰 Ajustando saldo de cuenta ${id} a ${nuevoSaldo}`);
            
            const cuenta = await CuentaBancaria.findById(id);
            if (!cuenta) {
                throw new Error('Cuenta bancaria no encontrada');
            }
            
            if (!cuenta.activa) {
                throw new Error('No se puede ajustar el saldo de una cuenta inactiva');
            }
            
            const saldoAnterior = cuenta.saldoActual;
            const diferencia = nuevoSaldo - saldoAnterior;
            
            // Actualizar saldo
            cuenta.saldoActual = nuevoSaldo;
            await cuenta.save();
            
            // Registrar movimiento de ajuste
            const tipoMovimiento = diferencia >= 0 ? 'ingreso' : 'egreso';
            const montoMovimiento = Math.abs(diferencia);
            
            if (montoMovimiento > 0) {
                const movimiento = new MovimientoBancario({
                    cuentaBancariaId: cuenta._id,
                    tipo: tipoMovimiento,
                    categoria: diferencia >= 0 ? 'ingreso_extra' : 'egreso_extra',
                    subcategoria: 'ajuste_saldo',
                    descripcion: `Ajuste de saldo: ${motivo}`,
                    monto: montoMovimiento,
                    moneda: cuenta.moneda,
                    fechaMovimiento: new Date(),
                    fechaValor: new Date(),
                    numeroOperacion: `ADJ-${Date.now()}`,
                    saldoAnterior: saldoAnterior,
                    saldoPosterior: nuevoSaldo,
                    estado: 'procesado',
                    responsable: {
                        nombre: operador,
                        email: `${operador}@sistema.com`
                    },
                    userId: cuenta.userId,
                    creatorId: cuenta.userId,
                    creatorName: operador,
                    creatorEmail: `${operador}@sistema.com`,
                    creatorRole: 'admin',
                    observaciones: `Ajuste manual de saldo por: ${motivo}`
                });
                
                await movimiento.save();
            }
            
            console.log('✅ Saldo ajustado exitosamente');
            return {
                cuenta: cuenta,
                ajuste: {
                    saldoAnterior,
                    saldoNuevo: nuevoSaldo,
                    diferencia,
                    motivo
                }
            };
            
        } catch (error) {
            console.error('❌ Error ajustando saldo:', error);
            throw new Error(`Error al ajustar saldo: ${error.message}`);
        }
    }
    
    /**
     * Obtener movimientos de una cuenta
     */
    static async obtenerMovimientosCuenta(cuentaId, filtros = {}, limite = 50, pagina = 1) {
        try {
            console.log(`📊 Obteniendo movimientos de cuenta ${cuentaId}`);
            
            const skip = (pagina - 1) * limite;
            
            let query = { cuentaBancariaId: cuentaId };
            
            // Aplicar filtros
            if (filtros.fechaInicio && filtros.fechaFin) {
                query.fechaMovimiento = {
                    $gte: new Date(filtros.fechaInicio),
                    $lte: new Date(filtros.fechaFin)
                };
            }
            
            if (filtros.tipo) {
                query.tipo = filtros.tipo;
            }
            
            const [movimientos, total] = await Promise.all([
                MovimientoBancario.find(query)
                    .populate('cuentaBancariaId', 'nombre banco')
                    .populate('cuentaDestinoId', 'nombre banco')
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
            throw new Error(`Error al obtener movimientos de cuenta: ${error.message}`);
        }
    }
    
    /**
     * Obtener histórico de saldos
     */
    static async obtenerHistoricoSaldos(cuentaId, fechaInicio, fechaFin, intervalo = 'dia') {
        try {
            console.log(`📈 Obteniendo histórico de saldos para cuenta ${cuentaId}`);
            
            const cuenta = await CuentaBancaria.findById(cuentaId);
            if (!cuenta) {
                throw new Error('Cuenta bancaria no encontrada');
            }
            
            const inicio = new Date(fechaInicio);
            const fin = new Date(fechaFin);
            
            // Obtener todos los movimientos del período
            const movimientos = await MovimientoBancario.find({
                cuentaBancariaId: cuentaId,
                fechaMovimiento: { $gte: inicio, $lte: fin },
                estado: 'procesado'
            }).sort({ fechaMovimiento: 1 });
            
            // Agrupar por intervalo
            const historico = [];
            let saldoActual = cuenta.saldoInicial;
            
            // Obtener saldo al inicio del período
            const movimientosAnteriores = await MovimientoBancario.find({
                cuentaBancariaId: cuentaId,
                fechaMovimiento: { $lt: inicio },
                estado: 'procesado'
            }).sort({ fechaMovimiento: 1 });
            
            movimientosAnteriores.forEach(mov => {
                if (mov.tipo === 'ingreso' || mov.tipo === 'transferencia_entrada') {
                    saldoActual += mov.monto;
                } else {
                    saldoActual -= mov.monto;
                }
            });
            
            // Generar puntos del histórico
            const fechaActual = new Date(inicio);
            let indiceMov = 0;
            
            while (fechaActual <= fin) {
                // Procesar movimientos del día/período actual
                while (indiceMov < movimientos.length && 
                       this.esMismoIntervalo(movimientos[indiceMov].fechaMovimiento, fechaActual, intervalo)) {
                    
                    const mov = movimientos[indiceMov];
                    if (mov.tipo === 'ingreso' || mov.tipo === 'transferencia_entrada') {
                        saldoActual += mov.monto;
                    } else {
                        saldoActual -= mov.monto;
                    }
                    indiceMov++;
                }
                
                historico.push({
                    fecha: new Date(fechaActual).toISOString(),
                    saldo: saldoActual,
                    intervalo: intervalo
                });
                
                // Avanzar al siguiente intervalo
                this.avanzarIntervalo(fechaActual, intervalo);
            }
            
            console.log(`✅ Histórico generado con ${historico.length} puntos`);
            return historico;
            
        } catch (error) {
            console.error('❌ Error obteniendo histórico:', error);
            throw new Error(`Error al obtener histórico de saldos: ${error.message}`);
        }
    }
    
    /**
     * Obtener resumen de cuentas
     */
    static async obtenerResumenCuentas(userId) {
        try {
            console.log('📊 Obteniendo resumen de cuentas para usuario:', userId);
            
            const cuentas = await CuentaBancaria.obtenerPorUsuario(userId);
            const estadisticas = await CuentaBancaria.obtenerEstadisticas(userId);
            
            // Agrupar por banco
            const agrupadoPorBanco = {};
            cuentas.forEach(cuenta => {
                if (!agrupadoPorBanco[cuenta.banco]) {
                    agrupadoPorBanco[cuenta.banco] = {
                        banco: cuenta.banco,
                        totalCuentas: 0,
                        saldoTotal: 0,
                        cuentas: []
                    };
                }
                
                agrupadoPorBanco[cuenta.banco].totalCuentas++;
                agrupadoPorBanco[cuenta.banco].saldoTotal += cuenta.saldoActual;
                agrupadoPorBanco[cuenta.banco].cuentas.push({
                    id: cuenta._id,
                    nombre: cuenta.nombre,
                    tipoCuenta: cuenta.tipoCuenta,
                    saldo: cuenta.saldoActual,
                    moneda: cuenta.moneda
                });
            });
            
            // Agrupar por moneda
            const agrupadoPorMoneda = {};
            cuentas.forEach(cuenta => {
                if (!agruladoPorMoneda[cuenta.moneda]) {
                    agrupadoPorMoneda[cuenta.moneda] = {
                        moneda: cuenta.moneda,
                        totalCuentas: 0,
                        saldoTotal: 0
                    };
                }
                
                agrupadoPorMoneda[cuenta.moneda].totalCuentas++;
                agrupadoPorMoneda[cuenta.moneda].saldoTotal += cuenta.saldoActual;
            });
            
            const resumen = {
                estadisticas,
                distribucion: {
                    porBanco: Object.values(agrupadoPorBanco),
                    porMoneda: Object.values(agrupadoPorMoneda),
                    porTipo: await this.obtenerDistribucionPorTipo(userId)
                },
                alertas: await this.obtenerAlertasCuentas(userId),
                generadoEl: new Date().toISOString()
            };
            
            console.log('✅ Resumen de cuentas generado exitosamente');
            return resumen;
            
        } catch (error) {
            console.error('❌ Error obteniendo resumen:', error);
            throw new Error(`Error al obtener resumen de cuentas: ${error.message}`);
        }
    }
    
    /**
     * Obtener estadísticas de cuentas
     */
    static async obtenerEstadisticas(userId) {
        try {
            console.log('📈 Obteniendo estadísticas de cuentas bancarias');
            
            const estadisticas = await CuentaBancaria.obtenerEstadisticas(userId);
            
            // Agregar estadísticas adicionales
            const cuentas = await CuentaBancaria.obtenerPorUsuario(userId, null);
            
            const estadisticasDetalladas = {
                ...estadisticas,
                distribucionPorTipo: await this.calcularDistribucionPorTipo(cuentas),
                promedioSaldos: await this.calcularPromedioSaldos(cuentas),
                cuentaConMayorSaldo: await this.obtenerCuentaConMayorSaldo(cuentas),
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
     * Verificar si número de cuenta existe
     */
    static async verificarNumeroCuentaExiste(numeroCuenta, userId, excluirId = null) {
        try {
            console.log('🔍 Verificando número de cuenta:', numeroCuenta);
            
            let query = {
                userId,
                numeroCuenta
            };
            
            if (excluirId) {
                query._id = { $ne: excluirId };
            }
            
            const cuenta = await CuentaBancaria.findOne(query);
            return !!cuenta;
            
        } catch (error) {
            console.error('❌ Error verificando número de cuenta:', error);
            throw new Error(`Error al verificar número de cuenta: ${error.message}`);
        }
    }
    
    /**
     * Obtener bancos disponibles
     */
    static obtenerBancosDisponibles() {
        return [
            { codigo: 'BCP', nombre: 'Banco de Crédito del Perú', pais: 'PE' },
            { codigo: 'BBVA', nombre: 'BBVA Continental', pais: 'PE' },
            { codigo: 'SCOTIABANK', nombre: 'Scotiabank Perú', pais: 'PE' },
            { codigo: 'INTERBANK', nombre: 'Interbank', pais: 'PE' },
            { codigo: 'BIF', nombre: 'Banco Interamericano de Finanzas', pais: 'PE' },
            { codigo: 'BANBIF', nombre: 'BanBif', pais: 'PE' },
            { codigo: 'CITIBANK', nombre: 'Citibank', pais: 'PE' },
            { codigo: 'PICHINCHA', nombre: 'Banco Pichincha', pais: 'PE' },
            { codigo: 'SANTANDER', nombre: 'Banco Santander', pais: 'PE' },
            { codigo: 'FALABELLA', nombre: 'Banco Falabella', pais: 'PE' },
            { codigo: 'RIPLEY', nombre: 'Banco Ripley', pais: 'PE' },
            { codigo: 'EFECTIVO', nombre: 'Efectivo', pais: 'PE' },
            { codigo: 'OTRO', nombre: 'Otro Banco', pais: 'PE' }
        ];
    }
    
    /**
     * Obtener tipos de cuenta disponibles
     */
    static obtenerTiposCuentaDisponibles() {
        return [
            { codigo: 'ahorro', nombre: 'Cuenta de Ahorros', descripcion: 'Cuenta básica de ahorros' },
            { codigo: 'corriente', nombre: 'Cuenta Corriente', descripcion: 'Cuenta para operaciones comerciales' },
            { codigo: 'plazo_fijo', nombre: 'Depósito a Plazo Fijo', descripcion: 'Inversión a plazo determinado' },
            { codigo: 'inversión', nombre: 'Cuenta de Inversión', descripcion: 'Cuenta para inversiones financieras' },
            { codigo: 'efectivo', nombre: 'Efectivo', descripcion: 'Dinero en efectivo físico' }
        ];
    }
    
    // ==================== MÉTODOS AUXILIARES ====================
    
    static async registrarMovimientoInicial(cuenta, userData) {
        const movimiento = new MovimientoBancario({
            cuentaBancariaId: cuenta._id,
            tipo: 'ingreso',
            categoria: 'ingreso_extra',
            subcategoria: 'saldo_inicial',
            descripcion: 'Saldo inicial de la cuenta',
            monto: cuenta.saldoInicial,
            moneda: cuenta.moneda,
            fechaMovimiento: cuenta.fechaApertura,
            fechaValor: cuenta.fechaApertura,
            numeroOperacion: `INICIAL-${cuenta.codigo}`,
            saldoAnterior: 0,
            saldoPosterior: cuenta.saldoInicial,
            estado: 'procesado',
            responsable: {
                nombre: userData.creatorName,
                email: userData.creatorEmail
            },
            ...userData,
            observaciones: 'Movimiento automático por apertura de cuenta'
        });
        
        await movimiento.save();
    }
    
    static esMismoIntervalo(fecha1, fecha2, intervalo) {
        const f1 = new Date(fecha1);
        const f2 = new Date(fecha2);
        
        switch (intervalo) {
            case 'dia':
                return f1.toDateString() === f2.toDateString();
            case 'semana':
                const inicioSemana1 = new Date(f1);
                inicioSemana1.setDate(f1.getDate() - f1.getDay());
                const inicioSemana2 = new Date(f2);
                inicioSemana2.setDate(f2.getDate() - f2.getDay());
                return inicioSemana1.toDateString() === inicioSemana2.toDateString();
            case 'mes':
                return f1.getFullYear() === f2.getFullYear() && f1.getMonth() === f2.getMonth();
            default:
                return false;
        }
    }
    
    static avanzarIntervalo(fecha, intervalo) {
        switch (intervalo) {
            case 'dia':
                fecha.setDate(fecha.getDate() + 1);
                break;
            case 'semana':
                fecha.setDate(fecha.getDate() + 7);
                break;
            case 'mes':
                fecha.setMonth(fecha.getMonth() + 1);
                break;
        }
    }
    
    static async obtenerDistribucionPorTipo(userId) {
        const pipeline = [
            { $match: { userId } },
            {
                $group: {
                    _id: '$tipoCuenta',
                    total: { $sum: 1 },
                    saldoTotal: { $sum: '$saldoActual' }
                }
            }
        ];
        
        return await CuentaBancaria.aggregate(pipeline);
    }
    
    static async calcularDistribucionPorTipo(cuentas) {
        const distribucion = {};
        
        cuentas.forEach(cuenta => {
            if (!distribucion[cuenta.tipoCuenta]) {
                distribucion[cuenta.tipoCuenta] = {
                    tipo: cuenta.tipoCuenta,
                    cantidad: 0,
                    saldoTotal: 0
                };
            }
            
            distribucion[cuenta.tipoCuenta].cantidad++;
            distribucion[cuenta.tipoCuenta].saldoTotal += cuenta.saldoActual;
        });
        
        return Object.values(distribucion);
    }
    
    static async calcularPromedioSaldos(cuentas) {
        if (cuentas.length === 0) return 0;
        
        const saldoTotal = cuentas.reduce((sum, cuenta) => sum + cuenta.saldoActual, 0);
        return saldoTotal / cuentas.length;
    }
    
    static async obtenerCuentaConMayorSaldo(cuentas) {
        if (cuentas.length === 0) return null;
        
        return cuentas.reduce((max, cuenta) => 
            cuenta.saldoActual > max.saldoActual ? cuenta : max
        );
    }
    
    static async obtenerAlertasCuentas(userId) {
        const cuentasBajoSaldo = await CuentaBancaria.find({
            userId,
            activa: true,
            $expr: {
                $lt: ['$saldoActual', '$alertas.saldoMinimo']
            }
        });
        
        return cuentasBajoSaldo.map(cuenta => ({
            tipo: 'saldo_bajo',
            cuentaId: cuenta._id,
            cuenta: cuenta.nombre,
            saldoActual: cuenta.saldoActual,
            saldoMinimo: cuenta.alertas.saldoMinimo,
            moneda: cuenta.moneda
        }));
    }
}

module.exports = CuentasBancariasService;
