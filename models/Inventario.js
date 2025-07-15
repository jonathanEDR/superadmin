const mongoose = require('mongoose');

const inventarioSchema = new mongoose.Schema({
  catalogo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CatalogoProducto',
    required: true,
    index: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 0
  },
  cantidadVendida: {
    type: Number,
    default: 0,
    min: 0
  },
  cantidadDevuelta: {
    type: Number,
    default: 0,
    min: 0
  },
  userId: {
    type: String,
    required: true
  },
  creatorId: {
    type: String,
    required: true
  },
  creatorName: {
    type: String,
    required: true
  },
  creatorEmail: {
    type: String,
    default: ''
  },
  creatorRole: {
    type: String,
    default: 'user'
  },
  status: {
    type: String,
    enum: ['activo', 'terminado', 'inactivo'],
    default: 'activo'
  },
  fechaAgotamiento: {
    type: Date,
    default: null
  },
  stock_usado: {
    type: String,
    default: '0%'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Inventario', inventarioSchema);
