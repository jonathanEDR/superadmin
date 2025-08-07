const Prestamo = require('../../models/finanzas/Prestamo');
const PagoFinanciamiento = require('../../models/finanzas/PagoFinanciamiento');
const Garantia = require('../../models/finanzas/Garantia');
const CuentaBancaria = require('../../models/finanzas/CuentaBancaria');
const MovimientoBancario = require('../../models/finanzas/MovimientoBancario');
const MovimientosCajaFinanzasService = require('./movimientosCajaFinanzasService');

class PrestamosService {
    /**
     * Obtener préstamos con filtros
     */
    static async obtenerPrestamos(filtros = {}, limite = 50, pagina = 1) {
        try {
            console.log('🔍 Obteniendo préstamos con filtros:', filtros);
            
            const skip = (pagina - 1) * limite;
            let query = {};
            
            // Filtros básicos
            if (filtros.userId) query.userId = filtros.userId;
            if (filtros.estado) {
                if (Array.isArray(filtros.estado)) {
                    query.estado = { $in: filtros.estado };
                } else {
                    query.estado = filtros.estado;
                }
            }
            if (filtros.tipo) query.tipo = filtros.tipo;
            if (filtros.entidad) {
                query['entidadFinanciera.nombre'] = { $regex: filtros.entidad, $options: 'i' };
            }
            
            // Filtro por rango de fechas
            if (filtros.fechaInicio || filtros.fechaFin) {
                query.fechaSolicitud = {};
                if (filtros.fechaInicio) {
                    query.fechaSolicitud.$gte = new Date(filtros.fechaInicio);
                }
                if (filtros.fechaFin) {
                    query.fechaSolicitud.$lte = new Date(filtros.fechaFin);
                }
            }
            
            // Filtro por rango de montos
            if (filtros.montoMin || filtros.montoMax) {
                query.montoSolicitado = {};
                if (filtros.montoMin) {
                    query.montoSolicitado.$gte = parseFloat(filtros.montoMin);
                }
                if (filtros.montoMax) {
                    query.montoSolicitado.$lte = parseFloat(filtros.montoMax);
                }
            }
            
            // Búsqueda por texto
            if (filtros.buscar) {
                query.$or = [
                    { 'prestatario.nombre': { $regex: filtros.buscar, $options: 'i' } },
                    { 'prestatario.documento.numero': { $regex: filtros.buscar, $options: 'i' } },
                    { 'entidadFinanciera.nombre': { $regex: filtros.buscar, $options: 'i' } },
                    { descripcion: { $regex: filtros.buscar, $options: 'i' } }
                ];
            }
            
            const [prestamos, total] = await Promise.all([
                Prestamo.find(query)
                    .populate('cuentaDesembolso', 'nombre banco')
                    .populate('cuentaPago', 'nombre banco')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limite),
                Prestamo.countDocuments(query)
            ]);
            
            console.log(`✅ ${prestamos.length} préstamos obtenidos de ${total} totales`);
            
            return {
                prestamos,
                paginacion: {
                    paginaActual: pagina,
                    totalPaginas: Math.ceil(total / limite),
                    totalRegistros: total,
                    registrosPorPagina: limite
                }
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo préstamos:', error);
            throw new Error(`Error al obtener préstamos: ${error.message}`);
        }
    }
    
    /**
     * Obtener préstamo por ID
     */
    static async obtenerPrestamoPorId(id) {
        try {
            console.log('🔍 Buscando préstamo por ID:', id);
            
            const prestamo = await Prestamo.findById(id)
                .populate('cuentaDesembolso', 'nombre banco tipoCuenta')
                .populate('cuentaPago', 'nombre banco tipoCuenta');
            
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            console.log('✅ Préstamo encontrado:', prestamo.codigo);
            return prestamo;
            
        } catch (error) {
            console.error('❌ Error obteniendo préstamo:', error);
            throw new Error(`Error al obtener préstamo: ${error.message}`);
        }
    }
    
