const CuentaBancaria = require('../../models/finanzas/CuentaBancaria');
const MovimientoBancario = require('../../models/finanzas/MovimientoBancario');
const FlujoCaja = require('../../models/finanzas/FlujoCaja');

class FinanzasService {
    /**
     * Dashboard principal de finanzas
     */
    static async obtenerDashboard(userId, periodo = 'mes') {
        try {
            console.log(`📊 Generando dashboard financiero para usuario: ${userId}, período: ${periodo}`);
            
            // Obtener resumen de cuentas bancarias
            const resumenCuentas = await CuentaBancaria.obtenerEstadisticas(userId);
            
            // Obtener estadísticas de movimientos
            const estadisticasMovimientos = await MovimientoBancario.obtenerEstadisticas(userId, periodo);
            
            // Obtener alertas
            const alertas = await this.obtenerAlertasFinancieras(userId);
            
            // Obtener flujo de caja del período actual
            const ahora = new Date();
            const año = ahora.getFullYear();
            const mes = ahora.getMonth() + 1;
            
            let flujoCajaActual = await FlujoCaja.findOne({
                userId,
                'periodo.año': año,
                'periodo.mes': mes,
                tipoFlujo: 'mensual'
            });
            
            if (!flujoCajaActual) {
                // Generar flujo de caja automáticamente si no existe
                try {
                    flujoCajaActual = await FlujoCaja.generarFlujoPeriodo(userId, año, mes);
                } catch (error) {
                    console.log('⚠️ No se pudo generar flujo de caja automático:', error.message);
                    flujoCajaActual = null;
                }
            }
            
            // Obtener tendencias (últimos 6 meses)
            const tendencias = await this.obtenerTendenciasFinancieras(userId, 6);
            
            const dashboard = {
                resumen: {
                    cuentasBancarias: resumenCuentas,
                    movimientos: estadisticasMovimientos,
                    periodo: periodo
                },
                flujoCajaActual: flujoCajaActual ? {
                    codigo: flujoCajaActual.codigo,
                    ingresoTotal: flujoCajaActual.ingresos.total,
                    egresoTotal: flujoCajaActual.egresos.total,
                    flujoNeto: flujoCajaActual.resultado.flujoNeto,
                    estado: flujoCajaActual.estado
                } : null,
                alertas: alertas.slice(0, 5), // Mostrar solo las 5 más importantes
                tendencias,
                kpis: {
                    liquidez: this.calcularIndicadorLiquidez(resumenCuentas),
                    rentabilidad: await this.calcularRentabilidad(userId, periodo),
                    eficiencia: await this.calcularEficienciaGastos(userId, periodo)
                },
                timestamp: new Date().toISOString()
            };
            
            console.log('✅ Dashboard generado exitosamente');
            return dashboard;
            
        } catch (error) {
            console.error('❌ Error generando dashboard:', error);
            throw new Error(`Error al generar dashboard financiero: ${error.message}`);
        }
    }
    
