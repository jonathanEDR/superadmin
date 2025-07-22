const mongoose = require('mongoose');

const inventarioProductoProduccionSchema = new mongoose.Schema({
    catalogoProductoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CatalogoProduccion',
        required: true,
        unique: true,
        index: true
    },
    // NUEVO: Campo nombre para facilitar consultas directas
    nombre: {
        type: String,
        trim: true,
        index: true
    },
    stock: {
        type: Number,
        required: true,
        min: 0,
        default: 0
    },
    stockMinimo: {
        type: Number,
        min: 0,
        default: 0
    },
    stockMaximo: {
        type: Number,
        min: 0,
        default: null
    },
    unidadMedida: {
        type: String,
        required: true,
        trim: true
    },
    costoUnitario: {
        type: Number,
        min: 0,
        default: 0
    },
    fechaUltimaActualizacion: {
        type: Date,
        default: Date.now
    },
    estado: {
        type: String,
        enum: ['activo', 'inactivo', 'agotado'],
        default: 'activo'
    },
    observaciones: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Método para actualizar stock
inventarioProductoProduccionSchema.methods.actualizarStock = function(cantidad, operacion = 'agregar') {
    const cantidadAnterior = this.stock;
    
    if (operacion === 'agregar') {
        this.stock += cantidad;
    } else if (operacion === 'restar') {
        this.stock = Math.max(0, this.stock - cantidad);
    } else if (operacion === 'establecer') {
        this.stock = Math.max(0, cantidad);
    }
    
    this.fechaUltimaActualizacion = new Date();
    
    // Actualizar estado basado en stock
    if (this.stock === 0) {
        this.estado = 'agotado';
    } else if (this.stock > 0) {
        this.estado = 'activo';
    }
    
    return {
        cantidadAnterior,
        cantidadNueva: this.stock,
        diferencia: this.stock - cantidadAnterior
    };
};

// Método estático para obtener o crear inventario de producto
inventarioProductoProduccionSchema.statics.obtenerOCrear = async function(catalogoProductoId, datosIniciales = {}) {
    let inventario = await this.findOne({ catalogoProductoId });
    
    if (!inventario) {
        // Si no existe, crear uno nuevo con stock 0
        inventario = new this({
            catalogoProductoId,
            stock: 0,
            unidadMedida: datosIniciales.unidadMedida || 'unidad',
            costoUnitario: datosIniciales.costoUnitario || 0,
            ...datosIniciales
        });
        await inventario.save();
    }
    
    return inventario;
};

// Método estático para buscar con información del catálogo
inventarioProductoProduccionSchema.statics.buscarConCatalogo = async function(filtros = {}) {
    return this.find(filtros)
        .populate('catalogoProductoId', 'nombre descripcion categoria precio')
        .sort({ 'fechaUltimaActualizacion': -1 });
};

// Índices para optimizar consultas
inventarioProductoProduccionSchema.index({ catalogoProductoId: 1 });
inventarioProductoProduccionSchema.index({ stock: 1 });
inventarioProductoProduccionSchema.index({ estado: 1 });

module.exports = mongoose.models.InventarioProductoProduccion 
    || mongoose.model('InventarioProductoProduccion', inventarioProductoProduccionSchema);