    /**
     * Crear nuevo préstamo
     */
    static async crearPrestamo(datosPrestamo, userData) {
        try {
            console.log('🚀 ============== INICIANDO CREACIÓN DE PRÉSTAMO ==============');
            console.log('➕ Creando nuevo préstamo con datos:', datosPrestamo);
            console.log('👤 Datos del usuario:', userData);
            
            // Validaciones básicas
            if (!datosPrestamo.montoSolicitado || datosPrestamo.montoSolicitado <= 0) {
                throw new Error('El monto solicitado debe ser mayor a cero');
            }
            
            if (!datosPrestamo.tasaInteres || datosPrestamo.tasaInteres <= 0) {
                throw new Error('La tasa de interés debe ser mayor a cero');
            }
            
            if (!datosPrestamo.plazoMeses || datosPrestamo.plazoMeses <= 0) {
                throw new Error('El plazo en meses debe ser mayor a cero');
            }
            
            if (!datosPrestamo.entidadFinanciera?.nombre) {
                throw new Error('La entidad financiera es requerida');
            }
            
            // Auto-completar información del prestatario con datos del usuario logueado
            const prestatarioCompleto = {
                nombre: userData.creatorName || userData.name || 'Usuario del Sistema',
                documento: {
                    tipo: 'DNI', // Por defecto, se puede cambiar después
                    numero: userData.documentNumber || 'No especificado'
                },
                telefono: userData.phone || '',
                email: userData.creatorEmail || userData.email || ''
            };
            
            // Verificar que las cuentas existan si se proporcionan
            if (datosPrestamo.cuentaDesembolso) {
                const cuentaDesembolso = await CuentaBancaria.findById(datosPrestamo.cuentaDesembolso);
                if (!cuentaDesembolso || cuentaDesembolso.userId !== userData.userId) {
                    throw new Error('Cuenta de desembolso no válida');
                }
            }
            
            if (datosPrestamo.cuentaPago) {
                const cuentaPago = await CuentaBancaria.findById(datosPrestamo.cuentaPago);
                if (!cuentaPago || cuentaPago.userId !== userData.userId) {
                    throw new Error('Cuenta de pago no válida');
                }
            }
            
            // Preparar datos completos del préstamo
            const datosCompletos = {
                ...datosPrestamo,
                prestatario: prestatarioCompleto,
                estado: 'aprobado', // 🔧 SIEMPRE crear préstamos aprobados
                montoAprobado: datosPrestamo.montoSolicitado, // 🔧 Aprobar el monto completo
                fechaAprobacion: new Date(), // 🔧 Fecha de aprobación automática
                ...userData
            };
            
            console.log('📋 Datos completos preparados:', JSON.stringify(datosCompletos, null, 2));
            
            // Crear el préstamo
            const prestamo = new Prestamo(datosCompletos);
            
            // Verificación adicional: asegurar que el código se genere
            if (!prestamo.codigo) {
                const timestamp = Date.now().toString().slice(-6);
                prestamo.codigo = `PREST${timestamp}`;
                console.log('🔄 Código manual asignado:', prestamo.codigo);
            }
            
            await prestamo.save();
            console.log('✅ Préstamo creado exitosamente:', prestamo.codigo);
            
            // 🔥 INTEGRACIÓN CON MOVIMIENTOS DE CAJA 🔥
            // Registrar automáticamente el ingreso en caja
            try {
                console.log('💰 ============== INTEGRACIÓN CON MOVIMIENTOS DE CAJA ==============');
                console.log('💰 Iniciando registro automático en movimientos de caja...');
                console.log('🔍 Préstamo a registrar:', {
                    id: prestamo._id,
                    codigo: prestamo.codigo,
                    monto: prestamo.montoAprobado,
                    tipo: prestamo.tipo
                });
                console.log('🔍 Datos de usuario para movimiento:', userData);
                
                const movimientoCaja = await MovimientosCajaFinanzasService.registrarIngresoPorPrestamo(
                    prestamo,
                    userData
                );
                
                console.log('📊 Resultado del registro en caja:', movimientoCaja);
                
                if (movimientoCaja) {
                    // Actualizar el préstamo con la referencia al movimiento de caja
                    prestamo.movimientoCajaId = movimientoCaja._id;
                    await prestamo.save();
                    
                    console.log('✅ ============== INTEGRACIÓN EXITOSA ==============');
                    console.log(`   - Préstamo: ${prestamo.codigo}`);
                    console.log(`   - Movimiento Caja: ${movimientoCaja.codigo}`);
                    console.log(`   - Monto: ${prestamo.montoAprobado}`);
                    console.log('=========================================================');
                } else {
                    console.log('⚠️ ============== ADVERTENCIA ==============');
                    console.log('⚠️ El movimiento de caja no se pudo crear, pero el préstamo se creó correctamente');
                    console.log('==========================================');
                }
                
            } catch (errorMovimiento) {
                console.error('❌ ============== ERROR EN INTEGRACIÓN ==============');
                console.error('❌ Error en integración con movimientos de caja:', errorMovimiento);
                console.error('❌ Stack trace:', errorMovimiento.stack);
                console.log('✅ El préstamo se creó correctamente, pero hay que revisar el movimiento de caja');
                console.log('================================================');
                // No lanzamos error para que no falle la creación del préstamo
            }
            
            return prestamo;
            
        } catch (error) {
            console.error('❌ Error creando préstamo:', error);
            throw new Error(`Error al crear préstamo: ${error.message}`);
        }
    }
    
