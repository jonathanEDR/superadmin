const mongoose = require("mongoose");
// Crear un nuevo esquema para el contador
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const ventaSchema = new mongoose.Schema({
  userId: {
    type: String,  // Clerk ID del propietario de la venta
    required: true,
    index: true
  },  creatorId: {
    type: String,  // Clerk ID del usuario que creó la venta
    required: true,
    index: true
  },
  productos: [{
    productoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Producto',
      required: true
    },
    cantidad: { 
      type: Number, 
      required: true 
    },
    cantidadDevuelta: {
      type: Number,
      default: 0
    },
    precioUnitario: { 
      type: Number, 
      required: true 
    },
    subtotal: { 
      type: Number, 
      required: true 
    },
    historial: [{
      operacion: {
        type: Number,
        required: true
      },
      fecha: {
        type: Date,
        default: Date.now
      },
      cantidadAnterior: {
        type: Number,
        required: true
      },
      cantidadNueva: {
        type: Number,
        required: true
      }
    }]
  }],
  montoTotal: { type: Number, required: true },
  montoTotalDevuelto: { 
    type: Number, 
    default: 0 
  },
  cantidadDevuelta: { 
    type: Number, 
    default: 0 
  },
  estadoPago: {
    type: String,
    enum: ["Pendiente", "Pagado", "Parcial"],
    required: true,
  },
  cantidadPagada: { type: Number, default: 0 },
  debe: { type: Number, default: function() { return this.montoTotal - this.cantidadPagada; } }, // Calcular la deuda pendiente

  fechadeVenta: {
    type: Date,
    default: Date.now,  // Establecer fecha por defecto
  },

  isFinalized: {
    type: Boolean,
    default: false
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completionStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: null  // Cambiado de 'pending' a null para que solo se establezca cuando se finalice
  },
  completionDate: {
    type: Date
  },
  completionNotes: {
    type: String
  },
  adminReviewedBy: {
    type: String  // Clerk ID del admin que revisó
  },
  adminReviewedAt: {
    type: Date
  }
},
{
  timestamps: true // Esto agrega createdAt y updatedAt automáticamente
}
);

// Validación adicional para estadoPago "Parcial"
ventaSchema.pre("save", function (next) {
  if (this.estadoPago === "Parcial" && this.cantidadPagada <= 0) {
    return next(
      new Error(
        "La cantidad pagada debe ser mayor a cero cuando el estado es Parcial"
      )
    );
  }

  // Validaciones para el flujo de aprobación
  if (this.isModified('completionStatus')) {
    // No permitir establecer completionStatus si la venta no está finalizada
    if (this.completionStatus && !this.isFinalized) {
      return next(new Error('La venta debe ser finalizada por el usuario antes de poder ser aprobada o rechazada'));
    }

    if (this.completionStatus === 'approved' && !this.adminReviewedBy) {
      return next(new Error('Se requiere un admin para aprobar la venta'));
    }

    if (['approved', 'rejected'].includes(this.completionStatus) && !this.adminReviewedAt) {
      this.adminReviewedAt = new Date();
    }

    if (this.completionStatus === 'rejected' && !this.completionNotes) {
      return next(new Error('Se requieren notas explicando el rechazo'));
    }
  }

  next();
});

// Validación adicional para estados de pago y cantidades
ventaSchema.pre("save", function (next) {
  // Validar estado Parcial
  if (this.estadoPago === "Parcial") {
    if (this.cantidadPagada <= 0) {
      return next(new Error("La cantidad pagada debe ser mayor a cero cuando el estado es Parcial"));
    }
    if (this.cantidadPagada >= this.montoTotal) {
      return next(new Error("La cantidad pagada debe ser menor al monto total cuando el estado es Parcial"));
    }
  }

  // Validar estado Pendiente
  if (this.estadoPago === "Pendiente") {
    this.cantidadPagada = 0;
  }

  // Validar estado Pagado
  if (this.estadoPago === "Pagado") {
    if (this.cantidadPagada !== this.montoTotal) {
      return next(new Error("La cantidad pagada debe ser igual al monto total cuando el estado es Pagado"));
    }
  }

  // Calcular deuda pendiente
  this.debe = this.montoTotal - this.cantidadPagada;

  next();
});

// Virtual para el estado general de la venta
ventaSchema.virtual('estado').get(function() {
  if (!this.isCompleted) return 'En Proceso';
  if (this.completionStatus === 'pending') return 'Pendiente de Revisión';
  if (this.completionStatus === 'approved') return 'Aprobada';
  if (this.completionStatus === 'rejected') return 'Rechazada';
  return 'Estado Desconocido';
});

const Venta = mongoose.model("Venta", ventaSchema);

module.exports = Venta;