    /**
     * Resumen financiero consolidado
     */
    static async obtenerResumenFinanciero(userId, año, mes = null) {
        try {
            console.log(`📋 Generando resumen financiero para ${año}${mes ? `-${mes}` : ''}`);
            
            let flujosQuery = {
                userId,
                'periodo.año': año,
                tipoFlujo: 'mensual'
            };
            
            if (mes) {
                flujosQuery['periodo.mes'] = mes;
            }
            
            const flujosCaja = await FlujoCaja.find(flujosQuery)
                .sort({ 'periodo.mes': 1 });
            
            // Calcular totales anuales o mensuales
            const resumen = {
                periodo: mes ? `${año}-${mes.toString().padStart(2, '0')}` : año.toString(),
                ingresos: {
                    ventasDirectas: 0,
                    cobrosClientes: 0,
                    prestamosRecibidos: 0,
                    inversionesRetorno: 0,
                    otros: 0,
                    total: 0
                },
                egresos: {
                    pagosProveedores: 0,
                    pagosPersonal: 0,
                    gastosOperativos: 0,
                    gastosFijos: 0,
                    financiamiento: 0,
                    otros: 0,
                    total: 0
                },
                resultado: {
                    flujoNeto: 0,
                    margenOperativo: 0,
                    crecimiento: 0
                },
                detallesPorMes: []
            };
            
            // Consolidar datos de todos los flujos
            flujosCaja.forEach(flujo => {
                // Ingresos
                resumen.ingresos.ventasDirectas += flujo.ingresos.ventasDirectas;
                resumen.ingresos.cobrosClientes += flujo.ingresos.cobrosClientes;
                resumen.ingresos.prestamosRecibidos += flujo.ingresos.prestamosRecibidos;
                resumen.ingresos.inversionesRetorno += flujo.ingresos.inversionesRetorno;
                resumen.ingresos.otros += flujo.ingresos.interesesGanados + 
                                         flujo.ingresos.devolucionesProveedores + 
                                         flujo.ingresos.ingresosExtra;
                resumen.ingresos.total += flujo.ingresos.total;
                
                // Egresos
                resumen.egresos.pagosProveedores += flujo.egresos.pagosProveedores;
                resumen.egresos.pagosPersonal += flujo.egresos.pagosPersonal;
                resumen.egresos.gastosOperativos += flujo.egresos.gastosOperativos;
                resumen.egresos.gastosFijos += flujo.egresos.serviciosBasicos + 
                                               flujo.egresos.alquiler;
                resumen.egresos.financiamiento += flujo.egresos.pagosPrestamos + 
                                                  flujo.egresos.inversionesRealizadas;
                resumen.egresos.otros += flujo.egresos.transporte + 
                                        flujo.egresos.marketing + 
                                        flujo.egresos.impuestos + 
                                        flujo.egresos.comisionesBancarias + 
                                        flujo.egresos.egresosExtra;
                resumen.egresos.total += flujo.egresos.total;
                
                // Resultado
                resumen.resultado.flujoNeto += flujo.resultado.flujoNeto;
                
                // Detalle por mes
                resumen.detallesPorMes.push({
                    mes: flujo.periodo.mes,
                    codigo: flujo.codigo,
                    ingresos: flujo.ingresos.total,
                    egresos: flujo.egresos.total,
                    flujoNeto: flujo.resultado.flujoNeto,
                    estado: flujo.estado
                });
            });
            
            // Calcular indicadores
            if (resumen.ingresos.total > 0) {
                resumen.resultado.margenOperativo = 
                    ((resumen.resultado.flujoNeto / resumen.ingresos.total) * 100).toFixed(2);
            }
            
            // Calcular crecimiento vs período anterior
            if (mes && mes > 1) {
                const periodoAnterior = await FlujoCaja.findOne({
                    userId,
                    'periodo.año': año,
                    'periodo.mes': mes - 1,
                    tipoFlujo: 'mensual'
                });
                
                if (periodoAnterior && periodoAnterior.ingresos.total > 0) {
                    const crecimiento = ((resumen.ingresos.total - periodoAnterior.ingresos.total) / 
                                       periodoAnterior.ingresos.total) * 100;
                    resumen.resultado.crecimiento = crecimiento.toFixed(2);
                }
            }
            
            console.log('✅ Resumen financiero generado exitosamente');
            return resumen;
            
        } catch (error) {
            console.error('❌ Error generando resumen financiero:', error);
            throw new Error(`Error al generar resumen financiero: ${error.message}`);
        }
    }
    
    /**
     * Estadísticas generales del módulo
     */
    static async obtenerEstadisticasGenerales(userId, periodo = 'año') {
        try {
            console.log(`📈 Obteniendo estadísticas generales para período: ${periodo}`);
            
            const estadisticas = {
                cuentasBancarias: await CuentaBancaria.obtenerEstadisticas(userId),
                movimientos: await MovimientoBancario.obtenerEstadisticas(userId, periodo),
                periodo: periodo,
                generatedAt: new Date().toISOString()
            };
            
            // Agregar estadísticas de flujo de caja
            const ahora = new Date();
            const flujoActual = await FlujoCaja.findOne({
                userId,
                'periodo.año': ahora.getFullYear(),
                'periodo.mes': ahora.getMonth() + 1,
                tipoFlujo: 'mensual'
            });
            
            if (flujoActual) {
                estadisticas.flujoCajaActual = {
                    ingresos: flujoActual.ingresos.total,
                    egresos: flujoActual.egresos.total,
                    flujoNeto: flujoActual.resultado.flujoNeto,
                    estado: flujoActual.estado
                };
            }
            
            console.log('✅ Estadísticas generales obtenidas exitosamente');
            return estadisticas;
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas generales:', error);
            throw new Error(`Error al obtener estadísticas generales: ${error.message}`);
        }
    }
    