    /**
     * Actualizar préstamo
     */
    static async actualizarPrestamo(id, datosActualizacion) {
        try {
            console.log('✏️ Actualizando préstamo:', id);
            
            const prestamo = await Prestamo.findById(id);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            // Validar que ciertos campos no se puedan modificar si el préstamo está desembolsado
            if (['desembolsado', 'activo'].includes(prestamo.estado)) {
                const camposProtegidos = ['montoAprobado', 'tasaInteres', 'plazoMeses'];
                camposProtegidos.forEach(campo => {
                    if (datosActualizacion.hasOwnProperty(campo)) {
                        delete datosActualizacion[campo];
                    }
                });
            }
            
            // No permitir cambiar ciertos campos críticos
            const camposNoModificables = ['codigo', 'userId', 'createdAt'];
            camposNoModificables.forEach(campo => {
                if (datosActualizacion.hasOwnProperty(campo)) {
                    delete datosActualizacion[campo];
                }
            });
            
            // Actualizar préstamo
            Object.assign(prestamo, datosActualizacion);
            await prestamo.save();
            
            console.log('✅ Préstamo actualizado exitosamente');
            return prestamo;
            
        } catch (error) {
            console.error('❌ Error actualizando préstamo:', error);
            throw new Error(`Error al actualizar préstamo: ${error.message}`);
        }
    }
    
    /**
     * Eliminar préstamo
     */
    static async eliminarPrestamo(id) {
        try {
            console.log('🗑️ Eliminando préstamo:', id);
            
            const prestamo = await Prestamo.findById(id);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            // Verificar que se pueda eliminar
            if (['desembolsado', 'activo'].includes(prestamo.estado)) {
                throw new Error('No se puede eliminar un préstamo desembolsado o activo');
            }
            
            // Verificar que no tenga pagos asociados
            const pagosAsociados = await PagoFinanciamiento.countDocuments({ prestamoId: id });
            if (pagosAsociados > 0) {
                throw new Error('No se puede eliminar un préstamo con pagos asociados');
            }
            
            // Eliminar garantías asociadas
            await Garantia.deleteMany({ prestamoId: id });
            
            // Eliminar préstamo
            await Prestamo.findByIdAndDelete(id);
            
            console.log('✅ Préstamo eliminado exitosamente');
            return { id, mensaje: 'Préstamo eliminado exitosamente' };
            
        } catch (error) {
            console.error('❌ Error eliminando préstamo:', error);
            throw new Error(`Error al eliminar préstamo: ${error.message}`);
        }
    }
    
