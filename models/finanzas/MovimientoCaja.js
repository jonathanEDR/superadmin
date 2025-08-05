const mongoose = require('mongoose');

const movimientoCajaSchema = new mongoose.Schema({
    // Identificación básica
    codigo: {
        type: String,
        required: false, // Cambiado a false para permitir generación automática
        unique: true,
        uppercase: true,
        validate: {
            validator: function(value) {
                // Solo validar si el documento no es nuevo (después del pre-save)
                return this.isNew ? true : !!value;
            },
            message: 'El código es requerido'
        }
    },
    fecha: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    hora: {
        type: String,
        required: true,
        default: function() {
            return new Date().toLocaleTimeString('es-PE', { 
                hour12: false,
                timeZone: 'America/Lima'
            });
        }
    },

    // === INFORMACIÓN PRINCIPAL ===
    tipo: {
        type: String,
        enum: ['ingreso', 'egreso'],
        required: true,
        index: true
    },
    monto: {
        type: Number,
        required: true,
        min: 0.01
    },
    concepto: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    descripcion: {
        type: String,
        trim: true,
        maxlength: 500
    },

    // === MÉTODO DE PAGO ===
    metodoPago: {
        tipo: {
            type: String,
            enum: ['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta'],
            required: true,
            index: true
        },
        detalles: {
            // Para efectivo
            billetes: {
                b200: { type: Number, default: 0 },
                b100: { type: Number, default: 0 },
                b50: { type: Number, default: 0 },
                b20: { type: Number, default: 0 },
                b10: { type: Number, default: 0 }
            },
            monedas: {
                m5: { type: Number, default: 0 },
                m2: { type: Number, default: 0 },
                m1: { type: Number, default: 0 },
                c50: { type: Number, default: 0 },
                c20: { type: Number, default: 0 },
                c10: { type: Number, default: 0 }
            },
            // Para transferencias/digitales
            numeroOperacion: String,
            cuentaOrigen: String,
            cuentaDestino: String,
            banco: String
        }
    },

    // === CATEGORIZACIÓN ===
    categoria: {
        type: String,
        enum: [
            // Ingresos
            'venta_producto', 'venta_servicio', 'cobro_cliente', 'prestamo_recibido',
            'devolucion', 'otros_ingresos',
            // Egresos  
            'compra_materia_prima', 'pago_proveedor', 'pago_servicio', 'gasto_operativo',
            'pago_prestamo', 'gasto_personal', 'impuestos', 'otros_egresos'
        ],
        required: true,
        index: true
    },
    subcategoria: {
        type: String,
        trim: true
    },

    // === DISTRIBUCIÓN AUTOMÁTICA ===
    distribucion: {
        moduloDestino: {
            type: String,
            enum: ['ventas', 'compras', 'gastos', 'prestamos', 'personal', 'general'],
            index: true
        },
        aplicado: {
            type: Boolean,
            default: false
        },
        fechaAplicacion: Date,
        referenciaModulo: {
            tipo: String, // 'venta', 'gasto', 'prestamo', etc.
            id: mongoose.Schema.Types.ObjectId,
            numero: String
        }
    },

    // === ESTADO Y VALIDACIÓN ===
    estado: {
        type: String,
        enum: ['pendiente', 'validado', 'aplicado', 'anulado'],
        default: 'pendiente',
        index: true
    },
    validacion: {
        validadoPor: String,
        fechaValidacion: Date,
        observaciones: String
    },

    // === INFORMACIÓN DE TRAZABILIDAD ===
    userId: {
        type: String,
        required: true,
        index: true
    },
    creatorId: String,
    creatorName: String,
    creatorEmail: String,

    // === CAMPOS ADICIONALES ===
    documento: {
        tipo: String, // 'boleta', 'factura', 'recibo', etc.
        numero: String,
        serie: String
    },
    cliente: {
        nombre: String,
        documento: String,
        telefono: String
    },
    proveedor: {
        nombre: String,
        ruc: String,
        contacto: String
    },
    observaciones: String

}, {
    timestamps: true,
    collection: 'movimientos_caja_finanzas'
});

// === ÍNDICES ===
movimientoCajaSchema.index({ userId: 1, fecha: -1 });
movimientoCajaSchema.index({ tipo: 1, fecha: -1 });
movimientoCajaSchema.index({ categoria: 1, fecha: -1 });
movimientoCajaSchema.index({ 'metodoPago.tipo': 1, fecha: -1 });
movimientoCajaSchema.index({ estado: 1, fecha: -1 });