    /**
     * KPIs financieros
     */
    static async obtenerKPIsFinancieros(userId, fechaInicio, fechaFin) {
        try {
            console.log(`📊 Calculando KPIs financieros`);
            
            const inicio = fechaInicio ? new Date(fechaInicio) : new Date(new Date().getFullYear(), 0, 1);
            const fin = fechaFin ? new Date(fechaFin) : new Date();
            
            // Obtener movimientos del período
            const movimientos = await MovimientoBancario.obtenerPorPeriodo(inicio, fin, userId);
            
            let totalIngresos = 0;
            let totalEgresos = 0;
            
            movimientos.forEach(mov => {
                if (mov.tipo === 'ingreso' || mov.tipo === 'transferencia_entrada') {
                    totalIngresos += mov.monto;
                } else {
                    totalEgresos += mov.monto;
                }
            });
            
            const kpis = {
                periodo: {
                    inicio: inicio.toISOString().split('T')[0],
                    fin: fin.toISOString().split('T')[0]
                },
                liquidez: {
                    saldoTotal: await this.calcularSaldoTotal(userId),
                    disponibilidadInmediata: await this.calcularDisponibilidadInmediata(userId)
                },
                flujo: {
                    ingresosTotales: totalIngresos,
                    egresosTotales: totalEgresos,
                    flujoNeto: totalIngresos - totalEgresos,
                    margenNeto: totalIngresos > 0 ? ((totalIngresos - totalEgresos) / totalIngresos * 100).toFixed(2) : 0
                },
                eficiencia: {
                    rotacionEfectivo: await this.calcularRotacionEfectivo(userId, totalEgresos),
                    cicloConversion: await this.calcularCicloConversion(userId)
                },
                crecimiento: {
                    tasaCrecimientoIngresos: await this.calcularCrecimientoIngresos(userId, inicio, fin),
                    tendenciaFlujo: await this.calcularTendenciaFlujo(userId, inicio, fin)
                }
            };
            
            console.log('✅ KPIs financieros calculados exitosamente');
            return kpis;
            
        } catch (error) {
            console.error('❌ Error calculando KPIs:', error);
            throw new Error(`Error al calcular KPIs financieros: ${error.message}`);
        }
    }
    
    /**
     * Alertas financieras
     */
    static async obtenerAlertasFinancieras(userId) {
        try {
            console.log(`🚨 Generando alertas financieras`);
            
            const alertas = [];
            
            // Verificar cuentas con saldo bajo
            const cuentasBajoSaldo = await CuentaBancaria.find({
                userId,
                activa: true,
                $expr: {
                    $lt: ['$saldoActual', '$alertas.saldoMinimo']
                }
            });
            
            cuentasBajoSaldo.forEach(cuenta => {
                alertas.push({
                    tipo: 'saldo_bajo',
                    nivel: 'warning',
                    titulo: 'Saldo Bajo en Cuenta',
                    descripcion: `La cuenta ${cuenta.nombre} tiene un saldo de ${cuenta.moneda} ${cuenta.saldoActual}, por debajo del mínimo establecido (${cuenta.moneda} ${cuenta.alertas.saldoMinimo})`,
                    cuentaId: cuenta._id,
                    fecha: new Date(),
                    acciones: ['ver_cuenta', 'transferir_fondos']
                });
            });
            
            // Verificar flujo de caja negativo
            const mesActual = new Date();
            const flujoActual = await FlujoCaja.findOne({
                userId,
                'periodo.año': mesActual.getFullYear(),
                'periodo.mes': mesActual.getMonth() + 1,
                tipoFlujo: 'mensual'
            });
            
            if (flujoActual && flujoActual.resultado.flujoNeto < 0) {
                alertas.push({
                    tipo: 'flujo_negativo',
                    nivel: 'danger',
                    titulo: 'Flujo de Caja Negativo',
                    descripcion: `El flujo de caja del mes actual es negativo: ${flujoActual.resultado.flujoNeto.toFixed(2)}`,
                    flujoId: flujoActual._id,
                    fecha: new Date(),
                    acciones: ['ver_flujo', 'generar_reporte']
                });
            }
            
            // Verificar movimientos sin procesar
            const movimientosPendientes = await MovimientoBancario.countDocuments({
                userId,
                estado: 'pendiente'
            });
            
            if (movimientosPendientes > 0) {
                alertas.push({
                    tipo: 'movimientos_pendientes',
                    nivel: 'info',
                    titulo: 'Movimientos Pendientes',
                    descripcion: `Hay ${movimientosPendientes} movimiento(s) bancario(s) pendiente(s) de procesamiento`,
                    cantidad: movimientosPendientes,
                    fecha: new Date(),
                    acciones: ['ver_movimientos', 'procesar_pendientes']
                });
            }
            
            // Ordenar alertas por nivel de importancia
            const ordenNivel = { 'danger': 0, 'warning': 1, 'info': 2 };
            alertas.sort((a, b) => ordenNivel[a.nivel] - ordenNivel[b.nivel]);
            
            console.log(`✅ ${alertas.length} alertas generadas`);
            return alertas;
            
        } catch (error) {
            console.error('❌ Error generando alertas:', error);
            throw new Error(`Error al generar alertas financieras: ${error.message}`);
        }
    }
    
