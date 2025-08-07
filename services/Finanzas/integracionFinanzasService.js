const MovimientoCajaFinanzas = require('../../models/finanzas/MovimientoCaja');
const CuentaBancaria = require('../../models/finanzas/CuentaBancaria');
const MovimientoBancario = require('../../models/finanzas/MovimientoBancario');

class IntegracionFinanzasService {
    
    /**
     * Registrar movimiento integrado (Caja + Bancario)
     */
    static async registrarMovimientoIntegrado(datosMovimiento, userData) {
        try {
            // ...existing code...

            // === 1. VALIDACIONES INICIALES ===
            if (datosMovimiento.afectaCuentaBancaria && !datosMovimiento.cuentaBancariaId) {
                throw new Error('Se debe especificar una cuenta bancaria cuando afectaCuentaBancaria es true');
            }

            let cuentaBancaria = null;
            let saldoAnterior = null;
            let saldoPosterior = null;

            // === 2. VALIDAR CUENTA BANCARIA SI ES NECESARIO ===
            if (datosMovimiento.afectaCuentaBancaria) {
                cuentaBancaria = await CuentaBancaria.findById(datosMovimiento.cuentaBancariaId);
                
                if (!cuentaBancaria) {
                    throw new Error('Cuenta bancaria no encontrada');
                }
                
                if (!cuentaBancaria.activa) {
                    throw new Error('No se pueden realizar movimientos en una cuenta inactiva');
                }
                
                if (cuentaBancaria.userId !== userData.userId) {
                    throw new Error('No tiene permisos para usar esta cuenta bancaria');
                }

                saldoAnterior = cuentaBancaria.saldoActual;

                // Validar saldo suficiente para egresos
                if (datosMovimiento.tipo === 'egreso' && saldoAnterior < datosMovimiento.monto) {
                    throw new Error(`Saldo insuficiente. Saldo actual: S/ ${saldoAnterior.toFixed(2)}, Monto solicitado: S/ ${datosMovimiento.monto.toFixed(2)}`);
                }

                // Calcular saldo posterior
                saldoPosterior = datosMovimiento.tipo === 'ingreso' 
                    ? saldoAnterior + datosMovimiento.monto 
                    : saldoAnterior - datosMovimiento.monto;
            }

            // === 3. CREAR MOVIMIENTO EN CAJA ===
            const movimientoCaja = new MovimientoCajaFinanzas({
                ...datosMovimiento,
                ...userData,
                saldoBancarioAnterior: saldoAnterior,
                saldoBancarioPosterior: saldoPosterior
            });

            // === 4. CREAR MOVIMIENTO BANCARIO SI ES NECESARIO ===
            let movimientoBancario = null;
            if (datosMovimiento.afectaCuentaBancaria) {
                movimientoBancario = await this.crearMovimientoBancario(
                    datosMovimiento, 
                    cuentaBancaria, 
                    saldoAnterior, 
                    saldoPosterior, 
                    userData
                );
                
                // Vincular movimientos
                movimientoCaja.movimientoBancarioId = movimientoBancario._id;
            }

            // === 5. GUARDAR MOVIMIENTO DE CAJA ===
            await movimientoCaja.save();
            // ...existing code...

            // === 6. ACTUALIZAR SALDO DE CUENTA BANCARIA ===
            if (cuentaBancaria) {
                cuentaBancaria.saldoActual = saldoPosterior;
                cuentaBancaria.fechaUltimoMovimiento = new Date();
                await cuentaBancaria.save();
                // ...existing code...
            }

            // === 7. RETORNAR RESULTADO ===
            return {
                success: true,
                movimientoCaja,
                movimientoBancario,
                cuentaBancaria: cuentaBancaria ? {
                    id: cuentaBancaria._id,
                    nombre: cuentaBancaria.nombre,
                    saldoAnterior,
                    saldoActual: saldoPosterior
                } : null
            };

        } catch (error) {
            console.error('❌ Error en registro integrado:', error);
            throw new Error(`Error al registrar movimiento integrado: ${error.message}`);
        }
    }

