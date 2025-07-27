#!/usr/bin/env node

/**
 * Script para diagnosticar y resolver problema de códigos duplicados
 */

const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const CatalogoProducto = require('../models/CatalogoProducto');
const Category = require('../models/Category');

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

async function diagnosticarProblema() {
  console.log('\n🔍 === DIAGNÓSTICO CON NUEVA LÓGICA DE PRODUCTOS ===\n');

  try {
    // 1. Ver todos los productos actuales
    console.log('1️⃣ Productos en la base de datos:');
    const productos = await Producto.find({}).populate('categoryId').lean();
    console.log(`   Total: ${productos.length} productos`);
    
    productos.forEach((p, index) => {
      console.log(`   ${index + 1}. ID: ${p._id}`);
      console.log(`      Código: ${p.codigoProducto}`);
      console.log(`      Nombre: ${p.nombre}`);
      console.log(`      Categoría: ${p.categoryId?.nombre || p.categoryName}`);
      console.log(`      CatalogoID: ${p.catalogoProductoId}`);
      console.log(`      Precio: S/ ${p.precio}`);
      console.log(`      Cantidad: ${p.cantidad}`);
      console.log(`      Creado: ${p.createdAt}`);
      console.log('');
    });

    // 2. Verificar el catálogo
    console.log('2️⃣ Productos en el catálogo:');
    const catalogos = await CatalogoProducto.find({}).lean();
    console.log(`   Total: ${catalogos.length} productos en catálogo`);
    
    catalogos.forEach((c, index) => {
      console.log(`   ${index + 1}. ID: ${c._id}`);
      console.log(`      Código: ${c.codigoproducto || c.codigoProducto}`);
      console.log(`      Nombre: ${c.nombre}`);
      console.log(`      Activo: ${c.activo}`);
      console.log('');
    });

    // 3. NUEVA LÓGICA: Verificar duplicados por combinación catalogoProductoId + categoryId
    console.log('3️⃣ Verificando duplicados por combinación (producto + categoría):');
    const duplicadosCombinacion = await Producto.aggregate([
      {
        $group: {
          _id: { 
            catalogoProductoId: '$catalogoProductoId', 
            categoryId: '$categoryId' 
          },
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', nombre: '$nombre', precio: '$precio', createdAt: '$createdAt' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (duplicadosCombinacion.length > 0) {
      console.log(`   ❌ Encontrados ${duplicadosCombinacion.length} duplicados por combinación:`);
      for (const dup of duplicadosCombinacion) {
        const catalogoInfo = await CatalogoProducto.findById(dup._id.catalogoProductoId);
        const categoriaInfo = await Category.findById(dup._id.categoryId);
        console.log(`   Producto: ${catalogoInfo?.nombre} + Categoría: ${categoriaInfo?.nombre} (${dup.count} veces)`);
        dup.docs.forEach(doc => {
          console.log(`     - ${doc.nombre} (${doc.id}) - S/ ${doc.precio} - ${doc.createdAt}`);
        });
      }
    } else {
      console.log('   ✅ No hay duplicados por combinación (producto + categoría)');
    }

    // 4. Verificar productos con mismo código en diferentes categorías (PERMITIDO)
    console.log('4️⃣ Verificando productos con mismo código en diferentes categorías (PERMITIDO):');
    const mismoCodigoDiferentesCateg = await Producto.aggregate([
      {
        $group: {
          _id: '$codigoProducto',
          count: { $sum: 1 },
          categorias: { $addToSet: '$categoryName' },
          docs: { $push: { 
            id: '$_id', 
            nombre: '$nombre', 
            categoria: '$categoryName',
            precio: '$precio'
          }}
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (mismoCodigoDiferentesCateg.length > 0) {
      console.log(`   ✅ Encontrados ${mismoCodigoDiferentesCateg.length} productos en múltiples categorías (PERMITIDO):`);
      mismoCodigoDiferentesCateg.forEach(prod => {
        console.log(`   Código: ${prod._id} en ${prod.count} categorías: ${prod.categorias.join(', ')}`);
        prod.docs.forEach(doc => {
          console.log(`     - ${doc.nombre} en "${doc.categoria}" - S/ ${doc.precio}`);
        });
        console.log('');
      });
    } else {
      console.log('   ℹ️  No hay productos en múltiples categorías');
    }

    // 5. Verificar duplicados en catálogo
    console.log('5️⃣ Verificando duplicados en catálogo:');
    const duplicadosCatalogo = await CatalogoProducto.aggregate([
      {
        $group: {
          _id: '$codigoproducto',
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', nombre: '$nombre' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (duplicadosCatalogo.length > 0) {
      console.log(`   ❌ Encontrados ${duplicadosCatalogo.length} códigos duplicados en catálogo:`);
      duplicadosCatalogo.forEach(dup => {
        console.log(`   Código: ${dup._id} (${dup.count} veces)`);
        dup.docs.forEach(doc => {
          console.log(`     - ${doc.nombre} (${doc.id})`);
        });
      });
    } else {
      console.log('   ✅ No hay códigos duplicados en catálogo');
    }

    // 6. Verificar índices
    console.log('6️⃣ Verificando índices de la colección productos:');
    const indexes = await Producto.collection.indexes();
    console.log('   Índices encontrados:');
    indexes.forEach(index => {
      const uniqueText = index.unique ? ' (ÚNICO)' : '';
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}${uniqueText}`);
    });

    console.log('\n📋 === REGLAS ACTUALES ===');
    console.log('✅ PERMITIDO: Mismo producto (código) en diferentes categorías');
    console.log('✅ PERMITIDO: Diferentes precios y cantidades por categoría');
    console.log('❌ NO PERMITIDO: Mismo producto en la misma categoría');
    console.log('🔍 ÍNDICE ÚNICO: catalogoProductoId + categoryId');

  } catch (error) {
    console.error('❌ Error durante el diagnóstico:', error);
    throw error;
  }
}

async function repararProblema() {
  console.log('\n🔧 === REPARACIÓN CON NUEVA LÓGICA ===\n');

  try {
    // NUEVA LÓGICA: Solo reparar duplicados REALES por combinación catalogoProductoId + categoryId
    const duplicadosCombinacion = await Producto.aggregate([
      {
        $group: {
          _id: { 
            catalogoProductoId: '$catalogoProductoId', 
            categoryId: '$categoryId' 
          },
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', nombre: '$nombre', createdAt: '$createdAt' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (duplicadosCombinacion.length > 0) {
      console.log(`🔧 Reparando ${duplicadosCombinacion.length} duplicados REALES por combinación...`);
      
      for (const grupo of duplicadosCombinacion) {
        const catalogoInfo = await CatalogoProducto.findById(grupo._id.catalogoProductoId);
        const categoriaInfo = await Category.findById(grupo._id.categoryId);
        
        // Ordenar por fecha de creación (más reciente primero)
        grupo.docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const aMantener = grupo.docs[0];
        const aEliminar = grupo.docs.slice(1);

        console.log(`   Producto: ${catalogoInfo?.nombre} + Categoría: ${categoriaInfo?.nombre}`);
        console.log(`   ✅ Manteniendo: ${aMantener.nombre} (${aMantener.id})`);
        
        for (const doc of aEliminar) {
          console.log(`   ❌ Eliminando: ${doc.nombre} (${doc.id})`);
          await Producto.findByIdAndDelete(doc.id);
        }
      }
    } else {
      console.log('✅ No hay duplicados REALES para reparar');
      console.log('✅ Los productos con mismo código en diferentes categorías son VÁLIDOS');
    }

    // Eliminar duplicados en catálogo también
    const duplicadosCatalogo = await CatalogoProducto.aggregate([
      {
        $group: {
          _id: '$codigoproducto',
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', nombre: '$nombre' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (duplicadosCatalogo.length > 0) {
      console.log(`🔧 Reparando ${duplicadosCatalogo.length} grupos de duplicados en catálogo...`);
      
      for (const grupo of duplicadosCatalogo) {
        const aMantener = grupo.docs[0];
        const aEliminar = grupo.docs.slice(1);

        console.log(`   Código: ${grupo._id}`);
        console.log(`   ✅ Manteniendo: ${aMantener.nombre} (${aMantener.id})`);
        
        for (const doc of aEliminar) {
          console.log(`   ❌ Eliminando: ${doc.nombre} (${doc.id})`);
          await CatalogoProducto.findByIdAndDelete(doc.id);
        }
      }
    }

    console.log('\n✅ === REPARACIÓN COMPLETADA ===');

  } catch (error) {
    console.error('❌ Error durante la reparación:', error);
    throw error;
  }
}

async function main() {
  try {
    await conectarDB();
    await diagnosticarProblema();
    
    // Preguntar si quiere reparar (en producción siempre reparar)
    console.log('\n🚨 === MODO PRODUCCIÓN: REPARANDO AUTOMÁTICAMENTE ===');
    await repararProblema();
    
  } catch (error) {
    console.error('❌ Error en el proceso:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexión cerrada');
    process.exit(0);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = { diagnosticarProblema, repararProblema };
