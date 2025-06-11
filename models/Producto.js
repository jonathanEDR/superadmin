const mongoose = require('mongoose');
// Crear un nuevo esquema para el contador
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

const productoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  precio: {
    type: Number,
    required: true,
    min: 0
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
  cantidadRestante: {
    type: Number,
    default: function() {
      return this.cantidad - (this.cantidadVendida || 0);
    }
  },
  userId: {
    type: String,
    required: true
  },
  creatorId: {
    type: String,
    required: true,
    index: true // Añadir índice para búsquedas más rápidas
  },
  creatorName: {
    type: String,
    required: true
  },
  productoNumero: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true, // Añadir createdAt y updatedAt
  toJSON: { virtuals: true }, // Incluir campos virtuales en JSON
  toObject: { virtuals: true }
});

// Middleware pre-save para generar el número de producto
productoSchema.pre('save', async function(next) {
  try {
    if (this.isNew) {
      const counter = await Counter.findByIdAndUpdate(
        'productoNumero',
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      this.productoNumero = counter.seq;
    }
    this.cantidadRestante = this.cantidad - (this.cantidadVendida || 0);
    next();
  } catch (error) {
    next(error);
  }
});

const Producto = mongoose.model('Producto', productoSchema);

module.exports = Producto;
