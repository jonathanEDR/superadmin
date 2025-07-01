const mongoose = require('mongoose');

const cobroSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'El ID del usuario es requerido'],
    index: true
  },
  creatorId: {
    type: String,
    required: [true, 'El ID del creador es requerido'],
    index: true
  },
  creatorName: {
    type: String,
    required: [true, 'El nombre del creador es requerido'],
    trim: true
  },
  creatorEmail: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/.+@.+\..+/, 'Por favor ingrese un correo válido']
  },
  descripcion: {
    type: String,
    trim: true,
    default: ''
  },
  ventasId: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venta',
    required: [true, 'Al menos una venta es requerida']
  }],
  montoPagado: {
    type: Number,
    required: [true, 'El monto pagado es requerido'],
    min: [0, 'El monto pagado no puede ser negativo']
  },
  montoTotalVentas: {
    type: Number,
    required: [true, 'El monto total de las ventas es requerido'],
    min: [0, 'El monto total no puede ser negativo']
  },
  estadoPago: {
    type: String,
    required: [true, 'El estado de pago es requerido'],
    enum: {
      values: ["Pendiente", "Pagado", "Parcial"],
      message: '{VALUE} no es un estado válido'
    },
    default: 'Pendiente'
  },
  yape: {
    type: Number,
    default: 0,
    min: [0, 'El monto de Yape no puede ser negativo']
  },
  efectivo: {
    type: Number,
    default: 0,
    min: [0, 'El monto en efectivo no puede ser negativo']
  },
  gastosImprevistos: {
    type: Number,
    default: 0,
    min: [0, 'Los gastos imprevistos no pueden ser negativos']
  },
  fechaPago: {
    type: Date,
    default: Date.now,
    required: [true, 'La fecha de pago es requerida']
  },  distribucionPagos: [{
    ventaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venta',
      required: true
    },
    montoPagado: {
      type: Number,
      required: true,
      min: 0
    },
    montoOriginal: {
      type: Number,
      required: true,
      min: 0
    },
    montoPendiente: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  estado: {
    type: String,
    enum: ['procesando', 'completado', 'error'],
    default: 'procesando'
  },
  notasProceso: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para calcular el total de métodos de pago
cobroSchema.virtual('totalMetodosPago').get(function() {
  return (this.yape || 0) + (this.efectivo || 0);
});

// Virtual para calcular el monto pendiente
cobroSchema.virtual('montoPendiente').get(function() {
  return this.montoTotalVentas - this.montoPagado;
});

// Middleware para validar montos
cobroSchema.pre('save', async function(next) {
  try {    // Validar que la suma de yape, efectivo y gastos imprevistos sea igual al montoPagado
    const totalPagado = (this.yape || 0) + (this.efectivo || 0) + (this.gastosImprevistos || 0);
    if (Math.abs(totalPagado - this.montoPagado) > 0.01) { // Usando una pequeña tolerancia para decimales
      throw new Error('La suma de Yape, Efectivo y Gastos Imprevistos debe ser igual al monto pagado');
    }

    // Validar que el monto pagado no exceda el total de las ventas
    if (this.montoPagado > this.montoTotalVentas) {
      throw new Error('El monto pagado no puede ser mayor al total de las ventas');
    }

    // Validar que la fecha de pago no sea futura
    if (this.fechaPago > new Date()) {
      throw new Error('La fecha de pago no puede ser futura');
    }

    // Si es un documento nuevo, validar las ventas
    if (this.isNew) {
      const Venta = mongoose.model('Venta');
      const ventas = await Venta.find({ _id: { $in: this.ventasId } });
      
      if (ventas.length !== this.ventasId.length) {
        throw new Error('Una o más ventas no fueron encontradas');
      }

      // Calcular el total de las ventas y validar permisos
      let totalVentas = 0;
      const userRole = await this.getUserRole();
      
      for (const venta of ventas) {
        // Verificar permisos según el rol
        if (userRole !== 'super_admin' && userRole !== 'admin') {
          if (venta.userId !== this.userId) {
            throw new Error('No tienes permiso para crear cobros para ventas de otros usuarios');
          }
        }
        totalVentas += venta.montoTotal || 0;
      }
      
      this.montoTotalVentas = totalVentas;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Método para obtener el rol del usuario
cobroSchema.methods.getUserRole = async function() {
  const User = mongoose.model('User');
  const user = await User.findOne({ clerk_id: this.userId });
  return user ? user.role : 'user';
};

// Índices para mejorar el rendimiento de las consultas
cobroSchema.index({ userId: 1, fechaPago: -1 });
cobroSchema.index({ ventasId: 1 });
cobroSchema.index({ estado: 1 });

const Cobro = mongoose.model('Cobro', cobroSchema);

module.exports = Cobro;