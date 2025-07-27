#!/usr/bin/env node

/**
 * Script para resolver definitivamente el problema de duplicados
 */

const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const CatalogoProducto = require('../models/CatalogoProducto');

require('dotenv').config();

async function conectarDB() {
  try {
    await mongoose.connect(process.env.DB_CONNECTION || 'mongodb://localhost:27017/loginSystem');
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

async function resolverDuplicadosDefinitivo() {
  console.log('\n🚨 === RESOLUCIÓN DEFINITIVA DE DUPLICADOS ===\n');

  try {
    // 1. Eliminar TODOS los productos actuales para empezar limpio
    console.log('🗑️  Eliminando todos los productos existentes para empezar limpio...');
    const productosEliminados = await Producto.deleteMany({});
    console.log(`✅ Eliminados ${productosEliminados.deletedCount} productos`);

    // 2. Verificar qué productos del catálogo están disponibles
    console.log('\\n📋 Productos disponibles en el catálogo:');
    const catalogos = await CatalogoProducto.find({ activo: true }).lean();
    
    catalogos.forEach((c, index) => {
      console.log(`   ${index + 1}. ${c.codigoproducto} - ${c.nombre}`);
    });

    console.log(`\\n✅ Base de datos limpia. Ahora se pueden crear productos sin conflictos.`);
    console.log(`📝 Para crear un producto, usa el modal y selecciona del catálogo disponible.`);

  } catch (error) {
    console.error('❌ Error durante la resolución:', error);
    throw error;
  }
}

async function main() {
  try {
    await conectarDB();
    await resolverDuplicadosDefinitivo();
    
    console.log('\\n✅ === RESOLUCIÓN COMPLETADA ===');
    console.log('\\n🎯 Próximos pasos:');
    console.log('   1. La base de datos está limpia de productos');
    console.log('   2. Usa el modal para crear productos desde el catálogo');
    console.log('   3. Ya no habrá conflictos de códigos duplicados');
    
  } catch (error) {
    console.error('❌ Error en el proceso:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\\n🔌 Conexión cerrada');
    process.exit(0);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main();
}
