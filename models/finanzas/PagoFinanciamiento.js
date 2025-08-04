const mongoose = require('mongoose');

const pagoFinanciamientoSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    // Relación con el préstamo
    prestamoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prestamo',
        required: true,
        index: true
    },
    // Información del pago
    numeroCuota: {
        type: Number,
        required: true,
        min: 1
    },
    tipo: {
        type: String,
        required: true,
        enum: ['cuota_regular', 'pago_parcial', 'pago_total', 'pago_interes', 'comision', 'mora'],
        default: 'cuota_regular'
    },
    estado: {
        type: String,
        required: true,
        enum: ['programado', 'pendiente', 'procesado', 'rechazado', 'cancelado'],
        default: 'programado'
    },
    // Montos del pago
    montoTotal: {
        type: Number,
        required: true,
        min: 0
    },
    montoCapital: {
        type: Number,
        required: true,
        min: 0
    },
    montoInteres: {
        type: Number,
        required: true,
        min: 0
    },
    montoComision: {
        type: Number,
        default: 0,
        min: 0
    },
    montoMora: {
        type: Number,
        default: 0,
        min: 0
    },
    montoPagado: {
        type: Number,
        default: 0,
        min: 0
    },
    moneda: {
        type: String,
        required: true,
        enum: ['PEN', 'USD', 'EUR'],
        default: 'PEN'
    },
    // Fechas importantes
    fechaProgramada: {
        type: Date,
        required: true
    },
    fechaPago: {
        type: Date
    },
    fechaVencimiento: {
        type: Date,
        required: true
    },
    // Información del pago
    metodoPago: {
        type: String,
        enum: ['transferencia', 'debito_automatico', 'efectivo', 'cheque', 'deposito'],
        default: 'transferencia'
    },
    cuentaOrigenId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CuentaBancaria'
    },
    numeroOperacion: {
        type: String,
        trim: true
    },
    // Saldos antes y después del pago
    saldoAnterior: {
        type: Number,
        required: true,
        min: 0
    },
    saldoPosterior: {
        type: Number,
        required: true,
        min: 0
    },
    // Información de mora
    diasMora: {
        type: Number,
        default: 0,
        min: 0
    },
    tasaMora: {
        type: Number,
        default: 0,
        min: 0
    },
    // Descuentos aplicados
    descuentos: [{
        tipo: {
            type: String,
            enum: ['pronto_pago', 'cliente_frecuente', 'promocion', 'otro']
        },
        descripcion: String,
        monto: Number,
        porcentaje: Number
    }],
    // Responsable del pago
    responsable: {
        nombre: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        telefono: String
    },
    // Información de procesamiento
    procesamiento: {
        canal: {
            type: String,
            enum: ['web', 'mobile', 'sucursal', 'cajero', 'agente'],
            default: 'web'
        },
        referenciaBanco: String,
        codigoAutorizacion: String,
        fechaProcesamiento: Date
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
    // Observaciones
    descripcion: {
        type: String,
        trim: true
    },
    observaciones: {
        type: String,
        trim: true
    },
    // Documentos adjuntos
    comprobantes: [{
        nombre: String,
        url: String,
        tipo: String,
        fechaSubida: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true,
    collection: 'pagos_financiamiento'
});

// Índices para optimizar consultas
pagoFinanciamientoSchema.index({ prestamoId: 1, numeroCuota: 1 });
pagoFinanciamientoSchema.index({ userId: 1, estado: 1 });
pagoFinanciamientoSchema.index({ fechaProgramada: 1 });
pagoFinanciamientoSchema.index({ fechaVencimiento: 1 });
pagoFinanciamientoSchema.index({ estado: 1, fechaVencimiento: 1 });
pagoFinanciamientoSchema.index({ createdAt: -1 });

// Middleware para generar código automático
pagoFinanciamientoSchema.pre('save', async function(next) {
    if (this.isNew && !this.codigo) {
        const ultimoPago = await this.constructor.findOne(
            { userId: this.userId },
            {},
            { sort: { codigo: -1 } }
        );
        
        let numeroSecuencial = 1;
        if (ultimoPago && ultimoPago.codigo) {
            const match = ultimoPago.codigo.match(/PAGOFIN(\d+)$/);
            if (match) {
                numeroSecuencial = parseInt(match[1]) + 1;
            }
        }
        
        this.codigo = `PAGOFIN${numeroSecuencial.toString().padStart(4, '0')}`;
    }
    
    // Calcular monto total si no está definido
    if (this.isNew && !this.montoTotal) {
        this.montoTotal = this.montoCapital + this.montoInteres + 
                         this.montoComision + this.montoMora;
    }
    
    // Validar que el monto pagado no exceda el monto total
    if (this.montoPagado > this.montoTotal) {
        this.montoPagado = this.montoTotal;
    }
    
    next();
});

// Middleware para validar fechas
pagoFinanciamientoSchema.pre('save', function(next) {
    // La fecha de vencimiento debe ser posterior a la fecha programada
    if (this.fechaVencimiento <= this.fechaProgramada) {
        const fechaVenc = new Date(this.fechaProgramada);
        fechaVenc.setDate(fechaVenc.getDate() + 30); // 30 días de gracia por defecto
        this.fechaVencimiento = fechaVenc;
    }
    
    // Calcular días de mora si hay fecha de pago
    if (this.fechaPago && this.fechaVencimiento) {
        const diasMora = Math.floor((this.fechaPago - this.fechaVencimiento) / (1000 * 60 * 60 * 24));
        this.diasMora = Math.max(0, diasMora);
    }
    
    next();
});

// Métodos de instancia
pagoFinanciamientoSchema.methods.procesar = function(montoPagado, metodoPago = 'transferencia', numeroOperacion = null) {
    this.estado = 'procesado';
    this.montoPagado = montoPagado;
    this.metodoPago = metodoPago;
    this.fechaPago = new Date();
    this.numeroOperacion = numeroOperacion || `PAY-${Date.now()}`;
    this.procesamiento.fechaProcesamiento = new Date();
    
    return this.save();
};

pagoFinanciamientoSchema.methods.rechazar = function(motivo = '') {
    this.estado = 'rechazado';
    this.observaciones = (this.observaciones || '') + `\nRechazado: ${motivo}`;
    return this.save();
};

pagoFinanciamientoSchema.methods.cancelar = function(motivo = '') {
    this.estado = 'cancelado';
    this.observaciones = (this.observaciones || '') + `\nCancelado: ${motivo}`;
    return this.save();
};

pagoFinanciamientoSchema.methods.calcularMora = function(tasaMoraDiaria = 0.033) {
    if (this.diasMora > 0) {
        const moraDiaria = this.montoTotal * (tasaMoraDiaria / 100);
        this.montoMora = Math.round(moraDiaria * this.diasMora * 100) / 100;
        this.tasaMora = tasaMoraDiaria;
        this.montoTotal = this.montoCapital + this.montoInteres + 
                         this.montoComision + this.montoMora;
    }
    return this.montoMora;
};

pagoFinanciamientoSchema.methods.aplicarDescuento = function(tipoDescuento, monto = 0, porcentaje = 0, descripcion = '') {
    const descuento = {
        tipo: tipoDescuento,
        descripcion: descripcion,
        monto: monto,
        porcentaje: porcentaje
    };
    
    if (porcentaje > 0) {
        descuento.monto = Math.round(this.montoTotal * (porcentaje / 100) * 100) / 100;
    }
    
    this.descuentos.push(descuento);
    
    // Recalcular monto total
    const totalDescuentos = this.descuentos.reduce((sum, desc) => sum + desc.monto, 0);
    this.montoTotal = Math.max(0, this.montoCapital + this.montoInteres + 
                               this.montoComision + this.montoMora - totalDescuentos);
    
    return this.save();
};

pagoFinanciamientoSchema.methods.estaVencido = function() {
    const hoy = new Date();
    return this.estado === 'pendiente' && this.fechaVencimiento < hoy;
};

pagoFinanciamientoSchema.methods.diasParaVencimiento = function() {
    const hoy = new Date();
    const diferencia = this.fechaVencimiento - hoy;
    return Math.ceil(diferencia / (1000 * 60 * 60 * 24));
};

pagoFinanciamientoSchema.methods.obtenerResumen = function() {
    const totalDescuentos = this.descuentos.reduce((sum, desc) => sum + desc.monto, 0);
    
    return {
        codigo: this.codigo,
        numeroCuota: this.numeroCuota,
        estado: this.estado,
        fechaProgramada: this.fechaProgramada,
        fechaVencimiento: this.fechaVencimiento,
        montoTotal: this.montoTotal,
        montoPagado: this.montoPagado,
        saldoPendiente: this.montoTotal - this.montoPagado,
        desglose: {
            capital: this.montoCapital,
            interes: this.montoInteres,
            comision: this.montoComision,
            mora: this.montoMora,
            descuentos: totalDescuentos
        },
        diasMora: this.diasMora,
        vencido: this.estaVencido(),
        diasParaVencer: this.diasParaVencimiento()
    };
};

// Métodos estáticos
pagoFinanciamientoSchema.statics.obtenerPorPrestamo = function(prestamoId, estado = null) {
    const filtro = { prestamoId };
    if (estado) {
        if (Array.isArray(estado)) {
            filtro.estado = { $in: estado };
        } else {
            filtro.estado = estado;
        }
    }
    return this.find(filtro).sort({ numeroCuota: 1 });
};

pagoFinanciamientoSchema.statics.obtenerVencidos = function(userId = null) {
    const hoy = new Date();
    const filtro = {
        estado: 'pendiente',
        fechaVencimiento: { $lt: hoy }
    };
    if (userId) {
        filtro.userId = userId;
    }
    return this.find(filtro).sort({ fechaVencimiento: 1 });
};

pagoFinanciamientoSchema.statics.obtenerProximosVencer = function(dias = 7, userId = null) {
    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(hoy.getDate() + dias);
    
    const filtro = {
        estado: 'pendiente',
        fechaVencimiento: { $gte: hoy, $lte: fechaLimite }
    };
    if (userId) {
        filtro.userId = userId;
    }
    return this.find(filtro).sort({ fechaVencimiento: 1 });
};

pagoFinanciamientoSchema.statics.obtenerEstadisticas = async function(userId = null, fechaInicio = null, fechaFin = null) {
    let filtro = {};
    if (userId) filtro.userId = userId;
    
    if (fechaInicio || fechaFin) {
        filtro.fechaPago = {};
        if (fechaInicio) filtro.fechaPago.$gte = new Date(fechaInicio);
        if (fechaFin) filtro.fechaPago.$lte = new Date(fechaFin);
    }
    
    const pipeline = [
        { $match: filtro },
        {
            $group: {
                _id: null,
                totalPagos: { $sum: 1 },
                pagosProcesados: {
                    $sum: { $cond: [{ $eq: ['$estado', 'procesado'] }, 1, 0] }
                },
                pagosPendientes: {
                    $sum: { $cond: [{ $eq: ['$estado', 'pendiente'] }, 1, 0] }
                },
                pagosVencidos: {
                    $sum: { $cond: [{ $and: [
                        { $eq: ['$estado', 'pendiente'] },
                        { $lt: ['$fechaVencimiento', new Date()] }
                    ]}, 1, 0] }
                },
                montoTotalProgramado: { $sum: '$montoTotal' },
                montoTotalPagado: { $sum: '$montoPagado' },
                totalCapitalPagado: { $sum: '$montoCapital' },
                totalInteresesPagados: { $sum: '$montoInteres' },
                totalComisionesPagadas: { $sum: '$montoComision' },
                totalMoraPagada: { $sum: '$montoMora' }
            }
        }
    ];
    
    const resultado = await this.aggregate(pipeline);
    return resultado[0] || {
        totalPagos: 0,
        pagosProcesados: 0,
        pagosPendientes: 0,
        pagosVencidos: 0,
        montoTotalProgramado: 0,
        montoTotalPagado: 0,
        totalCapitalPagado: 0,
        totalInteresesPagados: 0,
        totalComisionesPagadas: 0,
        totalMoraPagada: 0
    };
};

pagoFinanciamientoSchema.statics.generarPagosParaPrestamo = async function(prestamo, userData) {
    const tablaAmortizacion = prestamo.obtenerTablaAmortizacion();
    const pagos = [];
    
    for (const cuota of tablaAmortizacion) {
        const pago = new this({
            prestamoId: prestamo._id,
            numeroCuota: cuota.cuota,
            tipo: 'cuota_regular',
            estado: 'pendiente',
            montoTotal: cuota.cuotaMensual,
            montoCapital: cuota.amortizacion,
            montoInteres: cuota.interes,
            montoComision: 0,
            montoMora: 0,
            moneda: prestamo.moneda,
            fechaProgramada: cuota.fechaPago,
            fechaVencimiento: new Date(cuota.fechaPago.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 días después
            saldoAnterior: cuota.saldoPendiente + cuota.amortizacion,
            saldoPosterior: cuota.saldoPendiente,
            responsable: {
                nombre: userData.creatorName,
                email: userData.creatorEmail
            },
            ...userData
        });
        
        pagos.push(pago);
    }
    
    return await this.insertMany(pagos);
};

module.exports = mongoose.model('PagoFinanciamiento', pagoFinanciamientoSchema);
