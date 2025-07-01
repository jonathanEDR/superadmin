// test-mongodb.js - Script para probar conexión a MongoDB
require('dotenv').config();
const mongoose = require('mongoose');

async function testMongoConnection() {
  console.log('🔍 Probando conexión a MongoDB...');
  console.log('MONGODB_URI existe:', !!process.env.MONGODB_URI);
  console.log('MONGODB_URI preview:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 50) + '...' : 'NO DEFINIDA');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Conexión a MongoDB exitosa!');
    console.log('📊 Base de datos:', mongoose.connection.name);
    console.log('🌐 Host:', mongoose.connection.host);
    
    await mongoose.connection.close();
    console.log('🔒 Conexión cerrada correctamente');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:');
    console.error('Mensaje:', error.message);
    console.error('Código:', error.code);
    
    if (error.message.includes('IP')) {
      console.log('\n🔧 SOLUCIÓN:');
      console.log('1. Ve a MongoDB Atlas → Network Access');
      console.log('2. Agrega 0.0.0.0/0 para permitir todas las IPs');
      console.log('3. O agrega las IPs específicas de Render');
    }
    
    if (error.message.includes('authentication')) {
      console.log('\n🔧 SOLUCIÓN:');
      console.log('1. Verifica tu username y password en MongoDB Atlas');
      console.log('2. Ve a Database Access y verifica las credenciales');
    }
    
    process.exit(1);
  }
}

testMongoConnection();
