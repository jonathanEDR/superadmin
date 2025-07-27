#!/usr/bin/env node

/**
 * Script para diagnosticar y resolver problema de códigos duplicados
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

async function diagnosticarProblema() {
  console.log('\n🔍 === DIAGNÓSTICO DE CÓDIGOS DUPLICADOS ===\n');

  try {
    // 1. Ver todos los productos actuales
    console.log('1️⃣ Productos en la base de datos:');
    const productos = await Producto.find({}).lean();
    console.log(`   Total: ${productos.length} productos`);
    
    productos.forEach((p, index) => {
      console.log(`   ${index + 1}. ID: ${p._id}`);
      console.log(`      Código: ${p.codigoProducto}`);
      console.log(`      Nombre: ${p.nombre}`);
      console.log(`      CatalogoID: ${p.catalogoProductoId}`);
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

    // 3. Buscar códigos duplicados en productos
    console.log('3️⃣ Verificando duplicados en productos:');
    const duplicadosProductos = await Producto.aggregate([
      {
        $group: {
          _id: '$codigoProducto',
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', nombre: '$nombre', createdAt: '$createdAt' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (duplicadosProductos.length > 0) {
      console.log(`   ❌ Encontrados ${duplicadosProductos.length} códigos duplicados en productos:`);
      duplicadosProductos.forEach(dup => {
        console.log(`   Código: ${dup._id} (${dup.count} veces)`);
        dup.docs.forEach(doc => {
          console.log(`     - ${doc.nombre} (${doc.id}) - ${doc.createdAt}`);
        });
      });
    } else {
      console.log('   ✅ No hay códigos duplicados en productos');
    }

    // 4. Buscar códigos duplicados en catálogo
    console.log('4️⃣ Verificando duplicados en catálogo:');
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

    // 5. Verificar índices
    console.log('5️⃣ Verificando índices de la colección productos:');
    const indexes = await Producto.collection.indexes();
    console.log('   Índices encontrados:');
    indexes.forEach(index => {
      console.log(`   - ${JSON.stringify(index.key)} (unique: ${index.unique || false})`);
    });

  } catch (error) {
    console.error('❌ Error durante el diagnóstico:', error);
    throw error;
  }
}

async function repararProblema() {
  console.log('\n🔧 === REPARACIÓN DE CÓDIGOS DUPLICADOS ===\n');

  try {
    // Eliminar productos duplicados manteniendo el más reciente
    const duplicadosProductos = await Producto.aggregate([
      {
        $group: {
          _id: '$codigoProducto',
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', nombre: '$nombre', createdAt: '$createdAt' } }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    if (duplicadosProductos.length > 0) {
      console.log(`🔧 Reparando ${duplicadosProductos.length} grupos de duplicados...`);
      
      for (const grupo of duplicadosProductos) {
        // Ordenar por fecha de creación (más reciente primero)
        grupo.docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        const aMantener = grupo.docs[0];
        const aEliminar = grupo.docs.slice(1);

        console.log(`   Código: ${grupo._id}`);
        console.log(`   ✅ Manteniendo: ${aMantener.nombre} (${aMantener.id})`);
        
        for (const doc of aEliminar) {
          console.log(`   ❌ Eliminando: ${doc.nombre} (${doc.id})`);
          await Producto.findByIdAndDelete(doc.id);
        }
      }
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
