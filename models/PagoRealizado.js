const mongoose = require('mongoose');

const pagoRealizadoSchema = new mongoose.Schema({
    userId: {
    type: String,  // Clerk ID del usuario autenticado (quien crea el registro)
    required: true,
  },
  
  colaboradorUserId: {
    type: String, // Clerk ID del colaborador
    required: true
  },

  fechaPago: {
    type: Date,
    required: true,
    default: Date.now
  },
  montoTotal: {
    type: Number,
    required: true,
    min: 0
  },
  metodoPago: {
    type: String,
    required: true,
    enum: ['efectivo', 'transferencia', 'deposito', 'cheque'],
    default: 'efectivo'
  },
  periodoInicio: {
    type: Date,
    default: null
  },
  periodoFin: {
    type: Date,
    default: null
  },
  registrosIncluidos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GestionPersonal'
  }],
  observaciones: {
    type: String,
    default: ''
  },
  estado: {
    type: String,
    required: true,
    enum: ['pagado', 'parcial', 'pendiente'],
    default: 'pagado'
  },
  creadoPor: {
    type: String,
    required: true
  },
  referenciaMovimiento: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MovimientoCaja',
    required: false // Opcional para mantener compatibilidad con registros existentes
  }
}, {
  timestamps: true
});

// Índices para mejorar rendimiento
pagoRealizadoSchema.index({ colaboradorUserId: 1 });
pagoRealizadoSchema.index({ fechaPago: -1 });
pagoRealizadoSchema.index({ estado: 1 });
pagoRealizadoSchema.index({ creadoPor: 1 });

// Método para calcular el período si no se especifica
pagoRealizadoSchema.pre('save', function(next) {
  if (!this.periodoInicio && !this.periodoFin) {
    // Si no se especifica período, usar el mes actual
    const fechaPago = this.fechaPago;
    this.periodoInicio = new Date(fechaPago.getFullYear(), fechaPago.getMonth(), 1);
    this.periodoFin = new Date(fechaPago.getFullYear(), fechaPago.getMonth() + 1, 0);
  }
  next();
});

const PagoRealizado = mongoose.model('PagoRealizado', pagoRealizadoSchema);

module.exports = PagoRealizado;
