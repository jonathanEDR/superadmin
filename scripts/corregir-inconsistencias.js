#!/usr/bin/env node

/**
 * Script para corregir inconsistencias específicas y prevenir duplicados
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

async function corregirInconsistencias() {
  console.log('\n🔧 === CORRIGIENDO INCONSISTENCIAS ESPECÍFICAS ===\n');

  try {
    // 1. Buscar el producto problemático
    const productoProblemático = await Producto.findOne({ codigoProducto: '3001' });
    
    if (productoProblemático) {
      console.log('🔍 Producto problemático encontrado:');
      console.log(`   ID: ${productoProblemático._id}`);
      console.log(`   Código: ${productoProblemático.codigoProducto}`);
      console.log(`   Nombre: ${productoProblemático.nombre}`);
      console.log(`   CatalogoID: ${productoProblemático.catalogoProductoId}`);

      // 2. Verificar el catálogo al que apunta
      const catalogoApuntado = await CatalogoProducto.findById(productoProblemático.catalogoProductoId);
      
      if (catalogoApuntado) {
        console.log('\\n📋 Catálogo al que apunta:');
        console.log(`   ID: ${catalogoApuntado._id}`);
        console.log(`   Código: ${catalogoApuntado.codigoproducto}`);
        console.log(`   Nombre: ${catalogoApuntado.nombre}`);

        // 3. Si hay inconsistencia, corregir
        if (productoProblemático.codigoProducto !== catalogoApuntado.codigoproducto || 
            productoProblemático.nombre !== catalogoApuntado.nombre) {
          
          console.log('\\n⚠️  INCONSISTENCIA DETECTADA:');
          console.log(`   Producto tiene código: ${productoProblemático.codigoProducto}, nombre: ${productoProblemático.nombre}`);
          console.log(`   Catálogo tiene código: ${catalogoApuntado.codigoproducto}, nombre: ${catalogoApuntado.nombre}`);
          
          console.log('\\n🔧 Corrigiendo producto para que coincida con el catálogo...');
          
          // Actualizar el producto para que coincida con el catálogo
          await Producto.findByIdAndUpdate(productoProblemático._id, {
            codigoProducto: catalogoApuntado.codigoproducto,
            nombre: catalogoApuntado.nombre.toLowerCase()
          });
          
          console.log('✅ Producto corregido exitosamente');
        }
      }
    }

    // 4. Verificar todos los productos para consistencia
    console.log('\\n🔍 Verificando consistencia de todos los productos...');
    const todosLosProductos = await Producto.find({}).populate('catalogoProductoId');
    
    let inconsistenciasEncontradas = 0;
    
    for (const producto of todosLosProductos) {
      if (producto.catalogoProductoId) {
        const catalogo = await CatalogoProducto.findById(producto.catalogoProductoId);
        
        if (catalogo) {
          if (producto.codigoProducto !== catalogo.codigoproducto) {
            console.log(`\\n⚠️  Inconsistencia en producto ${producto._id}:`);
            console.log(`   Producto código: ${producto.codigoProducto}`);
            console.log(`   Catálogo código: ${catalogo.codigoproducto}`);
            
            // Corregir
            await Producto.findByIdAndUpdate(producto._id, {
              codigoProducto: catalogo.codigoproducto,
              nombre: catalogo.nombre.toLowerCase()
            });
            
            inconsistenciasEncontradas++;
            console.log(`   ✅ Corregido`);
          }
        }
      }
    }
    
    if (inconsistenciasEncontradas === 0) {
      console.log('✅ Todos los productos están consistentes con el catálogo');
    } else {
      console.log(`🔧 Se corrigieron ${inconsistenciasEncontradas} inconsistencias`);
    }

  } catch (error) {
    console.error('❌ Error durante la corrección:', error);
    throw error;
  }
}

async function main() {
  try {
    await conectarDB();
    await corregirInconsistencias();
    
    console.log('\\n✅ === CORRECCIÓN COMPLETADA ===');
    console.log('\\n📋 Estado final:');
    
    const productosFinales = await Producto.find({});
    productosFinales.forEach(p => {
      console.log(`   ${p.nombre} (${p.codigoProducto}) - CatalogoID: ${p.catalogoProductoId}`);
    });
    
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
