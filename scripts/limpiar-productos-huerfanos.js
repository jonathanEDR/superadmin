#!/usr/bin/env node

/**
 * Script para limpiar productos huérfanos y corregir inconsistencias
 * Ejecutar con: node scripts/limpiar-productos-huerfanos.js
 */

const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const Category = require('../models/Category');
const CatalogoProducto = require('../models/CatalogoProducto');

require('dotenv').config();

const DB_CONNECTION = process.env.DB_CONNECTION || 'mongodb://localhost:27017/loginSystem';

async function conectarDB() {
  try {
    await mongoose.connect(DB_CONNECTION, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

async function limpiarProductosHuerfanos() {
  console.log('\n🧹 === INICIANDO LIMPIEZA DE PRODUCTOS HUÉRFANOS ===\n');

  try {
    // 1. Buscar productos con referencias a categorías inexistentes
    console.log('1️⃣ Verificando productos con categorías inexistentes...');
    const productosConCategoriaHuerfana = await Producto.find({
      categoryId: { $ne: null }
    }).populate('categoryId');

    let productosConCategoriaInvalida = [];
    for (const producto of productosConCategoriaHuerfana) {
      if (!producto.categoryId) {
        productosConCategoriaInvalida.push(producto);
      }
    }

    console.log(`   📊 Encontrados ${productosConCategoriaInvalida.length} productos con categorías huérfanas`);

    if (productosConCategoriaInvalida.length > 0) {
      console.log('   🔧 Eliminando productos con categorías huérfanas...');
      for (const producto of productosConCategoriaInvalida) {
        console.log(`   ❌ Eliminando producto: ${producto.nombre} (ID: ${producto._id})`);
        await Producto.findByIdAndDelete(producto._id);
      }
    }

    // 2. Buscar productos con referencias a catálogo inexistentes
    console.log('\n2️⃣ Verificando productos con catálogo inexistente...');
    const productosConCatalogoHuerfano = await Producto.find({
      catalogoProductoId: { $ne: null }
    });

    let productosConCatalogoInvalido = [];
    for (const producto of productosConCatalogoHuerfano) {
      if (producto.catalogoProductoId) {
        const catalogoExiste = await CatalogoProducto.findById(producto.catalogoProductoId);
        if (!catalogoExiste) {
          productosConCatalogoInvalido.push(producto);
        }
      }
    }

    console.log(`   📊 Encontrados ${productosConCatalogoInvalido.length} productos con catálogo huérfano`);

    if (productosConCatalogoInvalido.length > 0) {
      console.log('   🔧 Eliminando productos con catálogo huérfano...');
      for (const producto of productosConCatalogoInvalido) {
        console.log(`   ❌ Eliminando producto: ${producto.nombre} (ID: ${producto._id})`);
        await Producto.findByIdAndDelete(producto._id);
      }
    }

    // 3. Buscar productos duplicados (mismo catalogoProductoId + categoryId)
    console.log('\n3️⃣ Verificando productos duplicados...');
    const pipeline = [
      {
        $match: {
          catalogoProductoId: { $ne: null },
          categoryId: { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            catalogoProductoId: '$catalogoProductoId',
            categoryId: '$categoryId'
          },
          count: { $sum: 1 },
          productos: { $push: { id: '$_id', nombre: '$nombre', precio: '$precio', createdAt: '$createdAt' } }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ];

    const duplicados = await Producto.aggregate(pipeline);
    console.log(`   📊 Encontrados ${duplicados.length} grupos de productos duplicados`);

    if (duplicados.length > 0) {
      console.log('   🔧 Resolviendo duplicados (manteniendo el más reciente)...');
      for (const grupo of duplicados) {
        // Ordenar por fecha de creación (más reciente primero)
        grupo.productos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Mantener el primero (más reciente) y eliminar el resto
        const aMantener = grupo.productos[0];
        const aEliminar = grupo.productos.slice(1);

        console.log(`   📦 Grupo duplicado - Catálogo: ${grupo._id.catalogoProductoId}, Categoría: ${grupo._id.categoryId}`);
        console.log(`   ✅ Manteniendo: ${aMantener.nombre} (${aMantener.id}) - ${new Date(aMantener.createdAt).toLocaleString()}`);
        
        for (const producto of aEliminar) {
          console.log(`   ❌ Eliminando: ${producto.nombre} (${producto.id}) - ${new Date(producto.createdAt).toLocaleString()}`);
          await Producto.findByIdAndDelete(producto.id);
        }
      }
    }

    // 4. Verificar y corregir datos faltantes
    console.log('\n4️⃣ Verificando datos faltantes...');
    const productosConDatosFaltantes = await Producto.find({
      $or: [
        { codigoProducto: { $exists: false } },
        { codigoProducto: '' },
        { nombre: { $exists: false } },
        { nombre: '' }
      ]
    });

    console.log(`   📊 Encontrados ${productosConDatosFaltantes.length} productos con datos faltantes`);

    if (productosConDatosFaltantes.length > 0) {
      for (const producto of productosConDatosFaltantes) {
        console.log(`   🔧 Corrigiendo producto: ${producto._id}`);
        
        // Intentar obtener datos del catálogo
        if (producto.catalogoProductoId) {
          const catalogoProducto = await CatalogoProducto.findById(producto.catalogoProductoId);
          if (catalogoProducto) {
            const updateData = {};
            
            if (!producto.codigoProducto || producto.codigoProducto === '') {
              updateData.codigoProducto = catalogoProducto.codigoproducto || catalogoProducto.codigoProducto;
            }
            
            if (!producto.nombre || producto.nombre === '') {
              updateData.nombre = catalogoProducto.nombre;
            }
            
            if (Object.keys(updateData).length > 0) {
              await Producto.findByIdAndUpdate(producto._id, updateData);
              console.log(`   ✅ Corregido: ${JSON.stringify(updateData)}`);
            }
          }
        }
      }
    }

    // 5. Estadísticas finales
    console.log('\n📊 === ESTADÍSTICAS FINALES ===');
    const totalProductos = await Producto.countDocuments();
    const productosActivos = await Producto.countDocuments({ activo: true });
    const productosConCategoria = await Producto.countDocuments({ categoryId: { $ne: null } });
    const productosConCatalogo = await Producto.countDocuments({ catalogoProductoId: { $ne: null } });

    console.log(`   📦 Total de productos: ${totalProductos}`);
    console.log(`   ✅ Productos activos: ${productosActivos}`);
    console.log(`   🏷️ Con categoría: ${productosConCategoria}`);
    console.log(`   📋 Con catálogo: ${productosConCatalogo}`);

    console.log('\n✅ === LIMPIEZA COMPLETADA ===\n');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    throw error;
  }
}

async function main() {
  try {
    await conectarDB();
    await limpiarProductosHuerfanos();
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

module.exports = { limpiarProductosHuerfanos };
