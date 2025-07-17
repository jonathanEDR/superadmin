const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    index: true
  },
  descripcion: {
    type: String,
    trim: true,
    default: ''
  },
  estado: {
    type: String,
    enum: ['activo', 'inactivo'],
    default: 'activo'
  },
  creatorId: {
    type: String,
    required: true,
    index: true
  },
  creatorName: {
    type: String,
    required: true
  },
  creatorRole: {
    type: String,
    default: 'admin'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índice compuesto para búsquedas optimizadas
categorySchema.index({ nombre: 1, estado: 1 });

// Virtual para obtener la información del creador
categorySchema.virtual('creatorInfo').get(function() {
  return {
    name: this.creatorName,
    role: this.creatorRole
  };
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
