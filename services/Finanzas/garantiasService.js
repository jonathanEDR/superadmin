const Garantia = require('../../models/finanzas/Garantia');
const Prestamo = require('../../models/finanzas/Prestamo');

class GarantiasService {
    /**
     * Obtener garantías con filtros
     */
    static async obtenerGarantias(filtros = {}, limite = 50, pagina = 1) {
        try {
            console.log('🔍 Obteniendo garantías con filtros:', filtros);
            
            const skip = (pagina - 1) * limite;
            let query = {};
            
            // Filtros básicos
            if (filtros.userId) query.userId = filtros.userId;
            if (filtros.prestamoId) query.prestamoId = filtros.prestamoId;
            if (filtros.tipo) query.tipo = filtros.tipo;
            if (filtros.estado) {
                if (Array.isArray(filtros.estado)) {
                    query.estado = { $in: filtros.estado };
                } else {
                    query.estado = filtros.estado;
                }
            }
            
            // Filtro por rango de valores
            if (filtros.valorMin || filtros.valorMax) {
                query['valores.comercial'] = {};
                if (filtros.valorMin) {
                    query['valores.comercial'].$gte = parseFloat(filtros.valorMin);
                }
                if (filtros.valorMax) {
                    query['valores.comercial'].$lte = parseFloat(filtros.valorMax);
                }
            }
            
            // Búsqueda por texto
            if (filtros.buscar) {
                query.$or = [
                    { descripcion: { $regex: filtros.buscar, $options: 'i' } },
                    { 'bien.nombre': { $regex: filtros.buscar, $options: 'i' } },
                    { 'propietario.nombre': { $regex: filtros.buscar, $options: 'i' } },
                    { 'propietario.documento.numero': { $regex: filtros.buscar, $options: 'i' } }
                ];
            }
            
            const [garantias, total] = await Promise.all([
                Garantia.find(query)
                    .populate('prestamoId', 'codigo entidadFinanciera.nombre prestatario.nombre')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limite),
                Garantia.countDocuments(query)
            ]);
            
            console.log(`✅ ${garantias.length} garantías obtenidas de ${total} totales`);
            
            return {
                garantias,
                paginacion: {
                    paginaActual: pagina,
                    totalPaginas: Math.ceil(total / limite),
                    totalRegistros: total,
                    registrosPorPagina: limite
                }
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo garantías:', error);
            throw new Error(`Error al obtener garantías: ${error.message}`);
        }
    }
    
    /**
     * Obtener garantía por ID
     */
    static async obtenerGarantiaPorId(id) {
        try {
            console.log('🔍 Buscando garantía por ID:', id);
            
            const garantia = await Garantia.findById(id)
                .populate('prestamoId', 'codigo entidadFinanciera prestatario montoAprobado');
            
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            console.log('✅ Garantía encontrada:', garantia.codigo);
            return garantia;
            
        } catch (error) {
            console.error('❌ Error obteniendo garantía:', error);
            throw new Error(`Error al obtener garantía: ${error.message}`);
        }
    }
    
    /**
     * Crear nueva garantía
     */
    static async crearGarantia(datosGarantia, userData) {
        try {
            console.log('➕ Creando nueva garantía:', datosGarantia.descripcion);
            
            // Validaciones básicas
            if (!datosGarantia.prestamoId) {
                throw new Error('El préstamo es requerido');
            }
            
            if (!datosGarantia.tipo) {
                throw new Error('El tipo de garantía es requerido');
            }
            
            if (!datosGarantia.descripcion) {
                throw new Error('La descripción es requerida');
            }
            
            if (!datosGarantia.bien?.nombre) {
                throw new Error('El nombre del bien es requerido');
            }
            
            if (!datosGarantia.valores?.comercial || datosGarantia.valores.comercial <= 0) {
                throw new Error('El valor comercial debe ser mayor a cero');
            }
            
            if (!datosGarantia.propietario?.nombre) {
                throw new Error('El nombre del propietario es requerido');
            }
            
            if (!datosGarantia.propietario?.documento?.numero) {
                throw new Error('El documento del propietario es requerido');
            }
            
            // Verificar que el préstamo existe
            const prestamo = await Prestamo.findById(datosGarantia.prestamoId);
            if (!prestamo) {
                throw new Error('Préstamo no encontrado');
            }
            
            if (prestamo.userId !== userData.userId) {
                throw new Error('No tienes permisos para este préstamo');
            }
            
            // Crear la garantía
            const garantia = new Garantia({
                ...datosGarantia,
                ...userData
            });
            
            await garantia.save();
            
            console.log('✅ Garantía creada exitosamente:', garantia.codigo);
            return garantia;
            
        } catch (error) {
            console.error('❌ Error creando garantía:', error);
            throw new Error(`Error al crear garantía: ${error.message}`);
        }
    }
    
