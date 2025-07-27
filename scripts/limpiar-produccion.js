#!/usr/bin/env node

/**
 * Script para limpiar la base de datos de PRODUCCIÓN
 * Este script se conecta a MongoDB Atlas y elimina productos duplicados
 */

const mongoose = require('mongoose');

// Definir esquemas directamente (sin importar modelos locales)
const productoSchema = new mongoose.Schema({
  codigoProducto: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId },
  catalogoProductoId: { type: mongoose.Schema.Types.ObjectId },
  precio: { type: Number },
  cantidad: { type: Number },
  creatorId: { type: String },
  creatorName: { type: String },
  creatorEmail: { type: String },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

const catalogoSchema = new mongoose.Schema({
  codigoproducto: { type: String, required: true },
  nombre: { type: String, required: true },
  activo: { type: Boolean, default: true }
});

// Variables globales para modelos
let Producto, CatalogoProducto;

async function conectarProduccion() {
  try {
    // URL de conexión a producción (MongoDB Atlas)
    const PRODUCTION_DB = process.env.DB_CONNECTION || 'mongodb://localhost:27017/loginSystem';
    
    console.log('🌍 Conectando a base de datos de producción...');
    console.log(`📡 URL: ${PRODUCTION_DB.substring(0, 50)}...`);
    
    await mongoose.connect(PRODUCTION_DB);
    
    // Crear modelos después de la conexión
    Producto = mongoose.model('Producto', productoSchema);
    CatalogoProducto = mongoose.model('CatalogoProducto', catalogoSchema);
    
    console.log('✅ Conectado a MongoDB de producción');
    
    // Verificar que estamos en la base correcta
    const admin = mongoose.connection.db.admin();
    const dbInfo = await admin.command({ connectionStatus: 1 });
    console.log(`🗄️  Base de datos: ${mongoose.connection.name}`);
    
  } catch (error) {
    console.error('❌ Error conectando a producción:', error.message);
    process.exit(1);
  }
}

async function analizar() {
  console.log('\n🔍 === ANÁLISIS DE BASE DE DATOS DE PRODUCCIÓN ===\n');

  try {
    // 1. Contar productos totales
    const totalProductos = await Producto.countDocuments();
    console.log(`📦 Total de productos en producción: ${totalProductos}`);

    // 2. Buscar duplicados por codigoProducto
    const duplicados = await Producto.aggregate([
      {
        $group: {
          _id: '$codigoProducto',
          count: { $sum: 1 },
          docs: { 
            $push: { 
              id: '$_id', 
              nombre: '$nombre', 
              createdAt: '$createdAt',
              catalogoId: '$catalogoProductoId'
            } 
          }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    if (duplicados.length > 0) {
      console.log(`\n⚠️  DUPLICADOS ENCONTRADOS: ${duplicados.length} códigos duplicados\n`);
      
      duplicados.forEach((dup, index) => {
        console.log(`${index + 1}. Código: "${dup._id}" (${dup.count} productos)`);
        dup.docs.forEach((doc, i) => {
          const fecha = new Date(doc.createdAt).toLocaleString();
          console.log(`   ${i + 1}. ${doc.nombre} - ID: ${doc.id} - ${fecha}`);
        });
        console.log('');
      });
      
      return duplicados;
    } else {
      console.log('✅ No se encontraron duplicados');
      return [];
    }

  } catch (error) {
    console.error('❌ Error durante el análisis:', error);
    throw error;
  }
}

async function limpiarDuplicados(duplicados) {
  console.log('\n🧹 === LIMPIANDO DUPLICADOS EN PRODUCCIÓN ===\n');

  if (duplicados.length === 0) {
    console.log('✅ No hay duplicados para limpiar');
    return;
  }

  try {
    for (const grupo of duplicados) {
      console.log(`🔧 Procesando código: "${grupo._id}"`);
      
      // Ordenar por fecha de creación (más reciente primero)
      grupo.docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      const aMantener = grupo.docs[0];
      const aEliminar = grupo.docs.slice(1);

      console.log(`   ✅ Manteniendo: ${aMantener.nombre} (${aMantener.id})`);
      console.log(`      Fecha: ${new Date(aMantener.createdAt).toLocaleString()}`);
      
      // Eliminar los duplicados
      for (const doc of aEliminar) {
        console.log(`   ❌ Eliminando: ${doc.nombre} (${doc.id})`);
        await Producto.findByIdAndDelete(doc.id);
      }
      
      console.log('');
    }

    console.log('✅ Limpieza de duplicados completada');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    throw error;
  }
}

async function verificarCatalogo() {
  console.log('\n📋 === VERIFICANDO CATÁLOGO ===\n');

  try {
    const totalCatalogo = await CatalogoProducto.countDocuments();
    console.log(`📚 Total productos en catálogo: ${totalCatalogo}`);

    // Buscar duplicados en catálogo
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
      console.log(`⚠️  Duplicados en catálogo: ${duplicadosCatalogo.length}`);
      
      for (const dup of duplicadosCatalogo) {
        console.log(`Código: "${dup._id}" (${dup.count} veces)`);
        
        // Mantener el primero, eliminar el resto
        const aEliminar = dup.docs.slice(1);
        for (const doc of aEliminar) {
          console.log(`   ❌ Eliminando del catálogo: ${doc.nombre} (${doc.id})`);
          await CatalogoProducto.findByIdAndDelete(doc.id);
        }
      }
    } else {
      console.log('✅ No hay duplicados en el catálogo');
    }

  } catch (error) {
    console.error('❌ Error verificando catálogo:', error);
    throw error;
  }
}

async function estadisticasFinales() {
  console.log('\n📊 === ESTADÍSTICAS FINALES ===\n');

  try {
    const productos = await Producto.countDocuments();
    const activos = await Producto.countDocuments({ activo: true });
    const catalogo = await CatalogoProducto.countDocuments();
    const catalogoActivo = await CatalogoProducto.countDocuments({ activo: true });

    console.log(`📦 Productos totales: ${productos}`);
    console.log(`✅ Productos activos: ${activos}`);
    console.log(`📚 Catálogo total: ${catalogo}`);
    console.log(`🟢 Catálogo activo: ${catalogoActivo}`);

    // Verificar que no hay duplicados restantes
    const verificacionDuplicados = await Producto.aggregate([
      { $group: { _id: '$codigoProducto', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);

    if (verificacionDuplicados.length === 0) {
      console.log('✅ VERIFICACIÓN: No hay duplicados restantes');
    } else {
      console.log(`❌ ADVERTENCIA: Aún hay ${verificacionDuplicados.length} duplicados`);
    }

  } catch (error) {
    console.error('❌ Error en estadísticas:', error);
  }
}

async function main() {
  try {
    console.log('🚀 === LIMPIEZA DE BASE DE DATOS DE PRODUCCIÓN ===\n');
    console.log('⚠️  ADVERTENCIA: Este script modificará la base de datos de producción');
    console.log('🔄 Procesando...\n');

    await conectarProduccion();
    const duplicados = await analizar();
    await limpiarDuplicados(duplicados);
    await verificarCatalogo();
    await estadisticasFinales();
    
    console.log('\n🎉 === LIMPIEZA COMPLETADA EXITOSAMENTE ===');
    console.log('✅ La base de datos de producción ha sido limpiada');
    console.log('🚀 Ahora puedes crear productos sin errores de duplicados');
    
  } catch (error) {
    console.error('\n❌ === ERROR EN EL PROCESO ===');
    console.error(`💥 ${error.message}`);
    console.error('🔍 Revisa la conexión y los permisos de la base de datos');
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n🔌 Conexión cerrada');
    }
    process.exit(0);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = { conectarProduccion, analizar, limpiarDuplicados };