    /**
     * Aprobar préstamo
     */
    static async aprobarPrestamo(id, montoAprobado, observaciones = '') {
        try {
            console.log(`✅ Aprobando préstamo ${id} por monto: ${montoAprobado}`);
            
            const prestamo = await Prestamo.findById(id);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            if (prestamo.estado !== 'solicitado') {
                throw new Error('Solo se pueden aprobar préstamos en estado solicitado');
            }
            
            if (!montoAprobado || montoAprobado <= 0) {
                throw new Error('El monto aprobado debe ser mayor a cero');
            }
            
            if (montoAprobado > prestamo.montoSolicitado) {
                throw new Error('El monto aprobado no puede ser mayor al solicitado');
            }
            
            await prestamo.aprobar(montoAprobado);
            
            if (observaciones) {
                prestamo.observaciones = (prestamo.observaciones || '') + `\nAprobación: ${observaciones}`;
                await prestamo.save();
            }
            
            console.log('✅ Préstamo aprobado exitosamente');
            return prestamo;
            
        } catch (error) {
            console.error('❌ Error aprobando préstamo:', error);
            throw new Error(`Error al aprobar préstamo: ${error.message}`);
        }
    }
    
    /**
     * Desembolsar préstamo
     */
    static async desembolsarPrestamo(id, montoDesembolsado, cuentaDesembolsoId, observaciones = '', userData) {
        try {
            console.log(`💰 Desembolsando préstamo ${id} por monto: ${montoDesembolsado}`);
            
            const prestamo = await Prestamo.findById(id);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            if (prestamo.estado !== 'aprobado') {
                throw new Error('Solo se pueden desembolsar préstamos aprobados');
            }
            
            if (!montoDesembolsado || montoDesembolsado <= 0) {
                throw new Error('El monto a desembolsar debe ser mayor a cero');
            }
            
            if (montoDesembolsado > prestamo.montoAprobado) {
                throw new Error('El monto a desembolsar no puede ser mayor al aprobado');
            }
            
            // Verificar cuenta de desembolso
            const cuentaDesembolso = await CuentaBancaria.findById(cuentaDesembolsoId);
            if (!cuentaDesembolso) {
                throw new Error('Cuenta de desembolso no encontrada');
            }
            
            if (!cuentaDesembolso.activa) {
                throw new Error('La cuenta de desembolso debe estar activa');
            }
            
            // Actualizar préstamo
            prestamo.cuentaDesembolso = cuentaDesembolsoId;
            await prestamo.desembolsar(montoDesembolsado);
            
            // Registrar movimiento bancario
            const movimiento = new MovimientoBancario({
                cuentaBancariaId: cuentaDesembolsoId,
                tipo: 'ingreso',
                categoria: 'ingreso_extra',
                subcategoria: 'desembolso_prestamo',
                descripcion: `Desembolso de préstamo ${prestamo.codigo} - ${prestamo.entidadFinanciera.nombre}`,
                monto: montoDesembolsado,
                moneda: prestamo.moneda,
                fechaMovimiento: new Date(),
                fechaValor: new Date(),
                numeroOperacion: `DESEMB-${prestamo.codigo}`,
                saldoAnterior: cuentaDesembolso.saldoActual,
                saldoPosterior: cuentaDesembolso.saldoActual + montoDesembolsado,
                estado: 'procesado',
                responsable: {
                    nombre: userData.creatorName,
                    email: userData.creatorEmail
                },
                observaciones: `Desembolso automático de préstamo. ${observaciones}`,
                ...userData
            });
            
            // Actualizar saldo de la cuenta
            cuentaDesembolso.saldoActual += montoDesembolsado;
            cuentaDesembolso.fechaUltimoMovimiento = new Date();
            
            // Guardar cambios
            await movimiento.save();
            await cuentaDesembolso.save();
            
            // Generar cronograma de pagos
            await this.generarCronogramaPagos(prestamo._id, userData);
            
            if (observaciones) {
                prestamo.observaciones = (prestamo.observaciones || '') + `\nDesembolso: ${observaciones}`;
                await prestamo.save();
            }
            
            console.log('✅ Préstamo desembolsado exitosamente');
            
            return {
                prestamo,
                movimiento,
                cuentaActualizada: cuentaDesembolso
            };
            
        } catch (error) {
            console.error('❌ Error desembolsando préstamo:', error);
            throw new Error(`Error al desembolsar préstamo: ${error.message}`);
        }
    }
    
