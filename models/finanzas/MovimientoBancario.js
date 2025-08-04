const mongoose = require('mongoose');

const movimientoBancarioSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    cuentaBancariaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CuentaBancaria',
        required: true,
        index: true
    },
    tipo: {
        type: String,
        required: true,
        enum: ['ingreso', 'egreso', 'transferencia_entrada', 'transferencia_salida'],
        index: true
    },
    categoria: {
        type: String,
        required: true,
        enum: [
            // Ingresos
            'venta_directa', 'cobro_cliente', 'prestamo_recibido', 'inversion_retorno',
            'ingreso_extra', 'devolucion_proveedor', 'interes_ganado',
            // Egresos
            'pago_proveedor', 'pago_personal', 'gasto_operativo', 'servicio_basico',
            'alquiler', 'transporte', 'marketing', 'impuestos', 'prestamo_pago',
            'inversion_realizada', 'egreso_extra', 'comision_bancaria',
            // Transferencias
            'transferencia_entre_cuentas', 'transferencia_terceros'
        ],
        index: true
    },
    subcategoria: {
        type: String,
        trim: true
    },
    descripcion: {
        type: String,
        required: true,
        trim: true
    },
    monto: {
        type: Number,
        required: true,
        min: 0
    },
    moneda: {
        type: String,
        required: true,
        enum: ['PEN', 'USD', 'EUR'],
        default: 'PEN'
    },
    fechaMovimiento: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    fechaValor: {
        type: Date,
        required: true,
        default: Date.now
    },
    // Información de la operación
    numeroOperacion: {
        type: String,
        trim: true
    },
    numeroComprobante: {
        type: String,
        trim: true
    },
    metodoPago: {
        type: String,
        enum: ['efectivo', 'transferencia', 'cheque', 'tarjeta_debito', 'tarjeta_credito', 'yape', 'plin', 'otro'],
        default: 'transferencia'
    },
    // Para transferencias entre cuentas
    cuentaDestinoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CuentaBancaria'
    },
    // Saldos para trazabilidad
    saldoAnterior: {
        type: Number,
        required: true
    },
    saldoPosterior: {
        type: Number,
        required: true
    },
    // Estado del movimiento
    estado: {
        type: String,
        enum: ['pendiente', 'procesado', 'anulado'],
        default: 'procesado'
    },
    // Relaciones con otros módulos
    ventaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Venta'
    },
    gastoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Gasto'
    },
    prestamoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prestamo'
    },
    inversionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inversion'
    },
    // Información del responsable
    responsable: {
        nombre: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        }
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
    // Metadatos adicionales
    observaciones: {
        type: String,
        trim: true
    },
    documentos: [{
        nombre: String,
        url: String,
        tipo: String
    }]
}, {
    timestamps: true,
    collection: 'movimientos_bancarios'
});

// Índices compuestos para optimizar consultas
movimientoBancarioSchema.index({ cuentaBancariaId: 1, fechaMovimiento: -1 });
movimientoBancarioSchema.index({ userId: 1, tipo: 1, fechaMovimiento: -1 });
movimientoBancarioSchema.index({ categoria: 1, fechaMovimiento: -1 });
movimientoBancarioSchema.index({ estado: 1, fechaMovimiento: -1 });
movimientoBancarioSchema.index({ numeroOperacion: 1 });

// Middleware para generar código automático
movimientoBancarioSchema.pre('save', async function(next) {
    if (this.isNew && !this.codigo) {
        const prefijo = this.tipo === 'ingreso' ? 'ING' : 'EGR';
        const fechaHoy = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
        const ultimoMovimiento = await this.constructor.findOne(
            { 
                codigo: { $regex: `^${prefijo}${fechaHoy}` }
            },
            {},
            { sort: { codigo: -1 } }
        );
        
        let numeroSecuencial = 1;
        if (ultimoMovimiento && ultimoMovimiento.codigo) {
            const match = ultimoMovimiento.codigo.match(/(\d+)$/);
            if (match) {
                numeroSecuencial = parseInt(match[1]) + 1;
            }
        }
        
        this.codigo = `${prefijo}${fechaHoy}${numeroSecuencial.toString().padStart(3, '0')}`;
    }
    next();
});

// Métodos de instancia
movimientoBancarioSchema.methods.anular = function(motivo) {
    this.estado = 'anulado';
    this.observaciones = (this.observaciones || '') + `\nAnulado: ${motivo}`;
    return this.save();
};

movimientoBancarioSchema.methods.procesar = function() {
    this.estado = 'procesado';
    return this.save();
};

// Métodos estáticos
movimientoBancarioSchema.statics.obtenerPorCuenta = function(cuentaId, filtros = {}) {
    const query = { cuentaBancariaId: cuentaId, ...filtros };
    return this.find(query)
        .populate('cuentaBancariaId', 'nombre banco numeroCuenta')
        .populate('cuentaDestinoId', 'nombre banco numeroCuenta')
        .sort({ fechaMovimiento: -1 });
};

movimientoBancarioSchema.statics.obtenerPorPeriodo = function(fechaInicio, fechaFin, userId = null) {
    const filtro = {
        fechaMovimiento: {
            $gte: new Date(fechaInicio),
            $lte: new Date(fechaFin)
        }
    };
    
    if (userId) {
        filtro.userId = userId;
    }
    
    return this.find(filtro)
        .populate('cuentaBancariaId', 'nombre banco')
        .sort({ fechaMovimiento: -1 });
};

movimientoBancarioSchema.statics.obtenerResumenPorCategoria = async function(userId, fechaInicio, fechaFin) {
    const pipeline = [
        {
            $match: {
                userId: userId,
                fechaMovimiento: {
                    $gte: new Date(fechaInicio),
                    $lte: new Date(fechaFin)
                },
                estado: 'procesado'
            }
        },
        {
            $group: {
                _id: {
                    tipo: '$tipo',
                    categoria: '$categoria'
                },
                totalMonto: { $sum: '$monto' },
                cantidadMovimientos: { $sum: 1 }
            }
        },
        {
            $sort: { totalMonto: -1 }
        }
    ];
    
    return this.aggregate(pipeline);
};

movimientoBancarioSchema.statics.obtenerEstadisticas = async function(userId, periodo = 'mes') {
    const ahora = new Date();
    let fechaInicio;
    
    switch (periodo) {
        case 'dia':
            fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
            break;
        case 'semana':
            fechaInicio = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'mes':
            fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
            break;
        case 'ano':
            fechaInicio = new Date(ahora.getFullYear(), 0, 1);
            break;
        default:
            fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    }
    
    const pipeline = [
        {
            $match: {
                userId: userId,
                fechaMovimiento: { $gte: fechaInicio },
                estado: 'procesado'
            }
        },
        {
            $group: {
                _id: '$tipo',
                total: { $sum: '$monto' },
                cantidad: { $sum: 1 }
            }
        }
    ];
    
    const resultado = await this.aggregate(pipeline);
    
    const estadisticas = {
        ingresos: { total: 0, cantidad: 0 },
        egresos: { total: 0, cantidad: 0 }
    };
    
    resultado.forEach(item => {
        if (item._id === 'ingreso' || item._id === 'transferencia_entrada') {
            estadisticas.ingresos.total += item.total;
            estadisticas.ingresos.cantidad += item.cantidad;
        } else {
            estadisticas.egresos.total += item.total;
            estadisticas.egresos.cantidad += item.cantidad;
        }
    });
    
    estadisticas.balance = estadisticas.ingresos.total - estadisticas.egresos.total;
    
    return estadisticas;
};

module.exports = mongoose.model('MovimientoBancario', movimientoBancarioSchema);