    /**
     * Crear movimiento bancario asociado
     */
    static async crearMovimientoBancario(datosMovimiento, cuentaBancaria, saldoAnterior, saldoPosterior, userData) {
        try {
            // Mapear categorías de caja a categorías bancarias
            const categoriaBancaria = this.mapearCategoriaCaja(datosMovimiento.categoria, datosMovimiento.tipo);
            
            // Generar código para el movimiento bancario con prefijo especial para integración
            const prefijo = datosMovimiento.tipo === 'ingreso' ? 'BCING' : 'BCEGR';
            const fechaHoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const codigoTemporal = `${prefijo}${fechaHoy}${Date.now().toString().slice(-3)}`;
            
            const movimientoBancario = new MovimientoBancario({
                codigo: codigoTemporal,
                cuentaBancariaId: cuentaBancaria._id,
                tipo: datosMovimiento.tipo,
                categoria: categoriaBancaria,
                subcategoria: datosMovimiento.subcategoria || 'movimiento_caja',
                descripcion: `[CAJA] ${datosMovimiento.concepto}${datosMovimiento.descripcion ? ' - ' + datosMovimiento.descripcion : ''}`,
                monto: datosMovimiento.monto,
                moneda: cuentaBancaria.moneda,
                fechaMovimiento: datosMovimiento.fecha || new Date(),
                fechaValor: datosMovimiento.fecha || new Date(),
                numeroOperacion: datosMovimiento.metodoPago?.detalles?.numeroOperacion || `CAJA-${Date.now()}`,
                metodoPago: datosMovimiento.metodoPago?.tipo || 'transferencia',
                saldoAnterior,
                saldoPosterior,
                estado: 'procesado',
                responsable: {
                    nombre: userData.creatorName,
                    email: userData.creatorEmail
                },
                observaciones: `Movimiento generado automáticamente desde caja. ${datosMovimiento.observaciones || ''}`,
                // Campos de trazabilidad requeridos
                userId: userData.userId,
                creatorId: userData.creatorId,
                creatorName: userData.creatorName,
                creatorEmail: userData.creatorEmail,
                creatorRole: userData.creatorRole || 'admin' // Valor por defecto si no se proporciona
            });

            await movimientoBancario.save();
            // ...existing code...
            
            return movimientoBancario;

        } catch (error) {
            console.error('❌ Error creando movimiento bancario:', error);
            throw error;
        }
    }

    /**
     * Mapear categorías de caja a categorías bancarias
     */
    static mapearCategoriaCaja(categoriaCaja, tipo) {
        const mapeoIngresos = {
            'venta_producto': 'venta_directa',
            'venta_servicio': 'venta_directa',
            'cobro_cliente': 'cobro_cliente',
            'prestamo_recibido': 'prestamo_recibido',
            'devolucion': 'devolucion_proveedor',
            'otros_ingresos': 'ingreso_extra'
        };

        const mapeoEgresos = {
            'compra_materia_prima': 'pago_proveedor',
            'pago_proveedor': 'pago_proveedor',
            'pago_servicio': 'servicio_basico',
            'gasto_operativo': 'gasto_operativo',
            'pago_prestamo': 'prestamo_pago',
            'gasto_personal': 'pago_personal',
            'impuestos': 'impuestos',
            'otros_egresos': 'egreso_extra'
        };

        if (tipo === 'ingreso') {
            return mapeoIngresos[categoriaCaja] || 'ingreso_extra';
        } else {
            return mapeoEgresos[categoriaCaja] || 'egreso_extra';
        }
    }

