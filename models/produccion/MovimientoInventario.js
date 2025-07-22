const mongoose = require('mongoose');

const movimientoInventarioSchema = new mongoose.Schema({
    tipo: {
        type: String,
        enum: ['entrada', 'salida', 'ajuste', 'produccion', 'consumo'],
        required: true
    },
    tipoMovimiento: {
        type: String,
        enum: ['produccion', 'manual', 'consumo', 'ajuste', 'compra', 'venta'],
        default: 'manual'
    },
    item: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'tipoItem'
    },
    tipoItem: {
        type: String,
        enum: ['Ingrediente', 'RecetaProducto', 'Material', 'CatalogoProduccion'],
        required: true
    },
    cantidad: {
        type: Number,
        required: true
    },
    cantidadAnterior: {
        type: Number,
        required: true
    },
    cantidadNueva: {
        type: Number,
        required: true
    },
    motivo: {
        type: String,
        required: true,
        trim: true
    },
    precio: {
        type: Number,
        min: 0,
        default: null
    },
    costoTotal: {
        type: Number,
        min: 0,
        default: null
    },
    detalles: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    referencia: {
        tipo: String, // 'produccion', 'compra', 'ajuste', etc.
        id: mongoose.Schema.Types.ObjectId
    },
    fecha: {
        type: Date,
        default: Date.now
    },
    operador: {
        type: String,
        required: true
    },
    observaciones: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Índices para consultas frecuentes
movimientoInventarioSchema.index({ item: 1, fecha: -1 });
movimientoInventarioSchema.index({ tipo: 1, fecha: -1 });
movimientoInventarioSchema.index({ tipoItem: 1, fecha: -1 });
movimientoInventarioSchema.index({ tipoMovimiento: 1, fecha: -1 });
movimientoInventarioSchema.index({ tipoItem: 1, tipoMovimiento: 1, fecha: -1 });

// Método estático para registrar movimiento
movimientoInventarioSchema.statics.registrarMovimiento = async function(datos) {
    const movimiento = new this(datos);
    await movimiento.save();
    return movimiento;
};

module.exports = mongoose.models.MovimientoInventarioProduccion
  || mongoose.model('MovimientoInventarioProduccion', movimientoInventarioSchema);