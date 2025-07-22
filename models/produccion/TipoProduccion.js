const mongoose = require('mongoose');

const tipoProduccionSchema = new mongoose.Schema({
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
    color: {
        type: String,
        default: '#6B7280' // Color por defecto para UI
    },
    icono: {
        type: String,
        default: '📦' // Emoji por defecto
    },
    orden: {
        type: Number,
        default: 0
    },
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Índices
tipoProduccionSchema.index({ codigo: 1 });
tipoProduccionSchema.index({ activo: 1 });

// Datos por defecto del sistema
tipoProduccionSchema.statics.crearTiposDefecto = async function() {
    const tiposDefecto = [
        {
            codigo: 'ING_BASE',
            nombre: 'Ingrediente Base',
            descripcion: 'Ingredientes básicos y materias primas',
            color: '#10B981',
            icono: '🥬',
            orden: 1
        },
        {
            codigo: 'REC_PREP',
            nombre: 'Receta Preparada',
            descripcion: 'Productos semi-elaborados o preparaciones base',
            color: '#3B82F6',
            icono: '🍳',
            orden: 2
        },
        {
            codigo: 'PROD_FINAL',
            nombre: 'Producto Final',
            descripcion: 'Productos terminados listos para venta',
            color: '#8B5CF6',
            icono: '🎂',
            orden: 3
        }
    ];

    for (const tipo of tiposDefecto) {
        await this.findOneAndUpdate(
            { codigo: tipo.codigo },
            tipo,
            { upsert: true, new: true }
        );
    }
};

module.exports = mongoose.model('TipoProduccion', tipoProduccionSchema);