    /**
     * Cancelar préstamo
     */
    static async cancelarPrestamo(id, motivo = '') {
        try {
            console.log(`❌ Cancelando préstamo ${id}`);
            
            const prestamo = await Prestamo.findById(id);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            if (['cancelado'].includes(prestamo.estado)) {
                throw new Error('El préstamo ya está cancelado');
            }
            
            if (['activo', 'desembolsado'].includes(prestamo.estado)) {
                throw new Error('No se pueden cancelar préstamos activos o desembolsados');
            }
            
            await prestamo.cancelar(motivo);
            
            console.log('✅ Préstamo cancelado exitosamente');
            return prestamo;
            
        } catch (error) {
            console.error('❌ Error cancelando préstamo:', error);
            throw new Error(`Error al cancelar préstamo: ${error.message}`);
        }
    }
    
    /**
     * Obtener tabla de amortización
     */
    static async obtenerTablaAmortizacion(id) {
        try {
            console.log(`📊 Obteniendo tabla de amortización para préstamo ${id}`);
            
            const prestamo = await Prestamo.findById(id);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            const tabla = prestamo.obtenerTablaAmortizacion();
            
            console.log(`✅ Tabla de amortización generada con ${tabla.length} cuotas`);
            return tabla;
            
        } catch (error) {
            console.error('❌ Error obteniendo tabla de amortización:', error);
            throw new Error(`Error al obtener tabla de amortización: ${error.message}`);
        }
    }
    
