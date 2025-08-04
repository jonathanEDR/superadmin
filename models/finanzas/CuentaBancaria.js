const mongoose = require('mongoose');

const cuentaBancariaSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    banco: {
        type: String,
        required: true,
        trim: true
    },
    tipoCuenta: {
        type: String,
        required: true,
        enum: ['ahorro', 'corriente', 'plazo_fijo', 'inversión', 'efectivo'],
        default: 'ahorro'
    },
    numeroCuenta: {
        type: String,
        required: true,
        trim: true
    },
    moneda: {
        type: String,
        required: true,
        enum: ['PEN', 'USD', 'EUR'],
        default: 'PEN'
    },
    saldoInicial: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    saldoActual: {
        type: Number,
        required: true,
        default: 0
    },
    fechaApertura: {
        type: Date,
        required: true,
        default: Date.now
    },
    // Información del titular
    titular: {
        type: String,
        required: true,
        trim: true
    },
    // Estado de la cuenta
    activa: {
        type: Boolean,
        default: true
    },
    // Configuración de alertas
    alertas: {
        saldoMinimo: {
            type: Number,
            default: 0
        },
        notificarMovimientos: {
            type: Boolean,
            default: true
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
    // Metadatos
    descripcion: {
        type: String,
        trim: true
    },
    observaciones: {
        type: String,
        trim: true
    }
}, {
    timestamps: true,
    collection: 'cuentas_bancarias'
});

// Índices para optimizar consultas
cuentaBancariaSchema.index({ userId: 1, activa: 1 });
cuentaBancariaSchema.index({ banco: 1, tipoCuenta: 1 });
cuentaBancariaSchema.index({ moneda: 1 });
cuentaBancariaSchema.index({ createdAt: -1 });

// Middleware para generar código automático
cuentaBancariaSchema.pre('save', async function(next) {
    if (this.isNew && !this.codigo) {
        const ultimaCuenta = await this.constructor.findOne(
            { userId: this.userId },
            {},
            { sort: { codigo: -1 } }
        );
        
        let numeroSecuencial = 1;
        if (ultimaCuenta && ultimaCuenta.codigo) {
            const match = ultimaCuenta.codigo.match(/CTA(\d+)$/);
            if (match) {
                numeroSecuencial = parseInt(match[1]) + 1;
            }
        }
        
        this.codigo = `CTA${numeroSecuencial.toString().padStart(3, '0')}`;
    }
    
    // Establecer saldo actual igual al inicial si es nuevo
    if (this.isNew && this.saldoActual === 0) {
        this.saldoActual = this.saldoInicial;
    }
    
    next();
});

// Métodos de instancia
cuentaBancariaSchema.methods.actualizarSaldo = function(monto, tipo = 'ingreso') {
    if (tipo === 'ingreso') {
        this.saldoActual += monto;
    } else if (tipo === 'egreso') {
        this.saldoActual -= monto;
    }
    return this.save();
};

cuentaBancariaSchema.methods.verificarSaldoSuficiente = function(monto) {
    return this.saldoActual >= monto;
};

cuentaBancariaSchema.methods.activar = function() {
    this.activa = true;
    return this.save();
};

cuentaBancariaSchema.methods.desactivar = function() {
    this.activa = false;
    return this.save();
};

// Métodos estáticos
cuentaBancariaSchema.statics.obtenerPorUsuario = function(userId, activas = true) {
    const filtro = { userId };
    if (activas !== null) {
        filtro.activa = activas;
    }
    return this.find(filtro).sort({ createdAt: -1 });
};

cuentaBancariaSchema.statics.obtenerPorBanco = function(banco, userId = null) {
    const filtro = { banco, activa: true };
    if (userId) {
        filtro.userId = userId;
    }
    return this.find(filtro).sort({ createdAt: -1 });
};

cuentaBancariaSchema.statics.obtenerEstadisticas = async function(userId = null) {
    const filtro = userId ? { userId } : {};
    
    const pipeline = [
        { $match: filtro },
        {
            $group: {
                _id: null,
                totalCuentas: { $sum: 1 },
                cuentasActivas: {
                    $sum: { $cond: ['$activa', 1, 0] }
                },
                saldoTotalPEN: {
                    $sum: { $cond: [{ $eq: ['$moneda', 'PEN'] }, '$saldoActual', 0] }
                },
                saldoTotalUSD: {
                    $sum: { $cond: [{ $eq: ['$moneda', 'USD'] }, '$saldoActual', 0] }
                },
                saldoTotalEUR: {
                    $sum: { $cond: [{ $eq: ['$moneda', 'EUR'] }, '$saldoActual', 0] }
                }
            }
        }
    ];
    
    const resultado = await this.aggregate(pipeline);
    return resultado[0] || {
        totalCuentas: 0,
        cuentasActivas: 0,
        saldoTotalPEN: 0,
        saldoTotalUSD: 0,
        saldoTotalEUR: 0
    };
};

module.exports = mongoose.model('CuentaBancaria', cuentaBancariaSchema);
