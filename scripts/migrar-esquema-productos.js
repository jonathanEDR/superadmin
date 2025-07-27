#!/usr/bin/env node

/**
 * Script para migrar el modelo de productos para permitir mismo producto en diferentes categorías
 */

const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const CatalogoProducto = require('../models/CatalogoProducto');

require('dotenv').config();

const DB_CONNECTION = process.env.DB_CONNECTION || 'mongodb://localhost:27017/loginSystem';

async function conectarDB() {
  try {
    await mongoose.connect(DB_CONNECTION);
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

async function migrarEsquema() {
  console.log('\n🔄 === MIGRACIÓN DEL ESQUEMA DE PRODUCTOS ===\n');

  try {
    // 1. Eliminar el índice único problemático en codigoProducto
    console.log('1️⃣ Eliminando índice único en codigoProducto...');
    try {
      await Producto.collection.dropIndex('codigoProducto_1');
      console.log('   ✅ Índice único eliminado');
    } catch (error) {
      if (error.code === 27) {
        console.log('   ℹ️  Índice no existe, continuando...');
      } else {
        throw error;
      }
    }

    // 2. Crear índice compuesto único para catalogoProductoId + categoryId
    console.log('\\n2️⃣ Creando índice compuesto único (catalogoProductoId + categoryId)...');
    try {
      await Producto.collection.createIndex(
        { catalogoProductoId: 1, categoryId: 1 },
        { 
          unique: true,
          name: 'catalogoProducto_categoria_unique'
        }
      );
      console.log('   ✅ Índice compuesto creado exitosamente');
    } catch (error) {
      if (error.code === 85) {
        console.log('   ℹ️  Índice ya existe, continuando...');
      } else {
        throw error;
      }
    }

    // 3. Crear índice normal (no único) para codigoProducto para búsquedas
    console.log('\\n3️⃣ Creando índice normal para codigoProducto...');
    try {
      await Producto.collection.createIndex(
        { codigoProducto: 1 },
        { name: 'codigoProducto_search' }
      );
      console.log('   ✅ Índice de búsqueda creado');
    } catch (error) {
      if (error.code === 85) {
        console.log('   ℹ️  Índice ya existe, continuando...');
      } else {
        throw error;
      }
    }

    // 4. Verificar los nuevos índices
    console.log('\\n4️⃣ Verificando índices actuales:');
    const indexes = await Producto.collection.indexes();
    indexes.forEach(index => {
      const uniqueText = index.unique ? ' (ÚNICO)' : '';
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}${uniqueText}`);
    });

    // 5. Limpiar productos existentes que puedan causar conflictos
    console.log('\\n5️⃣ Limpiando productos existentes...');
    const productosEliminados = await Producto.deleteMany({});
    console.log(`   ✅ Eliminados ${productosEliminados.deletedCount} productos para empezar limpio`);

    console.log('\\n✅ === MIGRACIÓN COMPLETADA ===');
    console.log('\\n📋 Nuevas reglas:');
    console.log('   - ✅ Mismo producto puede estar en diferentes categorías');
    console.log('   - ✅ Cada combinación (producto + categoría) debe ser única');
    console.log('   - ✅ Ejemplo: Pizza Hawaiana en "Familiar" y "Personal"');

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  }
}

async function probarNuevaLogica() {
  console.log('\\n🧪 === PROBANDO NUEVA LÓGICA ===\\n');

  try {
    // Verificar que tenemos productos en el catálogo para probar
    const catalogos = await CatalogoProducto.find({ activo: true }).limit(3);
    
    if (catalogos.length === 0) {
      console.log('   ⚠️  No hay productos en el catálogo para probar');
      return;
    }

    console.log('📋 Productos disponibles para prueba:');
    catalogos.forEach((c, index) => {
      console.log(`   ${index + 1}. ${c.codigoproducto} - ${c.nombre}`);
    });

    console.log('\\n✅ La nueva lógica está lista para usar');
    console.log('\\n🎯 Ahora puedes:');
    console.log('   1. Usar el modal para crear productos');
    console.log('   2. Seleccionar el mismo producto del catálogo para diferentes categorías');
    console.log('   3. Cada combinación tendrá su propio precio y cantidad');

  } catch (error) {
    console.error('❌ Error durante las pruebas:', error);
    throw error;
  }
}

async function main() {
  try {
    await conectarDB();
    await migrarEsquema();
    await probarNuevaLogica();
    
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

module.exports = { migrarEsquema, probarNuevaLogica };
