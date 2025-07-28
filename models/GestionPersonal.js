const mongoose = require('mongoose');

const gestionPersonalSchema = new mongoose.Schema({

    userId: {
    type: String,  // Clerk ID del usuario autenticado (quien crea el registro)
    required: true,
  },
  
  colaboradorUserId: {
    type: String, // Clerk ID del colaborador
    required: true
  },

  fechaDeGestion: {
    type: Date,
    required: true
  },

  // Campos principales
  descripcion: { 
    type: String,
    required: true
  },

  monto: { 
    type: Number,
    required: true
  },

  faltante: {
    type: Number,
    required: true,
    default: 0
  },

  adelanto: {
    type: Number,
    required: true,
    default: 0
  },

  // Pago diario se calculará automáticamente
  pagodiario: {
    type: Number,
    default: 0
  },

  // Información del colaborador para referencia
  colaboradorInfo: {
    nombre: String,
    email: String,
    sueldo: Number,
    departamento: String
  },

  // Referencias a cobros relacionados (opcional)
  cobrosRelacionados: [{
    cobroId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cobro'
    },
    montoFaltante: {
      type: Number,
      default: 0
    },
    montoGastoImprevisto: {
      type: Number,
      default: 0
    }
  }],

  // Indicador si los datos fueron sugeridos automáticamente
  datosSugeridos: {
    type: Boolean,
    default: false
  },

  // Notas sobre la fuente de los datos
  fuenteDatos: {
    type: String,
    enum: ['manual', 'automatico_cobros', 'mixto'],
    default: 'manual'
  }

}, {
  timestamps: true
});

// Middleware para calcular pago diario automáticamente
gestionPersonalSchema.pre('save', async function(next) {
  if (this.colaboradorInfo && this.colaboradorInfo.sueldo) {
    // Cada registro = 1 día, pago diario = sueldo / 30 (redondeado a 2 decimales)
    this.pagodiario = Math.round((this.colaboradorInfo.sueldo / 30) * 100) / 100;
  }
  next();
});

gestionPersonalSchema.index({ fechaDeGestion: -1 });

module.exports = mongoose.model('GestionPersonal', gestionPersonalSchema);