const mongoose = require('mongoose');

const residuoSchema = new mongoose.Schema({
  fecha: {
    type: Date,
    required: true,
    default: Date.now
  },
  tipoProducto: {
    type: String,
    required: true,
    enum: ['ingrediente', 'material', 'receta', 'produccion'],
    index: true
  },
  productoId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  productoNombre: {
    type: String,
    required: true
  },
  cantidadPerdida: {
    type: Number,
    required: true,
    min: 0
  },
  unidadMedida: {
    type: String,
    required: true
  },
  motivo: {
    type: String,
    required: true,
    enum: ['vencido', 'dañado', 'merma', 'error_proceso', 'otros'],
    index: true
  },
  observaciones: {
    type: String,
    maxlength: 500
  },
  costoEstimado: {
    type: Number,
    default: 0,
    min: 0
  },
  operador: {
    type: String,
    required: true
  },
  activo: {
    type: Boolean,
    default: true,
    index: true
  },
  fechaCreacion: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Índices compuestos para consultas frecuentes
residuoSchema.index({ fecha: -1, tipoProducto: 1 });
residuoSchema.index({ productoId: 1, tipoProducto: 1 });
residuoSchema.index({ operador: 1, fecha: -1 });

module.exports = mongoose.model('Residuo', residuoSchema);
