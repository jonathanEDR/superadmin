const mongoose = require('mongoose');

const flujoCajaSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    fecha: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    periodo: {
        año: {
            type: Number,
            required: true,
            index: true
        },
        mes: {
            type: Number,
            required: true,
            min: 1,
            max: 12,
            index: true
        },
        semana: {
            type: Number,
            min: 1,
            max: 53
        },
        dia: {
            type: Number,
            min: 1,
            max: 31
        }
    },
    // Resumen de ingresos
    ingresos: {
        // Operaciones del negocio
        ventasDirectas: {
            type: Number,
            default: 0
        },
        cobrosClientes: {
            type: Number,
            default: 0
        },
        // Financiamiento
        prestamosRecibidos: {
            type: Number,
            default: 0
        },
        inversionesRetorno: {
            type: Number,
            default: 0
        },
        // Otros ingresos
        interesesGanados: {
            type: Number,
            default: 0
        },
        devolucionesProveedores: {
            type: Number,
            default: 0
        },
        ingresosExtra: {
            type: Number,
            default: 0
        },
        total: {
            type: Number,
            default: 0,
            required: true
        }
    },
    // Resumen de egresos
    egresos: {
        // Operaciones del negocio
        pagosProveedores: {
            type: Number,
            default: 0
        },
        pagosPersonal: {
            type: Number,
            default: 0
        },
        gastosOperativos: {
            type: Number,
            default: 0
        },
        // Gastos fijos
        serviciosBasicos: {
            type: Number,
            default: 0
        },
        alquiler: {
            type: Number,
            default: 0
        },
        // Financiamiento
        pagosPrestamos: {
            type: Number,
            default: 0
        },
        inversionesRealizadas: {
            type: Number,
            default: 0
        },
        // Otros egresos
        transporte: {
            type: Number,
            default: 0
        },
        marketing: {
            type: Number,
            default: 0
        },
        impuestos: {
            type: Number,
            default: 0
        },
        comisionesBancarias: {
            type: Number,
            default: 0
        },
        egresosExtra: {
            type: Number,
            default: 0
        },
        total: {
            type: Number,
            default: 0,
            required: true
        }
    },
    // Resultados del período
    resultado: {
        flujoNeto: {
            type: Number,
            required: true,
            default: 0
        },
        saldoInicialPeriodo: {
            type: Number,
            default: 0
        },
        saldoFinalPeriodo: {
            type: Number,
            default: 0
        }
    },
    // Cuentas bancarias incluidas
    cuentasIncluidas: [{
        cuentaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CuentaBancaria'
        },
        nombre: String,
        banco: String,
        saldoInicial: Number,
        saldoFinal: Number
    }],
    // Tipo de flujo
    tipoFlujo: {
        type: String,
        enum: ['diario', 'semanal', 'mensual', 'anual'],
        required: true,
        default: 'mensual'
    },
    // Estado del flujo
    estado: {
        type: String,
        enum: ['borrador', 'consolidado', 'cerrado'],
        default: 'borrador'
    },
    // Información de trazabilidad
    userId: {
        type: String,
        required: true,
        index: true
    },
    creatorId: {
        type: String,
        required: true
    },
    creatorName: {
        type: String,
        required: true
    },
    creatorEmail: {
        type: String,
        required: true
    },
    creatorRole: {
        type: String,
        required: true
    },
    // Metadatos
    notas: {
        type: String,
        trim: true
    },
    observaciones: {
        type: String,
        trim: true
    }
}, {
    timestamps: true,
    collection: 'flujo_caja'
});

// Índices compuestos
flujoCajaSchema.index({ userId: 1, 'periodo.año': 1, 'periodo.mes': 1 });
flujoCajaSchema.index({ tipoFlujo: 1, fecha: -1 });
flujoCajaSchema.index({ estado: 1, fecha: -1 });