    /**
     * Obtener pagos del préstamo
     */
    static async obtenerPagosPrestamo(prestamoId, estado = null, limite = 50, pagina = 1) {
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
     * Obtener garantías del préstamo
     */
    static async obtenerGarantiasPrestamo(prestamoId) {
        try {
            console.log(`🛡️ Obteniendo garantías del préstamo ${prestamoId}`);
            
            const garantias = await Garantia.find({ prestamoId })
                .sort({ createdAt: -1 });
            
            console.log(`✅ ${garantias.length} garantías obtenidas`);
            return garantias;
            
        } catch (error) {
            console.error('❌ Error obteniendo garantías del préstamo:', error);
            throw new Error(`Error al obtener garantías del préstamo: ${error.message}`);
        }
    }
    
    /**
     * Generar cronograma de pagos
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
     * Obtener préstamos vencidos
     */
    static async obtenerPrestamosVencidos(userId) {
        try {
            console.log('⏰ Obteniendo préstamos vencidos');
            
            const prestamosVencidos = await Prestamo.obtenerVencidos(userId);
            
            console.log(`✅ ${prestamosVencidos.length} préstamos vencidos encontrados`);
            return prestamosVencidos;
            
        } catch (error) {
            console.error('❌ Error obteniendo préstamos vencidos:', error);
            throw new Error(`Error al obtener préstamos vencidos: ${error.message}`);
        }
    }
    
    /**
     * Obtener préstamos próximos a vencer
     */
    static async obtenerPrestamosProximosVencer(dias = 30, userId = null) {
        try {
            console.log(`⏰ Obteniendo préstamos próximos a vencer en ${dias} días`);
            
            const prestamosProximos = await Prestamo.obtenerProximosVencer(dias, userId);
            
            console.log(`✅ ${prestamosProximos.length} préstamos próximos a vencer encontrados`);
            return prestamosProximos;
            
        } catch (error) {
            console.error('❌ Error obteniendo préstamos próximos a vencer:', error);
            throw new Error(`Error al obtener préstamos próximos a vencer: ${error.message}`);
        }
    }
    
    /**
     * Obtener estadísticas de préstamos
     */
    static async obtenerEstadisticas(userId) {
        try {
            console.log('📈 Obteniendo estadísticas de préstamos');
            
            const estadisticas = await Prestamo.obtenerEstadisticas(userId);
            
            // Agregar estadísticas adicionales
            const prestamos = await Prestamo.find({ userId });
            
            const estadisticasDetalladas = {
                ...estadisticas,
                distribucionPorTipo: await this.calcularDistribucionPorTipo(prestamos),
                distribucionPorEntidad: await this.calcularDistribucionPorEntidad(prestamos),
                promedioMonto: await this.calcularPromedioMonto(prestamos),
                prestamoMayorMonto: await this.obtenerPrestamoMayorMonto(prestamos),
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
     * Obtener resumen de préstamos
     */
    static async obtenerResumenPrestamos(userId) {
        try {
            console.log('📊 Obteniendo resumen de préstamos');
            
            const estadisticas = await this.obtenerEstadisticas(userId);
            const prestamosActivos = await Prestamo.obtenerPorUsuario(userId, ['activo', 'desembolsado']);
            const proximosVencer = await this.obtenerPrestamosProximosVencer(30, userId);
            const vencidos = await this.obtenerPrestamosVencidos(userId);
            
            const resumen = {
                estadisticas,
                prestamosActivos: prestamosActivos.slice(0, 5), // Últimos 5
                proximosVencer,
                vencidos,
                alertas: await this.obtenerAlertasPrestamos(userId),
                generadoEl: new Date().toISOString()
            };
            
            console.log('✅ Resumen de préstamos generado exitosamente');
            return resumen;
            
        } catch (error) {
            console.error('❌ Error obteniendo resumen:', error);
            throw new Error(`Error al obtener resumen de préstamos: ${error.message}`);
        }
    }
    
    /**
     * Calcular cuota mensual
     */
    static calcularCuotaMensual(monto, tasaInteres, plazoMeses) {
        try {
            if (!monto || !tasaInteres || !plazoMeses) {
                throw new Error('Monto, tasa de interés y plazo son requeridos');
            }
            
            const capital = parseFloat(monto);
            const tasaMensual = parseFloat(tasaInteres) / 100 / 12;
            const numeroCuotas = parseInt(plazoMeses);
            
            if (tasaMensual === 0) {
                return capital / numeroCuotas;
            }
            
            const cuota = capital * (tasaMensual * Math.pow(1 + tasaMensual, numeroCuotas)) / 
                         (Math.pow(1 + tasaMensual, numeroCuotas) - 1);
            
            return Math.round(cuota * 100) / 100;
            
        } catch (error) {
            console.error('❌ Error calculando cuota:', error);
            throw new Error(`Error al calcular cuota mensual: ${error.message}`);
        }
    }
    
    /**
     * Obtener entidades financieras
     */
    static obtenerEntidadesFinancieras() {
        return [
            { codigo: 'BCP', nombre: 'Banco de Crédito del Perú', tipo: 'banco' },
            { codigo: 'BBVA', nombre: 'BBVA Continental', tipo: 'banco' },
            { codigo: 'SCOTIABANK', nombre: 'Scotiabank Perú', tipo: 'banco' },
            { codigo: 'INTERBANK', nombre: 'Interbank', tipo: 'banco' },
            { codigo: 'BIF', nombre: 'Banco Interamericano de Finanzas', tipo: 'banco' },
            { codigo: 'BANBIF', nombre: 'BanBif', tipo: 'banco' },
            { codigo: 'CITIBANK', nombre: 'Citibank', tipo: 'banco' },
            { codigo: 'PICHINCHA', nombre: 'Banco Pichincha', tipo: 'banco' },
            { codigo: 'SANTANDER', nombre: 'Banco Santander', tipo: 'banco' },
            { codigo: 'FALABELLA', nombre: 'Banco Falabella', tipo: 'banco' },
            { codigo: 'RIPLEY', nombre: 'Banco Ripley', tipo: 'banco' },
            { codigo: 'COMPARTAMOS', nombre: 'Compartamos Financiera', tipo: 'financiera' },
            { codigo: 'CREDISCOTIA', nombre: 'CrediScotia', tipo: 'financiera' },
            { codigo: 'MIBANCO', nombre: 'Mibanco', tipo: 'banco' },
            { codigo: 'COOPERATIVA', nombre: 'Cooperativa de Ahorros y Créditos', tipo: 'cooperativa' },
            { codigo: 'PRESTAMISTA', nombre: 'Prestamista Particular', tipo: 'prestamista' },
            { codigo: 'OTRO', nombre: 'Otra Entidad', tipo: 'otro' }
        ];
    }
    
    /**
     * Obtener tipos de préstamo
     */
    static obtenerTiposPrestamo() {
        return [
            { codigo: 'personal', nombre: 'Préstamo Personal', descripcion: 'Préstamo para gastos personales' },
            { codigo: 'hipotecario', nombre: 'Préstamo Hipotecario', descripcion: 'Préstamo para compra de vivienda' },
            { codigo: 'vehicular', nombre: 'Préstamo Vehicular', descripcion: 'Préstamo para compra de vehículo' },
            { codigo: 'comercial', nombre: 'Préstamo Comercial', descripcion: 'Préstamo para actividades comerciales' },
            { codigo: 'microempresa', nombre: 'Préstamo Microempresa', descripcion: 'Préstamo para microempresas' },
            { codigo: 'capital_trabajo', nombre: 'Capital de Trabajo', descripcion: 'Préstamo para capital de trabajo' },
            { codigo: 'inversion', nombre: 'Préstamo de Inversión', descripcion: 'Préstamo para proyectos de inversión' }
        ];
    }
    
    // ==================== MÉTODOS AUXILIARES ====================
    
    static async calcularDistribucionPorTipo(prestamos) {
        const distribucion = {};
        
        prestamos.forEach(prestamo => {
            if (!distribucion[prestamo.tipo]) {
                distribucion[prestamo.tipo] = {
                    tipo: prestamo.tipo,
                    cantidad: 0,
                    montoTotal: 0
                };
            }
            
            distribucion[prestamo.tipo].cantidad++;
            distribucion[prestamo.tipo].montoTotal += prestamo.montoAprobado || prestamo.montoSolicitado;
        });
        
        return Object.values(distribucion);
    }
    
    static async calcularDistribucionPorEntidad(prestamos) {
        const distribucion = {};
        
        prestamos.forEach(prestamo => {
            const entidad = prestamo.entidadFinanciera.nombre;
            if (!distribucion[entidad]) {
                distribucion[entidad] = {
                    entidad: entidad,
                    cantidad: 0,
                    montoTotal: 0
                };
            }
            
            distribucion[entidad].cantidad++;
            distribucion[entidad].montoTotal += prestamo.montoAprobado || prestamo.montoSolicitado;
        });
        
        return Object.values(distribucion);
    }
    
    static async calcularPromedioMonto(prestamos) {
        if (prestamos.length === 0) return 0;
        
        const montoTotal = prestamos.reduce((sum, prestamo) => 
            sum + (prestamo.montoAprobado || prestamo.montoSolicitado), 0
        );
        return montoTotal / prestamos.length;
    }
    
    static async obtenerPrestamoMayorMonto(prestamos) {
        if (prestamos.length === 0) return null;
        
        return prestamos.reduce((max, prestamo) => {
            const montoActual = prestamo.montoAprobado || prestamo.montoSolicitado;
            const montoMax = max.montoAprobado || max.montoSolicitado;
            return montoActual > montoMax ? prestamo : max;
        });
    }
    
    static async obtenerAlertasPrestamos(userId) {
        const alertas = [];
        
        // Préstamos vencidos
        const vencidos = await this.obtenerPrestamosVencidos(userId);
        if (vencidos.length > 0) {
            alertas.push({
                tipo: 'prestamos_vencidos',
                cantidad: vencidos.length,
                mensaje: `Tienes ${vencidos.length} préstamos vencidos`
            });
        }
        
        // Préstamos próximos a vencer
        const proximosVencer = await this.obtenerPrestamosProximosVencer(7, userId);
        if (proximosVencer.length > 0) {
            alertas.push({
                tipo: 'prestamos_proximos_vencer',
                cantidad: proximosVencer.length,
                mensaje: `Tienes ${proximosVencer.length} préstamos que vencen en los próximos 7 días`
            });
        }
        
        return alertas;
    }
}

module.exports = PrestamosService;