    /**
     * Generar estado financiero
     */
    static async generarEstadoFinanciero(userId, año, mes, incluirDetalle = false) {
        try {
            console.log(`📄 Generando estado financiero para ${año}-${mes}`);
            
            const flujo = await FlujoCaja.findOne({
                userId,
                'periodo.año': año,
                'periodo.mes': mes,
                tipoFlujo: 'mensual'
            });
            
            if (!flujo) {
                throw new Error(`No se encontró flujo de caja para el período ${año}-${mes}`);
            }
            
            const estadoFinanciero = {
                periodo: {
                    año,
                    mes,
                    descripcion: `${new Date(año, mes - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`
                },
                activos: {
                    efectivoEquivalentes: await this.calcularSaldoTotal(userId),
                    cuentasPorCobrar: 0, // Implementar según necesidades
                    inventarios: 0, // Implementar según necesidades
                    totalActivos: await this.calcularSaldoTotal(userId)
                },
                pasivos: {
                    cuentasPorPagar: 0, // Implementar según necesidades
                    prestamos: 0, // Implementar según necesidades
                    totalPasivos: 0
                },
                patrimonio: {
                    capitalInicial: flujo.resultado.saldoInicialPeriodo,
                    utilidadPeriodo: flujo.resultado.flujoNeto,
                    totalPatrimonio: flujo.resultado.saldoFinalPeriodo
                },
                resultados: {
                    ingresos: flujo.ingresos,
                    egresos: flujo.egresos,
                    resultadoNeto: flujo.resultado.flujoNeto
                },
                indicadores: {
                    liquidez: await this.calcularIndicadorLiquidez(await CuentaBancaria.obtenerEstadisticas(userId)),
                    rentabilidad: flujo.ingresos.total > 0 ? (flujo.resultado.flujoNeto / flujo.ingresos.total * 100).toFixed(2) : 0,
                    eficiencia: flujo.egresos.total > 0 ? (flujo.ingresos.total / flujo.egresos.total).toFixed(2) : 0
                },
                generadoEl: new Date().toISOString()
            };
            
            if (incluirDetalle) {
                estadoFinanciero.detalle = {
                    movimientosBancarios: await MovimientoBancario.obtenerPorPeriodo(
                        new Date(año, mes - 1, 1),
                        new Date(año, mes, 0),
                        userId
                    ),
                    cuentasBancarias: await CuentaBancaria.obtenerPorUsuario(userId)
                };
            }
            
            console.log('✅ Estado financiero generado exitosamente');
            return estadoFinanciero;
            
        } catch (error) {
            console.error('❌ Error generando estado financiero:', error);
            throw new Error(`Error al generar estado financiero: ${error.message}`);
        }
    }
    
    /**
     * Generar reporte de flujo de efectivo
     */
    static async generarReporteFlujoEfectivo(userId, fechaInicio, fechaFin, agruparPor = 'mes') {
        try {
            console.log(`💸 Generando reporte de flujo de efectivo`);
            
            const inicio = new Date(fechaInicio);
            const fin = new Date(fechaFin);
            
            const movimientos = await MovimientoBancario.obtenerPorPeriodo(inicio, fin, userId);
            
            // Agrupar movimientos según el criterio
            const agrupaciones = {};
            
            movimientos.forEach(mov => {
                let clave;
                const fecha = new Date(mov.fechaMovimiento);
                
                switch (agruparPor) {
                    case 'dia':
                        clave = fecha.toISOString().split('T')[0];
                        break;
                    case 'semana':
                        const inicioSemana = new Date(fecha);
                        inicioSemana.setDate(fecha.getDate() - fecha.getDay());
                        clave = inicioSemana.toISOString().split('T')[0];
                        break;
                    case 'mes':
                    default:
                        clave = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
                        break;
                }
                
                if (!agrupaciones[clave]) {
                    agrupaciones[clave] = {
                        periodo: clave,
                        ingresos: 0,
                        egresos: 0,
                        flujoNeto: 0,
                        movimientos: []
                    };
                }
                
                agrupaciones[clave].movimientos.push(mov);
                
                if (mov.tipo === 'ingreso' || mov.tipo === 'transferencia_entrada') {
                    agrupaciones[clave].ingresos += mov.monto;
                } else {
                    agrupaciones[clave].egresos += mov.monto;
                }
                
                agrupaciones[clave].flujoNeto = agrupaciones[clave].ingresos - agrupaciones[clave].egresos;
            });
            
            const reporte = {
                periodo: {
                    inicio: fechaInicio,
                    fin: fechaFin,
                    agrupadoPor: agruparPor
                },
                resumen: {
                    totalIngresos: 0,
                    totalEgresos: 0,
                    flujoNetoTotal: 0
                },
                detallePorPeriodo: Object.values(agrupaciones).sort((a, b) => a.periodo.localeCompare(b.periodo)),
                generadoEl: new Date().toISOString()
            };
            
            // Calcular totales
            reporte.detallePorPeriodo.forEach(periodo => {
                reporte.resumen.totalIngresos += periodo.ingresos;
                reporte.resumen.totalEgresos += periodo.egresos;
            });
            
            reporte.resumen.flujoNetoTotal = reporte.resumen.totalIngresos - reporte.resumen.totalEgresos;
            
            console.log('✅ Reporte de flujo de efectivo generado exitosamente');
            return reporte;
            
        } catch (error) {
            console.error('❌ Error generando reporte de flujo de efectivo:', error);
            throw new Error(`Error al generar reporte de flujo de efectivo: ${error.message}`);
        }
    }
    
