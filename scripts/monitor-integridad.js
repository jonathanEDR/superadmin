#!/usr/bin/env node

/**
 * Script de monitoreo para verificar el estado de la base de datos
 * Útil para ejecutar periódicamente en producción
 */

const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const CatalogoProducto = require('../models/CatalogoProducto');
const Category = require('../models/Category');

require('dotenv').config();

async function conectarDB() {
  try {
    const DB_CONNECTION = process.env.DB_CONNECTION || 'mongodb://localhost:27017/loginSystem';
    await mongoose.connect(DB_CONNECTION);
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando:', error.message);
    process.exit(1);
  }
}

async function verificarIntegridad() {
  console.log('\n🔍 === VERIFICACIÓN DE INTEGRIDAD ===\n');

  try {
    // 1. Estadísticas generales
    const stats = {
      productos: await Producto.countDocuments(),
      productosActivos: await Producto.countDocuments({ activo: true }),
      catalogo: await CatalogoProducto.countDocuments(),
      catalogoActivo: await CatalogoProducto.countDocuments({ activo: true }),
      categorias: await Category.countDocuments()
    };

    console.log('📊 Estadísticas:');
    console.log(`   📦 Productos: ${stats.productos} (${stats.productosActivos} activos)`);
    console.log(`   📚 Catálogo: ${stats.catalogo} (${stats.catalogoActivo} activos)`);
    console.log(`   🏷️ Categorías: ${stats.categorias}`);

    // 2. Verificar duplicados en productos
    const duplicadosProductos = await Producto.aggregate([
      { $group: { _id: '$codigoProducto', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicadosProductos.length > 0) {
      console.log(`\n⚠️  DUPLICADOS EN PRODUCTOS: ${duplicadosProductos.length}`);
      duplicadosProductos.forEach(dup => {
        console.log(`   Código: ${dup._id} (${dup.count} veces)`);
      });
    } else {
      console.log('\n✅ No hay duplicados en productos');
    }

    // 3. Verificar duplicados en catálogo
    const duplicadosCatalogo = await CatalogoProducto.aggregate([
      { $group: { _id: '$codigoproducto', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicadosCatalogo.length > 0) {
      console.log(`\n⚠️  DUPLICADOS EN CATÁLOGO: ${duplicadosCatalogo.length}`);
      duplicadosCatalogo.forEach(dup => {
        console.log(`   Código: ${dup._id} (${dup.count} veces)`);
      });
    } else {
      console.log('✅ No hay duplicados en catálogo');
    }

    // 4. Verificar productos huérfanos (sin categoría o catálogo válido)
    const productosHuerfanos = await Producto.find({
      $or: [
        { categoryId: null },
        { catalogoProductoId: null }
      ]
    });

    if (productosHuerfanos.length > 0) {
      console.log(`\n⚠️  PRODUCTOS HUÉRFANOS: ${productosHuerfanos.length}`);
      productosHuerfanos.forEach(p => {
        console.log(`   ${p.nombre} (${p._id}) - Cat: ${p.categoryId}, Catálogo: ${p.catalogoProductoId}`);
      });
    } else {
      console.log('✅ No hay productos huérfanos');
    }

    // 5. Verificar referencias rotas
    const productosConReferenciasRotas = [];
    const productos = await Producto.find({});
    
    for (const producto of productos) {
      // Verificar categoría
      if (producto.categoryId) {
        const categoria = await Category.findById(producto.categoryId);
        if (!categoria) {
          productosConReferenciasRotas.push({
            producto: producto.nombre,
            id: producto._id,
            problema: 'Categoría no existe'
          });
        }
      }

      // Verificar catálogo
      if (producto.catalogoProductoId) {
        const catalogo = await CatalogoProducto.findById(producto.catalogoProductoId);
        if (!catalogo) {
          productosConReferenciasRotas.push({
            producto: producto.nombre,
            id: producto._id,
            problema: 'Catálogo no existe'
          });
        }
      }
    }

    if (productosConReferenciasRotas.length > 0) {
      console.log(`\n⚠️  REFERENCIAS ROTAS: ${productosConReferenciasRotas.length}`);
      productosConReferenciasRotas.forEach(p => {
        console.log(`   ${p.producto} (${p.id}) - ${p.problema}`);
      });
    } else {
      console.log('✅ No hay referencias rotas');
    }

    // 6. Resumen final
    const problemas = duplicadosProductos.length + duplicadosCatalogo.length + 
                     productosHuerfanos.length + productosConReferenciasRotas.length;

    console.log('\n📋 === RESUMEN ===');
    if (problemas === 0) {
      console.log('🎉 ¡Base de datos en perfecto estado!');
      console.log('✅ Sin duplicados, huérfanos o referencias rotas');
    } else {
      console.log(`⚠️  Se encontraron ${problemas} problemas que requieren atención`);
    }

    return {
      stats,
      duplicadosProductos: duplicadosProductos.length,
      duplicadosCatalogo: duplicadosCatalogo.length,
      huerfanos: productosHuerfanos.length,
      referenciaRotas: productosConReferenciasRotas.length,
      totalProblemas: problemas
    };

  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('🔍 === MONITOR DE INTEGRIDAD DE BASE DE DATOS ===');
    console.log(`📅 Fecha: ${new Date().toLocaleString()}`);
    
    await conectarDB();
    const resultado = await verificarIntegridad();
    
    console.log('\n✅ === VERIFICACIÓN COMPLETADA ===');
    
    // Salir con código de error si hay problemas
    if (resultado.totalProblemas > 0) {
      console.log('⚠️  Se detectaron problemas - revisar logs');
      process.exit(1);
    } else {
      console.log('🎉 Base de datos saludable');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Error en el monitoreo:', error.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = { verificarIntegridad };
