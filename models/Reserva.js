const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema({
  nombreColaborador: {
    type: String,
    required: true,
    trim: true
  },
  productos: [{
    productoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: true
    },
    productoNombre: {
      type: String,
      required: true
    },
    cantidad: {
      type: Number,
      required: true,
      min: 1
    },
    cantidadInicial: {
      type: Number,
      required: true,
      min: 1
    },
    incrementos: [{
      cantidad: {
        type: Number,
        required: true,
        min: 1
      },
      fecha: {
        type: Date,
        default: Date.now
      },
      usuario: {
        type: String,
        required: true
      }
    }],
    decrementos: [{
      cantidad: {
        type: Number,
        required: true,
        min: 1
      },
      fecha: {
        type: Date,
        default: Date.now
      },
      usuario: {
        type: String,
        required: true
      }
    }],
    precioUnitario: {
      type: Number,
      required: true
    },
    subtotal: {
      type: Number,
      required: true
    }
  }],
  fechaReserva: {
    type: Date,
    default: Date.now
  },
  estado: {
    type: String,
    enum: ['activa', 'completada', 'cancelada'],
    default: 'activa'
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
  creatorRole: {
    type: String,
    default: 'user'
  },
  montoTotal: {
    type: Number,
    required: true
  },
  notas: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Índices para optimizar búsquedas
reservaSchema.index({ 'productos.productoId': 1, estado: 1 });
reservaSchema.index({ creatorId: 1 });
reservaSchema.index({ fechaReserva: -1 });

const Reserva = mongoose.model('Reserva', reservaSchema);

module.exports = Reserva;