    /**
     * Configuración del módulo
     */
    static obtenerConfiguracionModulo() {
        return {
            version: '1.0.0',
            nombre: 'Módulo de Finanzas',
            descripcion: 'Gestión integral de finanzas empresariales',
            modulos: {
                cuentasBancarias: {
                    activo: true,
                    descripcion: 'Gestión de cuentas bancarias'
                },
                movimientosBancarios: {
                    activo: true,
                    descripcion: 'Registro de movimientos bancarios'
                },
                flujoCaja: {
                    activo: true,
                    descripcion: 'Control de flujo de caja'
                },
                prestamos: {
                    activo: false,
                    descripcion: 'Gestión de préstamos y financiamiento'
                },
                inversiones: {
                    activo: false,
                    descripcion: 'Seguimiento de inversiones'
                },
                proyecciones: {
                    activo: false,
                    descripcion: 'Proyecciones financieras'
                }
            },
            monedas: ['PEN', 'USD', 'EUR'],
            tiposCuenta: ['ahorro', 'corriente', 'plazo_fijo', 'inversión', 'efectivo'],
            categorias: this.obtenerCategoriasFinancieras()
        };
    }
    
    /**
     * Inicializar datos por defecto
     */
    static async inicializarDatosDefecto(userData) {
        try {
            console.log('🔧 Inicializando datos por defecto del módulo de finanzas');
            
            const resultado = {
                cuentasCreadas: 0,
                flujosGenerados: 0,
                configuracionAplicada: false
            };
            
            // Crear cuenta de efectivo por defecto
            const cuentaEfectivo = new CuentaBancaria({
                nombre: 'Efectivo en Caja',
                banco: 'EFECTIVO',
                tipoCuenta: 'efectivo',
                numeroCuenta: 'EFECTIVO-001',
                moneda: 'PEN',
                saldoInicial: 0,
                titular: userData.creatorName || 'Propietario',
                descripcion: 'Cuenta de efectivo principal para operaciones diarias',
                ...userData
            });
            
            await cuentaEfectivo.save();
            resultado.cuentasCreadas++;
            
            // Generar flujo de caja del mes actual si no existe
            const ahora = new Date();
            const año = ahora.getFullYear();
            const mes = ahora.getMonth() + 1;
            
            const flujoExistente = await FlujoCaja.findOne({
                userId: userData.userId,
                'periodo.año': año,
                'periodo.mes': mes,
                tipoFlujo: 'mensual'
            });
            
            if (!flujoExistente) {
                await FlujoCaja.generarFlujoPeriodo(userData.userId, año, mes);
                resultado.flujosGenerados++;
            }
            
            resultado.configuracionAplicada = true;
            
            console.log('✅ Datos por defecto inicializados exitosamente');
            return resultado;
            
        } catch (error) {
            console.error('❌ Error inicializando datos por defecto:', error);
            throw new Error(`Error al inicializar datos por defecto: ${error.message}`);
        }
    }
    
    /**
     * Categorías financieras
     */
    static obtenerCategoriasFinancieras() {
        return {
            ingresos: [
                { codigo: 'venta_directa', nombre: 'Ventas Directas', descripcion: 'Ingresos por ventas directas de productos/servicios' },
                { codigo: 'cobro_cliente', nombre: 'Cobros de Clientes', descripcion: 'Cobros de cuentas por cobrar' },
                { codigo: 'prestamo_recibido', nombre: 'Préstamos Recibidos', descripcion: 'Dinero recibido en préstamo' },
                { codigo: 'inversion_retorno', nombre: 'Retorno de Inversiones', descripcion: 'Ganancias de inversiones' },
                { codigo: 'interes_ganado', nombre: 'Intereses Ganados', descripcion: 'Intereses de cuentas bancarias' },
                { codigo: 'devolucion_proveedor', nombre: 'Devoluciones de Proveedores', descripcion: 'Dinero devuelto por proveedores' },
                { codigo: 'ingreso_extra', nombre: 'Ingresos Extraordinarios', descripcion: 'Otros ingresos no operacionales' }
            ],
            egresos: [
                { codigo: 'pago_proveedor', nombre: 'Pagos a Proveedores', descripcion: 'Pagos por compras y servicios' },
                { codigo: 'pago_personal', nombre: 'Pagos de Personal', descripcion: 'Sueldos y beneficios del personal' },
                { codigo: 'gasto_operativo', nombre: 'Gastos Operativos', descripcion: 'Gastos del día a día del negocio' },
                { codigo: 'servicio_basico', nombre: 'Servicios Básicos', descripcion: 'Luz, agua, internet, teléfono' },
                { codigo: 'alquiler', nombre: 'Alquiler', descripcion: 'Pagos de alquiler de local/oficina' },
                { codigo: 'prestamo_pago', nombre: 'Pagos de Préstamos', descripcion: 'Cuotas de préstamos' },
                { codigo: 'inversion_realizada', nombre: 'Inversiones Realizadas', descripcion: 'Dinero invertido' },
                { codigo: 'transporte', nombre: 'Transporte', descripcion: 'Gastos de transporte y combustible' },
                { codigo: 'marketing', nombre: 'Marketing', descripcion: 'Gastos de publicidad y marketing' },
                { codigo: 'impuestos', nombre: 'Impuestos', descripcion: 'Pagos de impuestos y tributos' },
                { codigo: 'comision_bancaria', nombre: 'Comisiones Bancarias', descripcion: 'Comisiones y cargos bancarios' },
                { codigo: 'egreso_extra', nombre: 'Egresos Extraordinarios', descripcion: 'Otros gastos no operacionales' }
            ]
        };
    }
    