// Middleware para generar código automático
flujoCajaSchema.pre('save', async function(next) {
    if (this.isNew && !this.codigo) {
        const fecha = new Date(this.fecha);
        const año = fecha.getFullYear();
        const mes = fecha.getMonth() + 1;
        
        const prefijo = this.tipoFlujo.substring(0, 3).toUpperCase();
        const fechaCodigo = `${año}${mes.toString().padStart(2, '0')}`;
        
        const ultimoFlujo = await this.constructor.findOne(
            { 
                codigo: { $regex: `^${prefijo}${fechaCodigo}` },
                userId: this.userId
            },
            {},
            { sort: { codigo: -1 } }
        );
        
        let numeroSecuencial = 1;
        if (ultimoFlujo && ultimoFlujo.codigo) {
            const match = ultimoFlujo.codigo.match(/(\d+)$/);
            if (match) {
                numeroSecuencial = parseInt(match[1]) + 1;
            }
        }
        
        this.codigo = `${prefijo}${fechaCodigo}${numeroSecuencial.toString().padStart(3, '0')}`;
    }
    
    // Calcular totales automáticamente
    if (this.isModified('ingresos') || this.isNew) {
        this.ingresos.total = 
            this.ingresos.ventasDirectas + 
            this.ingresos.cobrosClientes + 
            this.ingresos.prestamosRecibidos + 
            this.ingresos.inversionesRetorno + 
            this.ingresos.interesesGanados + 
            this.ingresos.devolucionesProveedores + 
            this.ingresos.ingresosExtra;
    }
    
    if (this.isModified('egresos') || this.isNew) {
        this.egresos.total = 
            this.egresos.pagosProveedores + 
            this.egresos.pagosPersonal + 
            this.egresos.gastosOperativos + 
            this.egresos.serviciosBasicos + 
            this.egresos.alquiler + 
            this.egresos.pagosPrestamos + 
            this.egresos.inversionesRealizadas + 
            this.egresos.transporte + 
            this.egresos.marketing + 
            this.egresos.impuestos + 
            this.egresos.comisionesBancarias + 
            this.egresos.egresosExtra;
    }
    
    // Calcular flujo neto
    this.resultado.flujoNeto = this.ingresos.total - this.egresos.total;
    this.resultado.saldoFinalPeriodo = this.resultado.saldoInicialPeriodo + this.resultado.flujoNeto;
    
    next();
});

// Métodos de instancia
flujoCajaSchema.methods.consolidar = function() {
    this.estado = 'consolidado';
    return this.save();
};

flujoCajaSchema.methods.cerrar = function() {
    this.estado = 'cerrado';
    return this.save();
};

flujoCajaSchema.methods.reabrirParaEdicion = function() {
    if (this.estado === 'cerrado') {
        throw new Error('No se puede reabrir un flujo de caja cerrado');
    }
    this.estado = 'borrador';
    return this.save();
};

