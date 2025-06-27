const mongoose = require('mongoose');

const gastoSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  tipoDeGasto: {
    type: String,
    enum: ['Pago Personal', 'Materia Prima', 'Otros'],
    required: true
  },
  gasto: {
    type: String,
    enum: ['Finanzas', 'Producción', 'Ventas', 'Administración'],
    required: true
  },
  descripcion: { type: String, required: true },
  costoUnidad: { type: Number, required: true },
  cantidad: { type: Number, required: true },
  montoTotal: { type: Number, required: true },
  fechaGasto: { type: Date, default: Date.now },
  // Campos para referencias y cascada
  referenciaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    default: null,
    index: true
  },
  referenciaModelo: { 
    type: String, 
    enum: ['PagoRealizado', 'MovimientoCaja', null],
    default: null
  },
  esAutomatico: { 
    type: Boolean, 
    default: false 
  }
    },
  {
  timestamps: true, 
});

const Gasto = mongoose.model('Gasto', gastoSchema);

module.exports = Gasto;