    /**
     * Monedas soportadas
     */
    static obtenerMonedasSoportadas() {
        return [
            { codigo: 'PEN', nombre: 'Sol Peruano', simbolo: 'S/' },
            { codigo: 'USD', nombre: 'Dólar Estadounidense', simbolo: '$' },
            { codigo: 'EUR', nombre: 'Euro', simbolo: '€' }
        ];
    }
    
    // ==================== MÉTODOS AUXILIARES ====================
    
    static async obtenerTendenciasFinancieras(userId, meses = 6) {
        const ahora = new Date();
        const tendencias = [];
        
        for (let i = meses - 1; i >= 0; i--) {
            const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
            const año = fecha.getFullYear();
            const mes = fecha.getMonth() + 1;
            
            const flujo = await FlujoCaja.findOne({
                userId,
                'periodo.año': año,
                'periodo.mes': mes,
                tipoFlujo: 'mensual'
            });
            
            tendencias.push({
                periodo: `${año}-${mes.toString().padStart(2, '0')}`,
                ingresos: flujo ? flujo.ingresos.total : 0,
                egresos: flujo ? flujo.egresos.total : 0,
                flujoNeto: flujo ? flujo.resultado.flujoNeto : 0
            });
        }
        
        return tendencias;
    }
    
    static calcularIndicadorLiquidez(resumenCuentas) {
        // Indicador simple de liquidez basado en saldos disponibles
        const saldoTotal = resumenCuentas.saldoTotalPEN + 
                          (resumenCuentas.saldoTotalUSD * 3.75) + // Aproximación USD a PEN
                          (resumenCuentas.saldoTotalEUR * 4.10);  // Aproximación EUR a PEN
        
        if (saldoTotal >= 10000) return 'alto';
        if (saldoTotal >= 5000) return 'medio';
        return 'bajo';
    }
    
    static async calcularRentabilidad(userId, periodo) {
        const estadisticas = await MovimientoBancario.obtenerEstadisticas(userId, periodo);
        
        if (estadisticas.ingresos.total > 0) {
            return ((estadisticas.balance / estadisticas.ingresos.total) * 100).toFixed(2);
        }
        
        return 0;
    }
    
    static async calcularEficienciaGastos(userId, periodo) {
        const estadisticas = await MovimientoBancario.obtenerEstadisticas(userId, periodo);
        
        if (estadisticas.egresos.total > 0 && estadisticas.ingresos.total > 0) {
            return ((estadisticas.ingresos.total / estadisticas.egresos.total)).toFixed(2);
        }
        
        return 0;
    }
    
    static async calcularSaldoTotal(userId) {
        const estadisticas = await CuentaBancaria.obtenerEstadisticas(userId);
        return estadisticas.saldoTotalPEN + 
               (estadisticas.saldoTotalUSD * 3.75) + 
               (estadisticas.saldoTotalEUR * 4.10);
    }
    
    static async calcularDisponibilidadInmediata(userId) {
        const cuentasLiquidas = await CuentaBancaria.find({
            userId,
            activa: true,
            tipoCuenta: { $in: ['ahorro', 'corriente', 'efectivo'] }
        });
        
        return cuentasLiquidas.reduce((total, cuenta) => {
            const factor = cuenta.moneda === 'USD' ? 3.75 : (cuenta.moneda === 'EUR' ? 4.10 : 1);
            return total + (cuenta.saldoActual * factor);
        }, 0);
    }
    
    static async calcularRotacionEfectivo(userId, totalEgresos) {
        const saldoPromedio = await this.calcularSaldoTotal(userId);
        return saldoPromedio > 0 ? (totalEgresos / saldoPromedio).toFixed(2) : 0;
    }
    
    static async calcularCicloConversion(userId) {
        // Implementación básica - puede mejorarse con más datos del negocio
        return 30; // Días promedio
    }
    
