const mongoose = require('mongoose');

const recetaIngredienteSchema = new mongoose.Schema({
    ingrediente: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingrediente',
        required: true
    },
    cantidad: {
        type: Number,
        required: true,
        min: 0
    },
    unidadMedida: {
        type: String,
        required: true
    }
});

const recetaProductoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    descripcion: {
        type: String,
        trim: true
    },
    ingredientes: [recetaIngredienteSchema],
    rendimiento: {
        cantidad: {
            type: Number,
            required: true,
            min: 1
        },
        unidadMedida: {
            type: String,
            required: true
        }
    },
    tiempoPreparacion: {
        type: Number, // en minutos
        default: 0
    },
    categoria: {
        type: String,
        enum: ['producto_terminado', 'producto_intermedio', 'preparado'],
        default: 'producto_terminado'
    },
    // Control de inventario de recetas
    inventario: {
        cantidadProducida: {
            type: Number,
            default: 0,
            min: 0
        },
        cantidadUtilizada: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual para calcular el inventario disponible
recetaProductoSchema.virtual('inventarioDisponible').get(function() {
    return this.inventario.cantidadProducida - this.inventario.cantidadUtilizada;
});

// Método para verificar disponibilidad de inventario de receta
recetaProductoSchema.methods.verificarDisponibilidadInventario = function(cantidadRequerida) {
    return this.inventarioDisponible >= cantidadRequerida;
};

// Método para usar receta (descontar del inventario)
recetaProductoSchema.methods.usarReceta = async function(cantidad, motivo = 'Utilizada en producción') {
    if (!this.verificarDisponibilidadInventario(cantidad)) {
        throw new Error(`Inventario insuficiente de receta ${this.nombre}. Disponible: ${this.inventarioDisponible}, Requerido: ${cantidad}`);
    }
    
    this.inventario.cantidadUtilizada += cantidad;
    await this.save();
    
    // Registrar movimiento de inventario
    const MovimientoInventario = require('./MovimientoInventario');
    await MovimientoInventario.registrarMovimiento({
        tipo: 'salida',
        item: this._id,
        tipoItem: 'RecetaProducto',
        cantidad: cantidad,
        cantidadAnterior: this.inventario.cantidadUtilizada - cantidad,
        cantidadNueva: this.inventario.cantidadUtilizada,
        motivo: motivo,
        operador: 'sistema'
    });
};

// Método para agregar al inventario (cuando se produce)
recetaProductoSchema.methods.agregarAlInventario = async function(cantidad, motivo = 'Producción completada') {
    this.inventario.cantidadProducida += cantidad;
    await this.save();
    
    // Registrar movimiento de inventario
    const MovimientoInventario = require('./MovimientoInventario');
    await MovimientoInventario.registrarMovimiento({
        tipo: 'entrada',
        item: this._id,
        tipoItem: 'RecetaProducto',
        cantidad: cantidad,
        cantidadAnterior: this.inventario.cantidadProducida - cantidad,
        cantidadNueva: this.inventario.cantidadProducida,
        motivo: motivo,
        operador: 'sistema'
    });
};

// Método para calcular costo total de la receta
recetaProductoSchema.methods.calcularCostoTotal = async function() {
    await this.populate('ingredientes.ingrediente');
    let costoTotal = 0;
    
    for (const item of this.ingredientes) {
        costoTotal += item.cantidad * item.ingrediente.precioUnitario;
    }
    
    return costoTotal;
};

// Método para verificar disponibilidad de todos los ingredientes
recetaProductoSchema.methods.verificarDisponibilidadCompleta = async function(cantidadAPrducir = 1) {
    await this.populate('ingredientes.ingrediente');
    
    const faltantes = [];
    
    for (const item of this.ingredientes) {
        const cantidadRequerida = item.cantidad * cantidadAPrducir;
        if (!item.ingrediente.verificarDisponibilidad(cantidadRequerida)) {
            faltantes.push({
                ingrediente: item.ingrediente.nombre,
                requerido: cantidadRequerida,
                disponible: item.ingrediente.total,
                faltante: cantidadRequerida - item.ingrediente.total
            });
        }
    }
    
    return {
        disponible: faltantes.length === 0,
        faltantes
    };
};

module.exports = mongoose.model('RecetaProducto', recetaProductoSchema);