flujoCajaSchema.methods.actualizarFromMovimientos = async function() {
    const MovimientoBancario = mongoose.model('MovimientoBancario');
    
    const fechaInicio = new Date(this.periodo.año, this.periodo.mes - 1, 1);
    const fechaFin = new Date(this.periodo.año, this.periodo.mes, 0, 23, 59, 59);
    
    const movimientos = await MovimientoBancario.obtenerResumenPorCategoria(
        this.userId,
        fechaInicio,
        fechaFin
    );
    
    // Resetear valores
    Object.keys(this.ingresos.toObject()).forEach(key => {
        if (key !== 'total') this.ingresos[key] = 0;
    });
    Object.keys(this.egresos.toObject()).forEach(key => {
        if (key !== 'total') this.egresos[key] = 0;
    });
    
    // Mapear movimientos a categorías del flujo
    movimientos.forEach(mov => {
        const categoria = mov._id.categoria;
        const monto = mov.totalMonto;
        
        if (mov._id.tipo === 'ingreso') {
            switch (categoria) {
                case 'venta_directa':
                    this.ingresos.ventasDirectas += monto;
                    break;
                case 'cobro_cliente':
                    this.ingresos.cobrosClientes += monto;
                    break;
                case 'prestamo_recibido':
                    this.ingresos.prestamosRecibidos += monto;
                    break;
                case 'inversion_retorno':
                    this.ingresos.inversionesRetorno += monto;
                    break;
                case 'interes_ganado':
                    this.ingresos.interesesGanados += monto;
                    break;
                case 'devolucion_proveedor':
                    this.ingresos.devolucionesProveedores += monto;
                    break;
                default:
                    this.ingresos.ingresosExtra += monto;
            }
        } else {
            switch (categoria) {
                case 'pago_proveedor':
                    this.egresos.pagosProveedores += monto;
                    break;
                case 'pago_personal':
                    this.egresos.pagosPersonal += monto;
                    break;
                case 'gasto_operativo':
                    this.egresos.gastosOperativos += monto;
                    break;
                case 'servicio_basico':
                    this.egresos.serviciosBasicos += monto;
                    break;
                case 'alquiler':
                    this.egresos.alquiler += monto;
                    break;
                case 'prestamo_pago':
                    this.egresos.pagosPrestamos += monto;
                    break;
                case 'inversion_realizada':
                    this.egresos.inversionesRealizadas += monto;
                    break;
                case 'transporte':
                    this.egresos.transporte += monto;
                    break;
                case 'marketing':
                    this.egresos.marketing += monto;
                    break;
                case 'impuestos':
                    this.egresos.impuestos += monto;
                    break;
                case 'comision_bancaria':
                    this.egresos.comisionesBancarias += monto;
                    break;
                default:
                    this.egresos.egresosExtra += monto;
            }
        }
    });
    
    return this.save();
};

// Métodos estáticos
flujoCajaSchema.statics.obtenerPorPeriodo = function(userId, año, mes = null, tipoFlujo = 'mensual') {
    const filtro = {
        userId,
        'periodo.año': año,
        tipoFlujo
    };
    
    if (mes) {
        filtro['periodo.mes'] = mes;
    }
    
    return this.find(filtro)
        .populate('cuentasIncluidas.cuentaId', 'nombre banco')
        .sort({ 'periodo.mes': 1, fecha: 1 });
};

flujoCajaSchema.statics.generarFlujoPeriodo = async function(userId, año, mes, tipoFlujo = 'mensual') {
    // Verificar si ya existe un flujo para este período
    const flujoExistente = await this.findOne({
        userId,
        'periodo.año': año,
        'periodo.mes': mes,
        tipoFlujo
    });
    
    if (flujoExistente) {
        throw new Error('Ya existe un flujo de caja para este período');
    }
    
    const fecha = new Date(año, mes - 1, 1);
    
    const nuevoFlujo = new this({
        fecha,
        periodo: { año, mes },
        tipoFlujo,
        userId,
        creatorId: userId,
        creatorName: 'Sistema',
        creatorEmail: 'sistema@finanzas.com',
        creatorRole: 'system'
    });
    
    await nuevoFlujo.save();
    await nuevoFlujo.actualizarFromMovimientos();
    
    return nuevoFlujo;
};

flujoCajaSchema.statics.obtenerComparativoAnual = async function(userId, año) {
    const pipeline = [
        {
            $match: {
                userId,
                'periodo.año': año,
                tipoFlujo: 'mensual'
            }
        },
        {
            $sort: { 'periodo.mes': 1 }
        },
        {
            $project: {
                mes: '$periodo.mes',
                ingresoTotal: '$ingresos.total',
                egresoTotal: '$egresos.total',
                flujoNeto: '$resultado.flujoNeto'
            }
        }
    ];
    
    return this.aggregate(pipeline);
};

module.exports = mongoose.model('FlujoCaja', flujoCajaSchema);
