const mongoose = require('mongoose');

const movimientoCajaSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: ['ingreso', 'egreso'],
    required: true
  },  categoria: {
    type: String,
    enum: [
      // Ingresos
      'venta_directa',
      'cobro',
      'devolucion_proveedor',
      'prestamo_recibido',
      'ingreso_extra',
      
      // Egresos
      'pago_personal',
      'pago_personal_finanzas',
      'pago_personal_produccion',
      'pago_personal_ventas',
      'pago_personal_admin',
      'materia_prima',
      'materia_prima_finanzas',
      'materia_prima_produccion', 
      'materia_prima_ventas',
      'materia_prima_admin',
      'otros',
      'otros_finanzas',
      'otros_produccion',
      'otros_ventas',
      'otros_admin',
      'pago_proveedor',
      'gasto_operativo',
      'servicio_basico',
      'alquiler',
      'transporte',
      'marketing',
      'impuestos',
      'egreso_extra'
    ],
    required: true
  },
  descripcion: {
    type: String,
    required: true,
    trim: true
  },
  monto: {
    type: Number,
    required: true,
    min: 0
  },
  fecha: {
    type: Date,
    required: true,
    default: Date.now
  },
  metodoPago: {
    type: String,
    enum: ['efectivo', 'transferencia', 'yape', 'plin', 'deposito', 'cheque', 'tarjeta'],
    default: 'efectivo'
  },
  // Campos para mantener el saldo
  saldoAnterior: {
    type: Number,
    required: true,
    default: 0
  },
  saldoActual: {
    type: Number,
    required: true,
    default: 0
  },
  // Referencias opcionales para trazabilidad
  referenciaId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  referenciaModelo: {
    type: String,
    enum: ['Venta', 'Cobro', 'PagoRealizado', 'Gasto'],
    required: false
  },
  // Información adicional
  colaboradorNombre: {
    type: String,
    required: false
  },
  proveedor: {
    type: String,
    required: false
  },
  numeroComprobante: {
    type: String,
    required: false
  },
  observaciones: {
    type: String,
    required: false
  },
  // Control
  esAutomatico: {
    type: Boolean,
    default: false // true si fue generado automáticamente por otro módulo
  }
}, {
  timestamps: true
});

// Índices
movimientoCajaSchema.index({ userId: 1, fecha: -1 });
movimientoCajaSchema.index({ userId: 1, tipo: 1 });
movimientoCajaSchema.index({ userId: 1, categoria: 1 });

// Middleware para calcular saldo automáticamente
movimientoCajaSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Obtener el último movimiento para calcular saldo
    const ultimoMovimiento = await this.constructor
      .findOne({ userId: this.userId })
      .sort({ fecha: -1, createdAt: -1 });
    
    this.saldoAnterior = ultimoMovimiento ? ultimoMovimiento.saldoActual : 0;
    
    // Calcular nuevo saldo
    if (this.tipo === 'ingreso') {
      this.saldoActual = this.saldoAnterior + this.monto;
    } else {
      this.saldoActual = this.saldoAnterior - this.monto;
    }
  }
  next();
});

module.exports = mongoose.model('MovimientoCaja', movimientoCajaSchema);
