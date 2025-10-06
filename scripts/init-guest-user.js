/**
 * Script para crear el usuario especial "sin-registro" en la base de datos
 * Este usuario se usa para ventas a clientes no registrados en el sistema
 * 
 * Ejecutar: node scripts/init-guest-user.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const GUEST_USER = {
  clerk_id: 'sin-registro',
  email: 'sin-registro@sistema.local',
  nombre_negocio: 'Cliente Sin Registro',
  role: 'user',
  telefono: '000-000-0000',
  direccion: 'N/A',
  isActive: true,
  isGuestAccount: true // Campo especial para identificar esta cuenta
};

async function initGuestUser() {
  try {
    // Conectar a MongoDB
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar si ya existe
    const existingUser = await User.findOne({ clerk_id: 'sin-registro' });
    
    if (existingUser) {
      console.log('⚠️  El usuario "sin-registro" ya existe en la base de datos');
      console.log('📋 Datos actuales:', {
        clerk_id: existingUser.clerk_id,
        email: existingUser.email,
        nombre_negocio: existingUser.nombre_negocio,
        role: existingUser.role
      });
      
      // Actualizar por si acaso
      await User.findOneAndUpdate(
        { clerk_id: 'sin-registro' },
        GUEST_USER,
        { new: true }
      );
      console.log('✅ Usuario actualizado correctamente');
    } else {
      // Crear nuevo usuario
      const guestUser = new User(GUEST_USER);
      await guestUser.save();
      console.log('✅ Usuario "sin-registro" creado exitosamente');
      console.log('📋 Datos:', {
        clerk_id: guestUser.clerk_id,
        email: guestUser.email,
        nombre_negocio: guestUser.nombre_negocio,
        role: guestUser.role
      });
    }

    console.log('\n🎉 Proceso completado');
    console.log('💡 Ahora puedes crear ventas para clientes sin registro');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  }
}

// Ejecutar
initGuestUser();
