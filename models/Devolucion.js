const mongoose = require('mongoose');

const devolucionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  ventaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venta',
    required: true
  },
  productoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  fechaDevolucion: {
    type: Date,
    default: Date.now,
    required: true
  },
  cantidadDevuelta: {
    type: Number,
    required: true,
    min: [1, 'La cantidad debe ser al menos 1']
  },
  montoDevolucion: {
    type: Number,
    required: true,
    min: [0, 'El monto no puede ser negativo']
  },
  motivo: {
    type: String,
    required: true,
    minlength: [10, 'El motivo debe tener al menos 10 caracteres']
  },
  estado: {
    type: String,
    enum: ['pendiente', 'aprobada', 'rechazada'],
    default: 'pendiente'
  },
  comentariosAdmin: {
    type: String
  },
  procesadoPor: {
    type: String  // Clerk ID del admin que procesó la devolución
  },
  fechaProcesamiento: {
    type: Date
  }
}, {
  timestamps: true
});

// Middleware pre-save para validaciones adicionales
devolucionSchema.pre('save', async function(next) {
  try {
    if (this.isNew) {
      // Verificar que la venta existe y no está finalizada
      const Venta = mongoose.model('Venta');
      const venta = await Venta.findById(this.ventaId);
      
      if (!venta) {
        throw new Error('La venta especificada no existe');
      }

      if (venta.isFinalized) {
        throw new Error('No se pueden hacer devoluciones en ventas finalizadas');
      }

      // Verificar que la cantidad a devolver no exceda la cantidad vendida
      const productoVendido = venta.productos.find(p => 
        p.productoId.toString() === this.productoId.toString()
      );

      if (!productoVendido) {
        throw new Error('El producto no está en la venta especificada');
      }

      if (this.cantidadDevuelta > productoVendido.cantidad) {
        throw new Error('La cantidad a devolver no puede ser mayor a la cantidad vendida');
      }

      // Verificar que el monto de devolución no exceda el subtotal del producto
      if (this.montoDevolucion > productoVendido.subtotal) {
        throw new Error('El monto de devolución no puede ser mayor al monto original de venta');
      }
    }

    if (this.isModified('estado')) {
      if (this.estado !== 'pendiente' && !this.procesadoPor) {
        throw new Error('Se requiere un procesador para aprobar o rechazar la devolución');
      }
      if (this.estado === 'rechazada' && !this.comentariosAdmin) {
        throw new Error('Se requieren comentarios para rechazar una devolución');
      }
      if (this.estado !== 'pendiente') {
        this.fechaProcesamiento = new Date();
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Devolucion', devolucionSchema);