    /**
     * Actualizar garantía
     */
    static async actualizarGarantia(id, datosActualizacion) {
        try {
            console.log('✏️ Actualizando garantía:', id);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            // Validar que ciertos campos no se puedan modificar si está activa o ejecutada
            if (['activa', 'ejecutada'].includes(garantia.estado)) {
                const camposProtegidos = ['prestamoId', 'tipo', 'valores.comercial'];
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
            
            // Actualizar garantía
            Object.assign(garantia, datosActualizacion);
            await garantia.save();
            
            console.log('✅ Garantía actualizada exitosamente');
            return garantia;
            
        } catch (error) {
            console.error('❌ Error actualizando garantía:', error);
            throw new Error(`Error al actualizar garantía: ${error.message}`);
        }
    }
    
    /**
     * Eliminar garantía
     */
    static async eliminarGarantia(id) {
        try {
            console.log('🗑️ Eliminando garantía:', id);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            // Verificar que se pueda eliminar
            if (['activa', 'ejecutada'].includes(garantia.estado)) {
                throw new Error('No se puede eliminar una garantía activa o ejecutada');
            }
            
            await Garantia.findByIdAndDelete(id);
            
            console.log('✅ Garantía eliminada exitosamente');
            return { id, mensaje: 'Garantía eliminada exitosamente' };
            
        } catch (error) {
            console.error('❌ Error eliminando garantía:', error);
            throw new Error(`Error al eliminar garantía: ${error.message}`);
        }
    }
    
    /**
     * Aprobar garantía
     */
    static async aprobarGarantia(id, valorTasacion = null, observaciones = '') {
        try {
            console.log(`✅ Aprobando garantía ${id}`);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            if (garantia.estado !== 'pendiente_evaluacion') {
                throw new Error('Solo se pueden aprobar garantías pendientes de evaluación');
            }
            
            if (valorTasacion && valorTasacion <= 0) {
                throw new Error('El valor de tasación debe ser mayor a cero');
            }
            
            await garantia.aprobar(valorTasacion);
            
            if (observaciones) {
                garantia.observaciones = (garantia.observaciones || '') + `\nAprobación: ${observaciones}`;
                await garantia.save();
            }
            
            console.log('✅ Garantía aprobada exitosamente');
            return garantia;
            
        } catch (error) {
            console.error('❌ Error aprobando garantía:', error);
            throw new Error(`Error al aprobar garantía: ${error.message}`);
        }
    }
    
    /**
     * Rechazar garantía
     */
    static async rechazarGarantia(id, motivo = '') {
        try {
            console.log(`❌ Rechazando garantía ${id}`);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            if (garantia.estado !== 'pendiente_evaluacion') {
                throw new Error('Solo se pueden rechazar garantías pendientes de evaluación');
            }
            
            await garantia.rechazar(motivo);
            
            console.log('✅ Garantía rechazada exitosamente');
            return garantia;
            
        } catch (error) {
            console.error('❌ Error rechazando garantía:', error);
            throw new Error(`Error al rechazar garantía: ${error.message}`);
        }
    }
    
    /**
     * Activar garantía
     */
    static async activarGarantia(id) {
        try {
            console.log(`🔥 Activando garantía ${id}`);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            await garantia.activar();
            
            console.log('✅ Garantía activada exitosamente');
            return garantia;
            
        } catch (error) {
            console.error('❌ Error activando garantía:', error);
            throw new Error(`Error al activar garantía: ${error.message}`);
        }
    }
    
    /**
     * Liberar garantía
     */
    static async liberarGarantia(id, motivo = '') {
        try {
            console.log(`🔓 Liberando garantía ${id}`);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            await garantia.liberar(motivo);
            
            console.log('✅ Garantía liberada exitosamente');
            return garantia;
            
        } catch (error) {
            console.error('❌ Error liberando garantía:', error);
            throw new Error(`Error al liberar garantía: ${error.message}`);
        }
    }
    
    /**
     * Ejecutar garantía
     */
    static async ejecutarGarantia(id, datosEjecucion) {
        try {
            console.log(`⚖️ Ejecutando garantía ${id}`);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            // Validaciones de los datos de ejecución
            if (!datosEjecucion.motivo) {
                throw new Error('El motivo de ejecución es requerido');
            }
            
            if (!datosEjecucion.valorObtenido || datosEjecucion.valorObtenido < 0) {
                throw new Error('El valor obtenido debe ser mayor o igual a cero');
            }
            
            await garantia.ejecutar(datosEjecucion);
            
            console.log('✅ Garantía ejecutada exitosamente');
            return garantia;
            
        } catch (error) {
            console.error('❌ Error ejecutando garantía:', error);
            throw new Error(`Error al ejecutar garantía: ${error.message}`);
        }
    }
    
    /**
     * Calcular cobertura de garantía
     */
    static async calcularCobertura(id, montoCredito = null) {
        try {
            console.log(`📊 Calculando cobertura de garantía ${id}`);
            
            const garantia = await Garantia.findById(id)
                .populate('prestamoId', 'montoAprobado montoSolicitado');
            
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            // Usar el monto del préstamo si no se proporciona
            const monto = montoCredito || 
                         garantia.prestamoId?.montoAprobado || 
                         garantia.prestamoId?.montoSolicitado || 0;
            
            if (monto <= 0) {
                throw new Error('No se puede calcular la cobertura sin un monto de crédito válido');
            }
            
            const cobertura = garantia.calcularCobertura(monto);
            
            console.log('✅ Cobertura calculada exitosamente');
            return cobertura;
            
        } catch (error) {
            console.error('❌ Error calculando cobertura:', error);
            throw new Error(`Error al calcular cobertura: ${error.message}`);
        }
    }
    
    /**
     * Validar documentación de garantía
     */
    static async validarDocumentacion(id) {
        try {
            console.log(`📋 Validando documentación de garantía ${id}`);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            const validacion = garantia.validarDocumentacion();
            
            console.log('✅ Documentación validada exitosamente');
            return validacion;
            
        } catch (error) {
            console.error('❌ Error validando documentación:', error);
            throw new Error(`Error al validar documentación: ${error.message}`);
        }
    }
    
    /**
     * Verificar seguros de garantía
     */
    static async verificarSeguros(id) {
        try {
            console.log(`🛡️ Verificando seguros de garantía ${id}`);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            const verificacion = garantia.verificarSeguros();
            
            console.log('✅ Seguros verificados exitosamente');
            return verificacion;
            
        } catch (error) {
            console.error('❌ Error verificando seguros:', error);
            throw new Error(`Error al verificar seguros: ${error.message}`);
        }
    }
    
    /**
     * Agregar seguro a garantía
     */
    static async agregarSeguro(id, datosSeguro) {
        try {
            console.log(`➕ Agregando seguro a garantía ${id}`);
            
            const garantia = await Garantia.findById(id);
            if (!garantia) {
                throw new Error('Garantía no encontrada');
            }
            
            // Validaciones del seguro
            if (!datosSeguro.compania) {
                throw new Error('La compañía de seguros es requerida');
            }
            
            if (!datosSeguro.numeroPoliza) {
                throw new Error('El número de póliza es requerido');
            }
            
            if (!datosSeguro.fechaVencimiento) {
                throw new Error('La fecha de vencimiento es requerida');
            }
            
            // Verificar que no exista otro seguro con el mismo número de póliza
            const seguroExistente = garantia.seguros.find(s => s.numeroPoliza === datosSeguro.numeroPoliza);
            if (seguroExistente) {
                throw new Error('Ya existe un seguro con este número de póliza');
            }
            
            garantia.seguros.push({
                ...datosSeguro,
                fechaInicio: datosSeguro.fechaInicio || new Date(),
                estado: 'vigente'
            });
            
            await garantia.save();
            
            console.log('✅ Seguro agregado exitosamente');
            return garantia;
            
        } catch (error) {
            console.error('❌ Error agregando seguro:', error);
            throw new Error(`Error al agregar seguro: ${error.message}`);
        }
    }
    
    /**
     * Obtener garantías por préstamo
     */
    static async obtenerGarantiasPorPrestamo(prestamoId) {
        try {
            console.log(`🔍 Obteniendo garantías del préstamo ${prestamoId}`);
            
            const garantias = await Garantia.obtenerPorPrestamo(prestamoId);
            
            console.log(`✅ ${garantias.length} garantías obtenidas`);
            return garantias;
            
        } catch (error) {
            console.error('❌ Error obteniendo garantías del préstamo:', error);
            throw new Error(`Error al obtener garantías del préstamo: ${error.message}`);
        }
    }
    
    /**
     * Obtener garantías próximas a vencer (seguros)
     */
    static async obtenerGarantiasProximasVencer(dias = 30, userId = null) {
        try {
            console.log(`⏰ Obteniendo garantías con seguros próximos a vencer en ${dias} días`);
            
            const garantiasProximas = await Garantia.obtenerProximasVencer(dias, userId);
            
            console.log(`✅ ${garantiasProximas.length} garantías próximas a vencer encontradas`);
            return garantiasProximas;
            
        } catch (error) {
            console.error('❌ Error obteniendo garantías próximas a vencer:', error);
            throw new Error(`Error al obtener garantías próximas a vencer: ${error.message}`);
        }
    }
    
    /**
     * Obtener estadísticas de garantías
     */
    static async obtenerEstadisticas(userId) {
        try {
            console.log('📈 Obteniendo estadísticas de garantías');
            
            const estadisticas = await Garantia.obtenerEstadisticas(userId);
            
            // Agregar estadísticas adicionales
            const garantias = await Garantia.find({ userId });
            
            const estadisticasDetalladas = {
                ...estadisticas,
                promedioCobertura: await this.calcularPromedioCobertura(garantias),
                garantiaMayorValor: await this.obtenerGarantiaMayorValor(garantias),
                distribucionPorUbicacion: await this.calcularDistribucionPorUbicacion(garantias),
                alertasSeguros: await this.obtenerAlertasSeguros(garantias),
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
     * Obtener resumen de garantías
     */
    static async obtenerResumenGarantias(userId) {
        try {
            console.log('📊 Obteniendo resumen de garantías');
            
            const estadisticas = await this.obtenerEstadisticas(userId);
            const garantiasActivas = await Garantia.obtenerPorUsuario(userId, 'activa');
            const proximasVencer = await this.obtenerGarantiasProximasVencer(30, userId);
            
            const resumen = {
                estadisticas,
                garantiasActivas: garantiasActivas.slice(0, 5), // Últimas 5
                proximasVencer,
                alertas: await this.obtenerAlertasGarantias(userId),
                generadoEl: new Date().toISOString()
            };
            
            console.log('✅ Resumen de garantías generado exitosamente');
            return resumen;
            
        } catch (error) {
            console.error('❌ Error obteniendo resumen:', error);
            throw new Error(`Error al obtener resumen de garantías: ${error.message}`);
        }
    }
    
    /**
     * Obtener tipos de garantía disponibles
     */
    static obtenerTiposGarantia() {
        return [
            { codigo: 'hipotecaria', nombre: 'Hipotecaria', descripcion: 'Garantía sobre inmueble' },
            { codigo: 'vehicular', nombre: 'Vehicular', descripcion: 'Garantía sobre vehículo' },
            { codigo: 'fianza_personal', nombre: 'Fianza Personal', descripcion: 'Garantía personal de tercero' },
            { codigo: 'deposito_garantia', nombre: 'Depósito de Garantía', descripcion: 'Depósito en efectivo' },
            { codigo: 'aval_bancario', nombre: 'Aval Bancario', descripcion: 'Garantía bancaria' },
            { codigo: 'prenda', nombre: 'Prenda', descripcion: 'Garantía sobre bien mueble' },
            { codigo: 'warrant', nombre: 'Warrant', descripcion: 'Certificado de depósito' },
            { codigo: 'otra', nombre: 'Otra', descripcion: 'Otro tipo de garantía' }
        ];
    }
    
    /**
     * Obtener estados de garantía disponibles
     */
    static obtenerEstadosGarantia() {
        return [
            { codigo: 'pendiente_evaluacion', nombre: 'Pendiente de Evaluación', descripcion: 'En proceso de evaluación' },
            { codigo: 'aprobada', nombre: 'Aprobada', descripcion: 'Garantía aprobada' },
            { codigo: 'rechazada', nombre: 'Rechazada', descripcion: 'Garantía rechazada' },
            { codigo: 'activa', nombre: 'Activa', descripcion: 'Garantía activa y vigente' },
            { codigo: 'liberada', nombre: 'Liberada', descripcion: 'Garantía liberada' },
            { codigo: 'ejecutada', nombre: 'Ejecutada', descripcion: 'Garantía ejecutada' }
        ];
    }
    
    // ==================== MÉTODOS AUXILIARES ====================
    
    static async calcularPromedioCobertura(garantias) {
        if (garantias.length === 0) return 0;
        
        let totalCobertura = 0;
        let garantiasConPrestamo = 0;
        
        for (const garantia of garantias) {
            if (garantia.prestamoId) {
                const prestamo = await Prestamo.findById(garantia.prestamoId);
                if (prestamo) {
                    const cobertura = garantia.calcularCobertura(prestamo.montoAprobado || prestamo.montoSolicitado);
                    totalCobertura += cobertura.porcentajeCobertura;
                    garantiasConPrestamo++;
                }
            }
        }
        
        return garantiasConPrestamo > 0 ? totalCobertura / garantiasConPrestamo : 0;
    }
    
    static async obtenerGarantiaMayorValor(garantias) {
        if (garantias.length === 0) return null;
        
        return garantias.reduce((max, garantia) => 
            garantia.valores.comercial > max.valores.comercial ? garantia : max
        );
    }
    
    static async calcularDistribucionPorUbicacion(garantias) {
        const distribucion = {};
        
        garantias.forEach(garantia => {
            const ubicacion = garantia.ubicacion?.departamento || 'No especificado';
            if (!distribucion[ubicacion]) {
                distribucion[ubicacion] = {
                    ubicacion: ubicacion,
                    cantidad: 0,
                    valorTotal: 0
                };
            }
            
            distribucion[ubicacion].cantidad++;
            distribucion[ubicacion].valorTotal += garantia.valores.comercial;
        });
        
        return Object.values(distribucion);
    }
    
    static async obtenerAlertasSeguros(garantias) {
        const alertas = [];
        
        garantias.forEach(garantia => {
            const verificacion = garantia.verificarSeguros();
            
            if (verificacion.vencidos.length > 0) {
                alertas.push({
                    tipo: 'seguros_vencidos',
                    garantiaId: garantia._id,
                    cantidad: verificacion.vencidos.length,
                    mensaje: `La garantía ${garantia.codigo} tiene ${verificacion.vencidos.length} seguros vencidos`
                });
            }
            
            if (verificacion.porVencer.length > 0) {
                alertas.push({
                    tipo: 'seguros_por_vencer',
                    garantiaId: garantia._id,
                    cantidad: verificacion.porVencer.length,
                    mensaje: `La garantía ${garantia.codigo} tiene ${verificacion.porVencer.length} seguros próximos a vencer`
                });
            }
        });
        
        return alertas;
    }
    
    static async obtenerAlertasGarantias(userId) {
        const alertas = [];
        
        // Garantías próximas a vencer
        const proximasVencer = await this.obtenerGarantiasProximasVencer(30, userId);
        if (proximasVencer.length > 0) {
            alertas.push({
                tipo: 'garantias_proximas_vencer',
                cantidad: proximasVencer.length,
                mensaje: `Tienes ${proximasVencer.length} garantías con seguros próximos a vencer`
            });
        }
        
        // Garantías sin documentación completa
        const garantias = await Garantia.find({ userId, estado: { $in: ['activa', 'aprobada'] } });
        const sinDocumentacion = garantias.filter(g => {
            const validacion = g.validarDocumentacion();
            return !validacion.completa;
        });
        
        if (sinDocumentacion.length > 0) {
            alertas.push({
                tipo: 'documentacion_incompleta',
                cantidad: sinDocumentacion.length,
                mensaje: `Tienes ${sinDocumentacion.length} garantías con documentación incompleta`
            });
        }
        
        return alertas;
    }
}

module.exports = GarantiasService;
