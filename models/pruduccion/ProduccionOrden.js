const mongoose = require('mongoose');

const produccionOrdenSchema = new mongoose.Schema({
    // Información básica de la orden
    numeroOrden: {
        type: String,
        required: true,
        unique: true
    },
    
    // Referencia a la receta a producir
    receta: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RecetaProducto',
        required: true
    },
    
    // Cantidad a producir
    cantidadSolicitada: {
        type: Number,
        required: true,
        min: 1
    },
    
    cantidadProducida: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // Estado de la producción
    estado: {
        type: String,
        enum: ['pendiente', 'en_proceso', 'completada', 'cancelada'],
        default: 'pendiente'
    },
    
    // Fechas
    fechaCreacion: {
        type: Date,
        default: Date.now
    },
    
    fechaInicio: {
        type: Date
    },
    
    fechaCompletado: {
        type: Date
    },
    
    // Usuario responsable
    usuarioCreador: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    usuarioAsignado: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Prioridad de la orden
    prioridad: {
        type: String,
        enum: ['baja', 'normal', 'alta', 'urgente'],
        default: 'normal'
    },
    
    // Notas y observaciones
    notas: {
        type: String
    },
    
    observaciones: {
        type: String
    },
    
    // Activo/Inactivo
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual para calcular el porcentaje de progreso
produccionOrdenSchema.virtual('porcentajeProgreso').get(function() {
    if (this.cantidadSolicitada === 0) return 0;
    return Math.round((this.cantidadProducida / this.cantidadSolicitada) * 100);
});

// Virtual para calcular la cantidad restante
produccionOrdenSchema.virtual('cantidadRestante').get(function() {
    return Math.max(0, this.cantidadSolicitada - this.cantidadProducida);
});

// Virtual para verificar si está completada
produccionOrdenSchema.virtual('estaCompletada').get(function() {
    return this.cantidadProducida >= this.cantidadSolicitada;
});

// Índices para mejorar el rendimiento
produccionOrdenSchema.index({ estado: 1 });
produccionOrdenSchema.index({ fechaCreacion: -1 });
produccionOrdenSchema.index({ usuarioCreador: 1 });
produccionOrdenSchema.index({ receta: 1 });
produccionOrdenSchema.index({ activo: 1 });

// Middleware pre-save para generar número de orden automático
produccionOrdenSchema.pre('save', async function(next) {
    if (this.isNew && !this.numeroOrden) {
        const count = await this.constructor.countDocuments({});
        this.numeroOrden = `PROD-${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

// Middleware pre-save para actualizar fechas según el estado
produccionOrdenSchema.pre('save', function(next) {
    if (this.isModified('estado')) {
        const now = new Date();
        
        if (this.estado === 'en_proceso' && !this.fechaInicio) {
            this.fechaInicio = now;
        }
        
        if (this.estado === 'completada' && !this.fechaCompletado) {
            this.fechaCompletado = now;
        }
    }
    next();
});

// Métodos del modelo
produccionOrdenSchema.methods.iniciarProduccion = function(usuarioId) {
    this.estado = 'en_proceso';
    this.fechaInicio = new Date();
    if (usuarioId) {
        this.usuarioAsignado = usuarioId;
    }
    return this.save();
};

produccionOrdenSchema.methods.completarProduccion = function(cantidadFinal) {
    this.estado = 'completada';
    this.fechaCompletado = new Date();
    if (cantidadFinal !== undefined) {
        this.cantidadProducida = cantidadFinal;
    }
    return this.save();
};

produccionOrdenSchema.methods.cancelarProduccion = function(motivo) {
    this.estado = 'cancelada';
    if (motivo) {
        this.observaciones = (this.observaciones || '') + `\nCancelada: ${motivo}`;
    }
    return this.save();
};

// Método estático para obtener estadísticas
produccionOrdenSchema.statics.obtenerEstadisticas = async function() {
    const pipeline = [
        {
            $group: {
                _id: '$estado',
                total: { $sum: 1 }
            }
        }
    ];
    
    const estadisticas = await this.aggregate(pipeline);
    
    const resultado = {
        pendiente: 0,
        en_proceso: 0,
        completada: 0,
        cancelada: 0
    };
    
    estadisticas.forEach(stat => {
        resultado[stat._id] = stat.total;
    });
    
    return resultado;
};

module.exports = mongoose.model('ProduccionOrden', produccionOrdenSchema);
