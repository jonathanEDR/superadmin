const mongoose = require('mongoose');

const ingredienteSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        index: true
    },
    // Referencia al catálogo de producción (requerida)
    productoReferencia: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CatalogoProduccion',
        required: true,
        index: true
    },
    // Tipo de ingrediente: solo 'catalogo'
    tipoIngrediente: {
        type: String,
        enum: ['catalogo'],
        default: 'catalogo'
    },
    unidadMedida: {
        type: String,
        required: true,
        enum: ['kg', 'gr', 'lt', 'ml', 'unidad', 'pieza']
    },
    cantidad: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    procesado: {
        type: Number,
        default: 0,
        min: 0
    },
    precioUnitario: {
        type: Number,
        default: 0,
        min: 0
    },
    fechaCreacion: {
        type: Date,
        default: Date.now
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

// Virtual para calcular el total disponible
ingredienteSchema.virtual('total').get(function() {
    return this.cantidad - this.procesado;
});

// Método para verificar disponibilidad
ingredienteSchema.methods.verificarDisponibilidad = function(cantidadRequerida) {
    return this.total >= cantidadRequerida;
};

// Método para consumir ingrediente
ingredienteSchema.methods.consumir = async function(cantidad, motivo = 'Consumido en producción', operador = 'sistema') {
    if (this.verificarDisponibilidad(cantidad)) {
        const cantidadAnterior = this.procesado;
        this.procesado += cantidad;
        
        // Registrar movimiento de inventario
        try {
            const MovimientoInventario = require('./MovimientoInventario');
            await MovimientoInventario.registrarMovimiento({
                tipo: 'consumo',
                item: this._id,
                tipoItem: 'Ingrediente',
                cantidad: cantidad,
                cantidadAnterior: cantidadAnterior,
                cantidadNueva: this.procesado,
                motivo: motivo,
                operador: operador
            });
        } catch (error) {
            console.warn('No se pudo registrar movimiento de inventario:', error.message);
        }
        
        return true;
    }
    return false;
};

// Método para restaurar ingrediente (devolver al inventario)
ingredienteSchema.methods.restaurar = async function(cantidad, motivo = 'Restaurado al inventario', operador = 'sistema') {
    if (this.procesado >= cantidad) {
        const cantidadAnterior = this.procesado;
        this.procesado -= cantidad;
        
        // Registrar movimiento de inventario
        try {
            const MovimientoInventario = require('./MovimientoInventario');
            await MovimientoInventario.registrarMovimiento({
                tipo: 'restauracion',
                item: this._id,
                tipoItem: 'Ingrediente',
                cantidad: cantidad,
                cantidadAnterior: cantidadAnterior,
                cantidadNueva: this.procesado,
                motivo: motivo,
                operador: operador
            });
        } catch (error) {
            console.warn('No se pudo registrar movimiento de inventario:', error.message);
        }
        
        return true;
    }
    return false;
};

module.exports = mongoose.model('Ingrediente', ingredienteSchema);