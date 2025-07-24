const mongoose = require('mongoose');

const CatalogoProductoSchema = new mongoose.Schema({
  codigoproducto: { type: String, required: true, unique: true },
  codigoProducto: { 
    type: String, 
    required: false,
    get: function() { return this.codigoproducto; },
    set: function(value) { this.codigoproducto = value; }
  },
  nombre: { type: String, required: true },
  activo: { type: Boolean, default: true }
}, {
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});

// Virtual para compatibilidad con el código existente
CatalogoProductoSchema.virtual('codigo').get(function() {
  return this.codigoproducto;
});

module.exports = mongoose.model('CatalogoProducto', CatalogoProductoSchema);
