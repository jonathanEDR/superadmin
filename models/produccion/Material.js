const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    // Referencia al catálogo de producción (requerida)
    productoReferencia: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CatalogoProduccion',
        required: true
    },
    // Tipo de material: solo 'catalogo'
    tipoMaterial: {
        type: String,
        enum: ['catalogo'],
        default: 'catalogo'
    },
    unidadMedida: {
        type: String,
        required: true,
        enum: ['kg', 'gr', 'lt', 'ml', 'unidad', 'pieza', 'metro', 'rollo', 'caja']
    },
    cantidad: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    consumido: {
        type: Number,
        default: 0,
        min: 0
    },
    stockMinimo: {
        type: Number,
        default: 0,
        min: 0
    },
    precioUnitario: {
        type: Number,
        default: 0,
        min: 0
    },
    // Campos específicos para materiales
    proveedor: {
        type: String,
        trim: true
    },
    numeroLote: {
        type: String,
        trim: true
    },
    fechaVencimiento: {
        type: Date
    },
    ubicacionAlmacen: {
        type: String,
        trim: true
    },
    stockMinimo: {
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
materialSchema.virtual('disponible').get(function() {
    return this.cantidad - this.consumido;
});

// Virtual para verificar si está por debajo del stock mínimo
materialSchema.virtual('bajoStock').get(function() {
    return this.disponible <= this.stockMinimo;
});

// Virtual para calcular el valor total del material
materialSchema.virtual('valorTotal').get(function() {
    return this.disponible * this.precioUnitario;
});

// Método para verificar disponibilidad
materialSchema.methods.verificarDisponibilidad = function(cantidadRequerida) {
    return this.disponible >= cantidadRequerida;
};

// Método para consumir material
materialSchema.methods.consumir = async function(cantidad, motivo = 'Consumido en producción', operador = 'sistema') {
    if (this.verificarDisponibilidad(cantidad)) {
        const cantidadAnterior = this.consumido;
        this.consumido += cantidad;
        
        // Registrar movimiento de inventario
        try {
            const MovimientoInventario = require('./MovimientoInventario');
            await MovimientoInventario.registrarMovimiento({
                tipo: 'consumo',
                item: this._id,
                tipoItem: 'Material',
                cantidad: cantidad,
                cantidadAnterior: cantidadAnterior,
                cantidadNueva: this.consumido,
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

// Método para restaurar material (devolver al inventario)
materialSchema.methods.restaurar = async function(cantidad, motivo = 'Restaurado al inventario', operador = 'sistema') {
    if (this.consumido >= cantidad) {
        const cantidadAnterior = this.consumido;
        this.consumido -= cantidad;
        
        // Registrar movimiento de inventario
        try {
            const MovimientoInventario = require('./MovimientoInventario');
            await MovimientoInventario.registrarMovimiento({
                tipo: 'restauracion',
                item: this._id,
                tipoItem: 'Material',
                cantidad: cantidad,
                cantidadAnterior: cantidadAnterior,
                cantidadNueva: this.consumido,
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

// Método para agregar stock
materialSchema.methods.agregarStock = async function(cantidad, motivo = 'Entrada de material', operador = 'sistema') {
    const cantidadAnterior = this.cantidad;
    this.cantidad += cantidad;
    
    // Registrar movimiento de inventario
    try {
        const MovimientoInventario = require('./MovimientoInventario');
        await MovimientoInventario.registrarMovimiento({
            tipo: 'entrada',
            item: this._id,
            tipoItem: 'Material',
            cantidad: cantidad,
            cantidadAnterior: cantidadAnterior,
            cantidadNueva: this.cantidad,
            motivo: motivo,
            operador: operador
        });
    } catch (error) {
        console.warn('No se pudo registrar movimiento de inventario:', error.message);
    }
    
    return true;
};

// Método para ajustar inventario
materialSchema.methods.ajustar = async function(nuevaCantidad, motivo = 'Ajuste de inventario', operador = 'sistema') {
    const cantidadAnterior = this.cantidad;
    const diferencia = nuevaCantidad - cantidadAnterior;
    this.cantidad = nuevaCantidad;
    
    // Registrar movimiento de inventario
    try {
        const MovimientoInventario = require('./MovimientoInventario');
        await MovimientoInventario.registrarMovimiento({
            tipo: diferencia >= 0 ? 'ajuste_positivo' : 'ajuste_negativo',
            item: this._id,
            tipoItem: 'Material',
            cantidad: Math.abs(diferencia),
            cantidadAnterior: cantidadAnterior,
            cantidadNueva: this.cantidad,
            motivo: motivo,
            operador: operador
        });
    } catch (error) {
        console.warn('No se pudo registrar movimiento de inventario:', error.message);
    }
    
    return true;
};

// Índices para optimizar consultas
materialSchema.index({ nombre: 1 });
materialSchema.index({ activo: 1 });
materialSchema.index({ productoReferencia: 1 });
materialSchema.index({ proveedor: 1 });
materialSchema.index({ fechaVencimiento: 1 });
materialSchema.index({ stockMinimo: 1 });

module.exports = mongoose.model('Material', materialSchema);