    /**
     * Obtener movimientos integrados con filtros
     */
    static async obtenerMovimientosIntegrados(userId, filtros = {}) {
        try {
            const query = {
                userId,
                estado: { $ne: 'anulado' },
                ...filtros
            };

            // Si se especifica una cuenta bancaria
            if (filtros.cuentaBancariaId) {
                query.cuentaBancariaId = filtros.cuentaBancariaId;
            }

            // Filtrar por tipo de movimiento
            if (filtros.soloEfectivo) {
                query.afectaCuentaBancaria = false;
            } else if (filtros.soloBancarios) {
                query.afectaCuentaBancaria = true;
            }

            const movimientos = await MovimientoCajaFinanzas.find(query)
                .populate('cuentaBancariaId', 'nombre banco numeroCuenta moneda')
                .populate('movimientoBancarioId')
                .sort({ fecha: -1, createdAt: -1 })
                .lean();

            return movimientos;

        } catch (error) {
            console.error('❌ Error obteniendo movimientos integrados:', error);
            throw new Error(`Error al obtener movimientos integrados: ${error.message}`);
        }
    }

    /**
     * Anular movimiento integrado
     */
    static async anularMovimientoIntegrado(movimientoCajaId, motivo, userData) {
        try {
            // ...existing code...

            const movimientoCaja = await MovimientoCajaFinanzas.findById(movimientoCajaId)
                .populate('cuentaBancariaId')
                .populate('movimientoBancarioId');

            if (!movimientoCaja) {
                throw new Error('Movimiento de caja no encontrado');
            }

            if (movimientoCaja.userId !== userData.userId) {
                throw new Error('No tiene permisos para anular este movimiento');
            }

            if (movimientoCaja.estado === 'anulado') {
                throw new Error('El movimiento ya está anulado');
            }

            // Anular movimiento de caja
            await movimientoCaja.anular(motivo);

            // Si afecta cuenta bancaria, revertir operación
            if (movimientoCaja.afectaCuentaBancaria && movimientoCaja.cuentaBancariaId) {
                const cuenta = movimientoCaja.cuentaBancariaId;
                
                // Revertir saldo
                if (movimientoCaja.tipo === 'ingreso') {
                    cuenta.saldoActual -= movimientoCaja.monto;
                } else {
                    cuenta.saldoActual += movimientoCaja.monto;
                }
                
                await cuenta.save();

                // Anular movimiento bancario si existe
                if (movimientoCaja.movimientoBancarioId) {
                    await movimientoCaja.movimientoBancarioId.anular(`Movimiento de caja anulado: ${motivo}`);
                }
            }

            // ...existing code...
            return { success: true, message: 'Movimiento anulado correctamente' };

        } catch (error) {
            console.error('❌ Error anulando movimiento integrado:', error);
            throw new Error(`Error al anular movimiento integrado: ${error.message}`);
        }
    }

    /**
     * Obtener resumen de integración
     */
    static async obtenerResumenIntegracion(userId, fechaInicio, fechaFin) {
        try {
            const resumen = await MovimientoCajaFinanzas.aggregate([
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
                            afectaCuentaBancaria: '$afectaCuentaBancaria'
                        },
                        total: { $sum: '$monto' },
                        cantidad: { $sum: 1 }
                    }
                }
            ]);

            const resultado = {
                efectivo: { ingresos: 0, egresos: 0, cantidad: 0 },
                bancario: { ingresos: 0, egresos: 0, cantidad: 0 },
                total: { ingresos: 0, egresos: 0, cantidad: 0 }
            };

            resumen.forEach(item => {
                const categoria = item._id.afectaCuentaBancaria ? 'bancario' : 'efectivo';
                const tipo = item._id.tipo;
                
                resultado[categoria][tipo + 's'] = item.total;
                resultado[categoria].cantidad += item.cantidad;
                resultado.total[tipo + 's'] += item.total;
                resultado.total.cantidad += item.cantidad;
            });

            return resultado;

        } catch (error) {
            console.error('❌ Error obteniendo resumen de integración:', error);
            throw new Error(`Error al obtener resumen de integración: ${error.message}`);
        }
    }
}

module.exports = IntegracionFinanzasService;
