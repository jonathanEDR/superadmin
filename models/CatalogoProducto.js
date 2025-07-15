const mongoose = require('mongoose');

const catalogoProductoSchema = new mongoose.Schema({
  codigoCatalogo: { type: String, required: true, unique: true, trim: true }, // SKU o código único
  nombre: { type: String, required: true, unique: true, trim: true },
  descripcion: { type: String, default: '' },
  categoria: { type: String, default: '' }
}, {
  timestamps: true
});

module.exports = mongoose.model('CatalogoProducto', catalogoProductoSchema);