    static async calcularCrecimientoIngresos(userId, inicio, fin) {
        // Comparar con período anterior del mismo rango
        const diasPeriodo = Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24));
        const inicioAnterior = new Date(inicio.getTime() - (diasPeriodo * 24 * 60 * 60 * 1000));
        
        const [movimientosActual, movimientosAnterior] = await Promise.all([
            MovimientoBancario.obtenerPorPeriodo(inicio, fin, userId),
            MovimientoBancario.obtenerPorPeriodo(inicioAnterior, inicio, userId)
        ]);
        
        const ingresosActual = movimientosActual
            .filter(m => m.tipo === 'ingreso')
            .reduce((sum, m) => sum + m.monto, 0);
            
        const ingresosAnterior = movimientosAnterior
            .filter(m => m.tipo === 'ingreso')
            .reduce((sum, m) => sum + m.monto, 0);
        
        if (ingresosAnterior > 0) {
            return (((ingresosActual - ingresosAnterior) / ingresosAnterior) * 100).toFixed(2);
        }
        
        return 0;
    }
    
    static async calcularTendenciaFlujo(userId, inicio, fin) {
        const movimientos = await MovimientoBancario.obtenerPorPeriodo(inicio, fin, userId);
        
        // Agrupar por semanas y calcular tendencia
        const semanas = {};
        movimientos.forEach(mov => {
            const semana = Math.floor((new Date(mov.fechaMovimiento) - inicio) / (7 * 24 * 60 * 60 * 1000));
            if (!semanas[semana]) {
                semanas[semana] = { ingresos: 0, egresos: 0 };
            }
            
            if (mov.tipo === 'ingreso') {
                semanas[semana].ingresos += mov.monto;
            } else {
                semanas[semana].egresos += mov.monto;
            }
        });
        
        const flujosSemana = Object.values(semanas).map(s => s.ingresos - s.egresos);
        
        if (flujosSemana.length < 2) return 'estable';
        
        const promedioPrimera = flujosSemana.slice(0, Math.floor(flujosSemana.length / 2))
            .reduce((a, b) => a + b, 0) / Math.floor(flujosSemana.length / 2);
        const promedioSegunda = flujosSemana.slice(Math.floor(flujosSemana.length / 2))
            .reduce((a, b) => a + b, 0) / Math.ceil(flujosSemana.length / 2);
        
        const diferencia = ((promedioSegunda - promedioPrimera) / Math.abs(promedioPrimera)) * 100;
        
        if (diferencia > 10) return 'creciente';
        if (diferencia < -10) return 'decreciente';
        return 'estable';
    }

    // ==================== MÉTODOS ESPECÍFICOS DE MÓDULOS ====================

    /**
     * Obtener garantías
     */
    static async obtenerGarantias(userId, filtros = {}) {
        try {
            console.log(`🛡️ Obteniendo garantías para usuario: ${userId}`);
            
            // Mock data - puedes reemplazar con tu lógica real
            const garantias = [
                {
                    id: 1,
                    tipo: 'Hipotecaria',
                    descripcion: 'Garantía hipotecaria sobre propiedad comercial',
                    valor: 500000,
                    estado: 'activo',
                    fechaCreacion: new Date(),
                    vencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                    beneficiario: 'Banco Nacional'
                },
                {
                    id: 2,
                    tipo: 'Bancaria',
                    descripcion: 'Carta de crédito standby',
                    valor: 150000,
                    estado: 'activo',
                    fechaCreacion: new Date(),
                    vencimiento: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
                    beneficiario: 'Proveedor ABC'
                }
            ];
            
            return garantias;
        } catch (error) {
            console.error('❌ Error obteniendo garantías:', error);
            throw new Error('Error obteniendo garantías: ' + error.message);
        }
    }

    /**
     * Crear garantía
     */
    static async crearGarantia(userId, datos) {
        try {
            console.log(`➕ Creando nueva garantía para usuario: ${userId}`);
            
            // Mock data - implementa tu lógica real aquí
            const nuevaGarantia = {
                id: Date.now(),
                ...datos,
                userId,
                fechaCreacion: new Date(),
                estado: 'activo'
            };
            
            return nuevaGarantia;
        } catch (error) {
            console.error('❌ Error creando garantía:', error);
            throw new Error('Error creando garantía: ' + error.message);
        }
    }

    /**
     * Obtener préstamos
     */
    static async obtenerPrestamos(userId, filtros = {}) {
        try {
            console.log(`💰 Obteniendo préstamos para usuario: ${userId}`);
            
            // Mock data - puedes reemplazar con tu lógica real
            const prestamos = [
                {
                    id: 1,
                    tipo: 'Comercial',
                    descripcion: 'Préstamo para capital de trabajo',
                    monto: 250000,
                    montoOriginal: 300000,
                    tasaInteres: 8.5,
                    plazo: 24,
                    estado: 'activo',
                    fechaInicio: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
                    fechaVencimiento: new Date(Date.now() + 540 * 24 * 60 * 60 * 1000),
                    entidadFinanciera: 'Banco Industrial'
                },
                {
                    id: 2,
                    tipo: 'Personal',
                    descripcion: 'Préstamo personal para inversión',
                    monto: 50000,
                    montoOriginal: 75000,
                    tasaInteres: 12.0,
                    plazo: 12,
                    estado: 'activo',
                    fechaInicio: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    fechaVencimiento: new Date(Date.now() + 270 * 24 * 60 * 60 * 1000),
                    entidadFinanciera: 'Cooperativa de Crédito'
                }
            ];
            
            return prestamos;
        } catch (error) {
            console.error('❌ Error obteniendo préstamos:', error);
            throw new Error('Error obteniendo préstamos: ' + error.message);
        }
    }

    /**
     * Crear préstamo
     */
    static async crearPrestamo(userId, datos) {
        try {
            console.log(`➕ Creando nuevo préstamo para usuario: ${userId}`);
            
            // Mock data - implementa tu lógica real aquí
            const nuevoPrestamo = {
                id: Date.now(),
                ...datos,
                userId,
                fechaInicio: new Date(),
                estado: 'activo'
            };
            
            return nuevoPrestamo;
        } catch (error) {
            console.error('❌ Error creando préstamo:', error);
            throw new Error('Error creando préstamo: ' + error.message);
        }
    }

    /**
     * Obtener cuentas bancarias
     */
    static async obtenerCuentasBancarias(userId, filtros = {}) {
        try {
            console.log(`🏦 Obteniendo cuentas bancarias para usuario: ${userId}`);
            
            // Usar el modelo existente si está disponible
            const cuentas = await CuentaBancaria.find({ userId }).lean();
            
            if (cuentas && cuentas.length > 0) {
                return cuentas;
            }
            
            // Mock data si no hay cuentas reales
            const cuentasMock = [
                {
                    id: 1,
                    numeroCuenta: '****1234',
                    tipo: 'Corriente',
                    banco: 'Banco Nacional',
                    saldo: 125000,
                    moneda: 'USD',
                    estado: 'activo',
                    fechaApertura: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
                },
                {
                    id: 2,
                    numeroCuenta: '****5678',
                    tipo: 'Ahorro',
                    banco: 'Banco Industrial',
                    saldo: 85000,
                    moneda: 'USD',
                    estado: 'activo',
                    fechaApertura: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000)
                }
            ];
            
            return cuentasMock;
        } catch (error) {
            console.error('❌ Error obteniendo cuentas bancarias:', error);
            throw new Error('Error obteniendo cuentas bancarias: ' + error.message);
        }
    }

    /**
     * Crear cuenta bancaria
     */
    static async crearCuentaBancaria(userId, datos) {
        try {
            console.log(`➕ Creando nueva cuenta bancaria para usuario: ${userId}`);
            
            // Usar el modelo existente si está disponible
            try {
                const nuevaCuenta = new CuentaBancaria({
                    ...datos,
                    userId,
                    fechaApertura: new Date(),
                    estado: 'activo'
                });
                
                await nuevaCuenta.save();
                return nuevaCuenta;
            } catch (modelError) {
                // Mock data si el modelo no funciona
                const nuevaCuenta = {
                    id: Date.now(),
                    ...datos,
                    userId,
                    fechaApertura: new Date(),
                    estado: 'activo'
                };
                
                return nuevaCuenta;
            }
        } catch (error) {
            console.error('❌ Error creando cuenta bancaria:', error);
            throw new Error('Error creando cuenta bancaria: ' + error.message);
        }
    }

    /**
     * Obtener pagos de financiamiento
     */
    static async obtenerPagosFinanciamiento(userId, filtros = {}) {
        try {
            console.log(`💸 Obteniendo pagos de financiamiento para usuario: ${userId}`);
            
            // Mock data - puedes reemplazar con tu lógica real
            const pagos = [
                {
                    id: 1,
                    tipo: 'Cuota Préstamo',
                    descripcion: 'Pago mensual préstamo comercial',
                    monto: 12500,
                    fechaPago: new Date(),
                    fechaVencimiento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    estado: 'pendiente',
                    prestamoId: 1,
                    entidadFinanciera: 'Banco Industrial'
                },
                {
                    id: 2,
                    tipo: 'Intereses',
                    descripcion: 'Pago de intereses cuenta corriente',
                    monto: 850,
                    fechaPago: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                    fechaVencimiento: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                    estado: 'pagado',
                    cuentaId: 1,
                    entidadFinanciera: 'Banco Nacional'
                }
            ];
            
            return pagos;
        } catch (error) {
            console.error('❌ Error obteniendo pagos de financiamiento:', error);
            throw new Error('Error obteniendo pagos de financiamiento: ' + error.message);
        }
    }

    /**
     * Crear pago de financiamiento
     */
    static async crearPagoFinanciamiento(userId, datos) {
        try {
            console.log(`➕ Creando nuevo pago de financiamiento para usuario: ${userId}`);
            
            // Mock data - implementa tu lógica real aquí
            const nuevoPago = {
                id: Date.now(),
                ...datos,
                userId,
                fechaCreacion: new Date(),
                estado: 'pendiente'
            };
            
            return nuevoPago;
        } catch (error) {
            console.error('❌ Error creando pago de financiamiento:', error);
            throw new Error('Error creando pago de financiamiento: ' + error.message);
        }
    }
}

module.exports = FinanzasService;
