const mongoose = require('mongoose');

const CatalogoProductoSchema = new mongoose.Schema({
  codigoproducto: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  activo: { type: Boolean, default: true }
  // Puedes agregar más campos aquí si lo necesitas
});

module.exports = mongoose.model('CatalogoProducto', CatalogoProductoSchema);
