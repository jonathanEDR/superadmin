const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  clerk_id: { type: String, required: true, unique: true }, // ID de Clerk
  nombre_negocio: { type: String, required: false }, // Hacemos este campo opcional
  email: { type: String, required: true, unique: true },
  role: { 
    type: String, 
    enum: ['user', 'admin', 'super_admin'], 
    default: 'user' 
  }, // Sistema de roles
  fecha_creacion: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  is_active: { type: Boolean, default: true } // Para poder desactivar usuarios
});

// Middleware para actualizar updated_at antes de guardar
userSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;