const mongoose = require('mongoose');

const prestamoSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    // Información básica del préstamo
    tipo: {
        type: String,
        required: true,
        enum: ['personal', 'hipotecario', 'vehicular', 'comercial', 'microempresa', 'capital_trabajo', 'inversion'],
        default: 'personal'
    },
    estado: {
        type: String,
        required: true,
        enum: ['solicitado', 'aprobado', 'desembolsado', 'activo', 'vencido', 'cancelado', 'rechazado'],
        default: 'solicitado'
    },
    // Datos financieros
    montoSolicitado: {
        type: Number,
        required: true,
        min: 0
    },
    montoAprobado: {
        type: Number,
        min: 0
    },
    montoDesembolsado: {
        type: Number,
        default: 0,
        min: 0
    },
    saldoPendiente: {
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
    // Condiciones del préstamo
    tasaInteres: {
        type: Number,
        required: true,
        min: 0,
        max: 100 // Porcentaje
    },
    tipoTasa: {
        type: String,
        required: true,
        enum: ['fija', 'variable'],
        default: 'fija'
    },
    plazoMeses: {
        type: Number,
        required: true,
        min: 1
    },
    cuotaMensual: {
        type: Number,
        min: 0
    },
    // Fechas importantes
    fechaSolicitud: {
        type: Date,
        required: true,
        default: Date.now
    },
    fechaAprobacion: {
        type: Date
    },
    fechaDesembolso: {
        type: Date
    },
    fechaVencimiento: {
        type: Date
    },
    fechaProximoPago: {
        type: Date
    },
    // Información del solicitante/prestatario
    prestatario: {
        nombre: {
            type: String,
            required: true,
            trim: true
        },
        documento: {
            tipo: {
                type: String,
                required: true,
                enum: ['DNI', 'CE', 'RUC', 'PASAPORTE'],
                default: 'DNI'
            },
            numero: {
                type: String,
                required: true,
                trim: true
            }
        },
        email: {
            type: String,
            trim: true,
            lowercase: true
        },
        telefono: {
            type: String,
            trim: true
        },
        direccion: {
            type: String,
            trim: true
        }
    },
    // Entidad financiera
    entidadFinanciera: {
        nombre: {
            type: String,
            required: true,
            trim: true
        },
        tipo: {
            type: String,
            required: true,
            enum: ['banco', 'cooperativa', 'financiera', 'prestamista', 'otro'],
            default: 'banco'
        },
        numeroCredito: {
            type: String,
            trim: true
        },
        ejecutivo: {
            nombre: String,
            telefono: String,
            email: String
        }
    },
    // Garantías
    garantias: [{
        tipo: {
            type: String,
            enum: ['hipotecaria', 'vehicular', 'fianza', 'deposito', 'aval', 'ninguna'],
            default: 'ninguna'
        },
        descripcion: String,
        valorEstimado: Number,
        documentos: [String]
    }],
    // Cuenta de desembolso
    cuentaDesembolso: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CuentaBancaria'
    },
    // Cuenta de pago (de donde se debitarán las cuotas)
    cuentaPago: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CuentaBancaria'
    },
    // Configuración de pagos
    configuracionPago: {
        diaCorte: {
            type: Number,
            min: 1,
            max: 31,
            default: 1
        },
        diaPago: {
            type: Number,
            min: 1,
            max: 31,
            default: 15
        },
        autopago: {
            type: Boolean,
            default: false
        }
    },
    // Comisiones y gastos
    comisiones: {
        apertura: {
            monto: { type: Number, default: 0 },
            porcentaje: { type: Number, default: 0 }
        },
        administracion: {
            monto: { type: Number, default: 0 },
            porcentaje: { type: Number, default: 0 }
        },
        mora: {
            tasa: { type: Number, default: 0 },
            tipo: { type: String, enum: ['diaria', 'mensual'], default: 'diaria' }
        }
    },
    // Estadísticas del préstamo
    estadisticas: {
        cuotasPagadas: { type: Number, default: 0 },
        cuotasPendientes: { type: Number, default: 0 },
        diasVencidos: { type: Number, default: 0 },
        totalInteresesPagados: { type: Number, default: 0 },
        totalComisionesPagadas: { type: Number, default: 0 }
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
    // Notas y observaciones
    descripcion: {
        type: String,
        trim: true
    },
    observaciones: {
        type: String,
        trim: true
    },
    documentos: [{
        nombre: String,
        url: String,
        fechaSubida: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true,
    collection: 'prestamos'
});

// Índices para optimizar consultas
prestamoSchema.index({ userId: 1, estado: 1 });
prestamoSchema.index({ 'prestatario.documento.numero': 1 });
prestamoSchema.index({ fechaVencimiento: 1 });
prestamoSchema.index({ fechaProximoPago: 1 });
prestamoSchema.index({ 'entidadFinanciera.nombre': 1 });
prestamoSchema.index({ createdAt: -1 });

// Middleware para generar código automático
prestamoSchema.pre('save', async function(next) {
    if (this.isNew && !this.codigo) {
        const ultimoPrestamo = await this.constructor.findOne(
            { userId: this.userId },
            {},
            { sort: { codigo: -1 } }
        );
        
        let numeroSecuencial = 1;
        if (ultimoPrestamo && ultimoPrestamo.codigo) {
            const match = ultimoPrestamo.codigo.match(/PREST(\d+)$/);
            if (match) {
                numeroSecuencial = parseInt(match[1]) + 1;
            }
        }
        
        this.codigo = `PREST${numeroSecuencial.toString().padStart(3, '0')}`;
    }
    
    // Calcular fecha de vencimiento si no existe
    if (this.isNew && this.fechaDesembolso && !this.fechaVencimiento) {
        const fechaVenc = new Date(this.fechaDesembolso);
        fechaVenc.setMonth(fechaVenc.getMonth() + this.plazoMeses);
        this.fechaVencimiento = fechaVenc;
    }
    
    // Establecer saldo pendiente igual al monto aprobado si es nuevo
    if (this.isNew && this.montoAprobado && this.saldoPendiente === 0) {
        this.saldoPendiente = this.montoAprobado;
    }
    
    // Calcular cuotas pendientes
    if (this.plazoMeses && this.estadisticas.cuotasPagadas !== undefined) {
        this.estadisticas.cuotasPendientes = this.plazoMeses - this.estadisticas.cuotasPagadas;
    }
    
    next();
});

// Middleware para calcular cuota mensual antes de guardar
prestamoSchema.pre('save', function(next) {
    if (this.montoAprobado && this.tasaInteres && this.plazoMeses && !this.cuotaMensual) {
        this.cuotaMensual = this.calcularCuotaMensual();
    }
    next();
});

// Métodos de instancia
prestamoSchema.methods.calcularCuotaMensual = function() {
    if (!this.montoAprobado || !this.tasaInteres || !this.plazoMeses) {
        return 0;
    }
    
    const capital = this.montoAprobado;
    const tasaMensual = this.tasaInteres / 100 / 12;
    const numeroCuotas = this.plazoMeses;
    
    if (tasaMensual === 0) {
        return capital / numeroCuotas;
    }
    
    const cuota = capital * (tasaMensual * Math.pow(1 + tasaMensual, numeroCuotas)) / 
                 (Math.pow(1 + tasaMensual, numeroCuotas) - 1);
    
    return Math.round(cuota * 100) / 100;
};

prestamoSchema.methods.aprobar = function(montoAprobado, fechaAprobacion = new Date()) {
    this.estado = 'aprobado';
    this.montoAprobado = montoAprobado;
    this.fechaAprobacion = fechaAprobacion;
    this.saldoPendiente = montoAprobado;
    this.cuotaMensual = this.calcularCuotaMensual();
    return this.save();
};

prestamoSchema.methods.desembolsar = function(montoDesembolsado, fechaDesembolso = new Date()) {
    if (this.estado !== 'aprobado') {
        throw new Error('El préstamo debe estar aprobado para desembolsar');
    }
    
    this.estado = 'desembolsado';
    this.montoDesembolsado = montoDesembolsado;
    this.fechaDesembolso = fechaDesembolso;
    
    // Calcular fecha de vencimiento
    const fechaVenc = new Date(fechaDesembolso);
    fechaVenc.setMonth(fechaVenc.getMonth() + this.plazoMeses);
    this.fechaVencimiento = fechaVenc;
    
    // Calcular primera fecha de pago
    const fechaPrimerPago = new Date(fechaDesembolso);
    fechaPrimerPago.setMonth(fechaPrimerPago.getMonth() + 1);
    fechaPrimerPago.setDate(this.configuracionPago.diaPago);
    this.fechaProximoPago = fechaPrimerPago;
    
    return this.save();
};

prestamoSchema.methods.activar = function() {
    if (this.estado === 'desembolsado') {
        this.estado = 'activo';
        return this.save();
    }
    throw new Error('El préstamo debe estar desembolsado para activarse');
};

prestamoSchema.methods.cancelar = function(motivoCancelacion = '') {
    this.estado = 'cancelado';
    this.saldoPendiente = 0;
    this.observaciones = (this.observaciones || '') + `\nCancelado: ${motivoCancelacion}`;
    return this.save();
};

prestamoSchema.methods.marcarVencido = function() {
    this.estado = 'vencido';
    
    // Calcular días vencidos
    if (this.fechaProximoPago) {
        const hoy = new Date();
        const diasVencidos = Math.floor((hoy - this.fechaProximoPago) / (1000 * 60 * 60 * 24));
        this.estadisticas.diasVencidos = Math.max(0, diasVencidos);
    }
    
    return this.save();
};

prestamoSchema.methods.obtenerTablaAmortizacion = function() {
    if (!this.montoAprobado || !this.tasaInteres || !this.plazoMeses) {
        return [];
    }
    
    const capital = this.montoAprobado;
    const tasaMensual = this.tasaInteres / 100 / 12;
    const cuotaMensual = this.cuotaMensual || this.calcularCuotaMensual();
    
    let saldoCapital = capital;
    const tabla = [];
    
    for (let i = 1; i <= this.plazoMeses; i++) {
        const interes = saldoCapital * tasaMensual;
        const amortizacion = cuotaMensual - interes;
        saldoCapital -= amortizacion;
        
        // Calcular fecha de pago
        const fechaPago = new Date(this.fechaDesembolso || this.fechaSolicitud);
        fechaPago.setMonth(fechaPago.getMonth() + i);
        fechaPago.setDate(this.configuracionPago.diaPago);
        
        tabla.push({
            cuota: i,
            fechaPago: fechaPago,
            cuotaMensual: Math.round(cuotaMensual * 100) / 100,
            interes: Math.round(interes * 100) / 100,
            amortizacion: Math.round(amortizacion * 100) / 100,
            saldoPendiente: Math.round(Math.max(0, saldoCapital) * 100) / 100,
            pagado: i <= this.estadisticas.cuotasPagadas
        });
    }
    
    return tabla;
};

// Métodos estáticos
prestamoSchema.statics.obtenerPorUsuario = function(userId, estado = null) {
    const filtro = { userId };
    if (estado) {
        if (Array.isArray(estado)) {
            filtro.estado = { $in: estado };
        } else {
            filtro.estado = estado;
        }
    }
    return this.find(filtro).sort({ createdAt: -1 });
};

prestamoSchema.statics.obtenerPorEntidad = function(entidad, userId = null) {
    const filtro = { 'entidadFinanciera.nombre': entidad };
    if (userId) {
        filtro.userId = userId;
    }
    return this.find(filtro).sort({ createdAt: -1 });
};

prestamoSchema.statics.obtenerVencidos = function(userId = null) {
    const hoy = new Date();
    const filtro = {
        estado: { $in: ['activo', 'desembolsado'] },
        fechaProximoPago: { $lt: hoy }
    };
    if (userId) {
        filtro.userId = userId;
    }
    return this.find(filtro).sort({ fechaProximoPago: 1 });
};

prestamoSchema.statics.obtenerProximosVencer = function(dias = 30, userId = null) {
    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(hoy.getDate() + dias);
    
    const filtro = {
        estado: { $in: ['activo', 'desembolsado'] },
        fechaProximoPago: { $gte: hoy, $lte: fechaLimite }
    };
    if (userId) {
        filtro.userId = userId;
    }
    return this.find(filtro).sort({ fechaProximoPago: 1 });
};

prestamoSchema.statics.obtenerEstadisticas = async function(userId = null) {
    const filtro = userId ? { userId } : {};
    
    const pipeline = [
        { $match: filtro },
        {
            $group: {
                _id: null,
                totalPrestamos: { $sum: 1 },
                prestamosActivos: {
                    $sum: { $cond: [{ $in: ['$estado', ['activo', 'desembolsado']] }, 1, 0] }
                },
                prestamosPendientes: {
                    $sum: { $cond: [{ $eq: ['$estado', 'solicitado'] }, 1, 0] }
                },
                prestamosVencidos: {
                    $sum: { $cond: [{ $eq: ['$estado', 'vencido'] }, 1, 0] }
                },
                montoTotalSolicitado: { $sum: '$montoSolicitado' },
                montoTotalAprobado: { $sum: '$montoAprobado' },
                saldoTotalPendiente: { $sum: '$saldoPendiente' },
                totalInteresesPagados: { $sum: '$estadisticas.totalInteresesPagados' }
            }
        }
    ];
    
    const resultado = await this.aggregate(pipeline);
    return resultado[0] || {
        totalPrestamos: 0,
        prestamosActivos: 0,
        prestamosPendientes: 0,
        prestamosVencidos: 0,
        montoTotalSolicitado: 0,
        montoTotalAprobado: 0,
        saldoTotalPendiente: 0,
        totalInteresesPagados: 0
    };
};

module.exports = mongoose.model('Prestamo', prestamoSchema);
