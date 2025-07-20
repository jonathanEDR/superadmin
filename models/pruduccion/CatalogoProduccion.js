const mongoose = require('mongoose');

const catalogoProduccionSchema = new mongoose.Schema({
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
    descripcion: {
        type: String,
        trim: true
    },
    moduloSistema: {
        type: String,
        required: true,
        enum: ['ingredientes', 'materiales', 'recetas', 'produccion'],
        index: true
    },
    unidadMedida: {
        type: String,
        required: true,
        enum: ['kg', 'gr', 'lt', 'ml', 'unidad', 'pieza', 'porcion'],
        default: 'unidad'
    },
    // Campos de referencia y organización
    categoria: {
        type: String,
        trim: true
    },
    subcategoria: {
        type: String,
        trim: true
    },
    // Información de costos base (opcional)
    costoEstimado: {
        type: Number,
        min: 0,
        default: 0
    },
    // Información nutricional o técnica (opcional)
    especificaciones: {
        peso: Number,
        volumen: Number,
        densidad: Number,
        caducidad: Number, // días
        temperaturaAlmacenamiento: String,
        observaciones: String
    },
    // Control de estado
    activo: {
        type: Boolean,
        default: true
    },
    // Metadatos
    creadoPor: {
        type: String,
        required: true
    },
    fechaCreacion: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Índices para mejorar rendimiento
catalogoProduccionSchema.index({ codigo: 1 });
catalogoProduccionSchema.index({ tipoProduccion: 1 });
catalogoProduccionSchema.index({ activo: 1 });
catalogoProduccionSchema.index({ nombre: 'text', descripcion: 'text' });

// Virtual para obtener código completo
catalogoProduccionSchema.virtual('codigoCompleto').get(function() {
    return `${this.codigo}`;
});

// Método para generar código automático
catalogoProduccionSchema.statics.generarCodigo = async function(tipoProduccion, prefijo) {
    const ultimoProducto = await this.findOne({ 
        tipoProduccion 
    }).sort({ codigo: -1 });
    
    let numeroSiguiente = 1;
    if (ultimoProducto) {
        const match = ultimoProducto.codigo.match(/(\d+)$/);
        if (match) {
            numeroSiguiente = parseInt(match[1]) + 1;
        }
    }
    
    return `${prefijo}${numeroSiguiente.toString().padStart(4, '0')}`;
};

// Validación pre-guardado
catalogoProduccionSchema.pre('save', async function(next) {
    if (this.isNew && !this.codigo) {
        // Auto-generar código si no se proporciona
        await this.populate('tipoProduccion');
        const prefijo = this.tipoProduccion.codigo.substring(0, 3);
        this.codigo = await this.constructor.generarCodigo(this.tipoProduccion._id, prefijo);
    }
    next();
});

module.exports = mongoose.model('CatalogoProduccion', catalogoProduccionSchema);
