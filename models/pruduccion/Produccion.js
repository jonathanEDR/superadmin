const mongoose = require('mongoose');

const ingredienteUtilizadoSchema = new mongoose.Schema({
    ingrediente: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingrediente',
        required: true
    },
    cantidadUtilizada: {
        type: Number,
        required: true,
        min: 0
    },
    costoUnitario: {
        type: Number,
        default: 0
    }
});

const recetaUtilizadaSchema = new mongoose.Schema({
    receta: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RecetaProducto',
        required: true
    },
    cantidadUtilizada: {
        type: Number,
        required: true,
        min: 0
    },
    costoUnitario: {
        type: Number,
        default: 0
    }
});

const produccionSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    receta: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RecetaProducto'
    },
    // Para compatibilidad con el sistema anterior
    items: [{
        ingrediente: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Ingrediente'
        },
        cantidadUtilizada: {
            type: Number,
            min: 0
        }
    }],
    // Nueva estructura para producción manual
    ingredientesUtilizados: [ingredienteUtilizadoSchema],
    recetasUtilizadas: [recetaUtilizadaSchema],
    tipo: {
        type: String,
        enum: ['receta', 'manual'],
        default: 'manual'
    },
    cantidadProducida: {
        type: Number,
        required: true,
        min: 1
    },
    unidadMedida: {
        type: String,
        required: true
    },
    fechaProduccion: {
        type: Date,
        default: Date.now
    },
    estado: {
        type: String,
        enum: ['planificada', 'en_proceso', 'completada', 'cancelada'],
        default: 'planificada'
    },
    costoTotal: {
        type: Number,
        default: 0
    },
    observaciones: {
        type: String,
        trim: true
    },
    operador: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

// Método para calcular el costo total de producción
produccionSchema.methods.calcularCosto = async function() {
    let costoTotal = 0;

    // Si es producción manual nueva
    if (this.tipo === 'manual') {
        // Calcular costo de ingredientes básicos
        for (const item of this.ingredientesUtilizados) {
            costoTotal += item.cantidadUtilizada * item.costoUnitario;
        }

        // Calcular costo de recetas preparadas
        for (const item of this.recetasUtilizadas) {
            costoTotal += item.cantidadUtilizada * item.costoUnitario;
        }
    } else {
        // Compatibilidad con el sistema anterior (items)
        await this.populate('items.ingrediente');
        for (const item of this.items) {
            const costo = item.ingrediente.costoUnitario || 0;
            costoTotal += item.cantidadUtilizada * costo;
        }
    }

    this.costoTotal = costoTotal;
    await this.save();
    return costoTotal;
};

// Método para ejecutar la producción
produccionSchema.methods.ejecutarProduccion = async function() {
    if (this.estado !== 'planificada') {
        throw new Error('Solo se pueden ejecutar producciones planificadas');
    }
    
    // Verificar disponibilidad de ingredientes
    await this.populate('items.ingrediente');
    
    for (const item of this.items) {
        if (!item.ingrediente.verificarDisponibilidad(item.cantidadUtilizada)) {
            throw new Error(`Ingrediente ${item.ingrediente.nombre} no disponible en cantidad suficiente`);
        }
    }
    
    // Consumir ingredientes
    for (const item of this.items) {
        item.ingrediente.consumir(item.cantidadUtilizada);
        await item.ingrediente.save();
    }
    
    this.estado = 'completada';
    await this.calcularCosto();
    await this.save();
    
    return this;
};

module.exports = mongoose.model('Produccion', produccionSchema);