// === MIDDLEWARE PRE-SAVE ===
movimientoCajaSchema.pre('save', async function(next) {
    console.log('🔧 PRE-SAVE ejecutándose para:', {
        isNew: this.isNew,
        codigo: this.codigo,
        tipo: this.tipo,
        userId: this.userId
    });
    
    try {
        // Generar código automático
        if (this.isNew && !this.codigo) {
            console.log('📝 Generando código automático...');
            
            const fecha = new Date();
            const año = fecha.getFullYear();
            const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
            const dia = fecha.getDate().toString().padStart(2, '0');
            
            const prefijo = this.tipo === 'ingreso' ? 'ING' : 'EGR';
            const fechaCodigo = `${año}${mes}${dia}`;
            
            console.log('🏷️ Parámetros para código:', { prefijo, fechaCodigo, userId: this.userId });
            
            // Buscar el último número del día con un patrón más específico
            const patronCodigo = `^${prefijo}${fechaCodigo}\\d{4}$`; // Patrón exacto: INGyyyymmdd####
            const ultimoMovimiento = await this.constructor.findOne(
                { 
                    codigo: { $regex: patronCodigo },
                    userId: this.userId
                },
                {},
                { sort: { codigo: -1 } }
            );
            
            console.log('🔍 Último movimiento encontrado:', ultimoMovimiento?.codigo);
            
            let numeroSecuencial = 1;
            if (ultimoMovimiento && ultimoMovimiento.codigo) {
                // Extraer solo los últimos 4 dígitos
                const match = ultimoMovimiento.codigo.match(/(\d{4})$/);
                if (match) {
                    numeroSecuencial = parseInt(match[1]) + 1;
                }
                console.log('📊 Número secuencial calculado:', numeroSecuencial);
            }
            
            this.codigo = `${prefijo}${fechaCodigo}${numeroSecuencial.toString().padStart(4, '0')}`;
            console.log('✅ Código generado:', this.codigo);
        }
        
        // Validar monto de efectivo
        if (this.metodoPago && this.metodoPago.tipo === 'efectivo') {
            console.log('💰 Validando efectivo...');
            const totalBilletes = 
                (this.metodoPago.detalles.billetes.b200 * 200) +
                (this.metodoPago.detalles.billetes.b100 * 100) +
                (this.metodoPago.detalles.billetes.b50 * 50) +
                (this.metodoPago.detalles.billetes.b20 * 20) +
                (this.metodoPago.detalles.billetes.b10 * 10);
                
            const totalMonedas =
                (this.metodoPago.detalles.monedas.m5 * 5) +
                (this.metodoPago.detalles.monedas.m2 * 2) +
                (this.metodoPago.detalles.monedas.m1 * 1) +
                (this.metodoPago.detalles.monedas.c50 * 0.5) +
                (this.metodoPago.detalles.monedas.c20 * 0.2) +
                (this.metodoPago.detalles.monedas.c10 * 0.1);
                
            const totalEfectivo = totalBilletes + totalMonedas;
            
            if (Math.abs(totalEfectivo - this.monto) > 0.01) {
                throw new Error(`El desglose de efectivo (S/ ${totalEfectivo.toFixed(2)}) no coincide con el monto (S/ ${this.monto.toFixed(2)})`);
            }
        }
        
        console.log('🎯 Pre-save completado exitosamente');
        next();
        
    } catch (error) {
        console.error('❌ Error en pre-save:', error);
        next(error);
    }
});

// === MÉTODOS DE INSTANCIA ===
movimientoCajaSchema.methods.validar = function(validadorId, validadorNombre, observaciones = '') {
    this.estado = 'validado';
    this.validacion = {
        validadoPor: validadorNombre,
        fechaValidacion: new Date(),
        observaciones
    };
    return this.save();
};

movimientoCajaSchema.methods.aplicarAModulo = function(moduloDestino, referenciaModulo) {
    this.distribucion.moduloDestino = moduloDestino;
    this.distribucion.aplicado = true;
    this.distribucion.fechaAplicacion = new Date();
    this.distribucion.referenciaModulo = referenciaModulo;
    this.estado = 'aplicado';
    return this.save();
};

movimientoCajaSchema.methods.anular = function(motivo) {
    this.estado = 'anulado';
    this.observaciones = `ANULADO: ${motivo}. ${this.observaciones || ''}`;
    return this.save();
};

// === MÉTODOS ESTÁTICOS ===

// Obtener resumen del día
movimientoCajaSchema.statics.obtenerResumenDia = function(userId, fecha = new Date()) {
    const inicioDia = new Date(fecha);
    inicioDia.setHours(0, 0, 0, 0);
    
    const finDia = new Date(fecha);
    finDia.setHours(23, 59, 59, 999);
    
    return this.aggregate([
        {
            $match: {
                userId,
                fecha: { $gte: inicioDia, $lte: finDia },
                estado: { $ne: 'anulado' }
            }
        },
        {
            $group: {
                _id: '$tipo',
                total: { $sum: '$monto' },
                cantidad: { $sum: 1 },
                metodosUsados: { $addToSet: '$metodoPago.tipo' }
            }
        }
    ]);
};

// Obtener movimientos por período
movimientoCajaSchema.statics.obtenerPorPeriodo = function(userId, fechaInicio, fechaFin, filtros = {}) {
    const match = {
        userId,
        fecha: { $gte: fechaInicio, $lte: fechaFin },
        estado: { $ne: 'anulado' },
        ...filtros
    };
    
    return this.find(match)
        .sort({ fecha: -1, createdAt: -1 })
        .lean();
};

// Obtener total de efectivo en caja
movimientoCajaSchema.statics.obtenerTotalEfectivo = async function(userId, fechaHasta = new Date()) {
    const resultado = await this.aggregate([
        {
            $match: {
                userId,
                fecha: { $lte: fechaHasta },
                'metodoPago.tipo': 'efectivo',
                estado: { $ne: 'anulado' }
            }
        },
        {
            $group: {
                _id: '$tipo',
                total: { $sum: '$monto' }
            }
        }
    ]);
    
    let ingresos = 0;
    let egresos = 0;
    
    resultado.forEach(item => {
        if (item._id === 'ingreso') ingresos = item.total;
        if (item._id === 'egreso') egresos = item.total;
    });
    
    return {
        ingresos,
        egresos,
        saldoActual: ingresos - egresos
    };
};

module.exports = mongoose.model('MovimientoCajaFinanzas', movimientoCajaSchema);
