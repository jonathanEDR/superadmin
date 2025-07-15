const mongoose = require('mongoose');

const movimientoInventarioSchema = new mongoose.Schema({
  inventario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventario',
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: ['ingreso', 'venta', 'devolucion', 'ajuste'],
    required: true
  },
  cantidad: {
    type: Number,
    required: true
  },
  descripcion: {
    type: String,
    default: ''
  },
  usuario: {
    type: String,
    required: true
  },
  fecha: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('MovimientoInventario', movimientoInventarioSchema);
