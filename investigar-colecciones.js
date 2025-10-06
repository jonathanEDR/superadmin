const mongoose = require('mongoose');

/**
 * Script para investigar la estructura real de las colecciones
 * y verificar si hay discrepancia entre los modelos y los datos reales
 */

async function investigarColecciones() {
  try {
    // Conectar a la base de datos
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/superadmin';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Obtener todas las colecciones
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    console.log('📂 ANÁLISIS DETALLADO DE COLECCIONES:\n');
    
    for (const col of collections) {
      console.log(`🗃️  Colección: ${col.name}`);
      
      try {
        // Contar documentos
        const count = await mongoose.connection.db.collection(col.name).countDocuments();
        console.log(`   📊 Documentos: ${count}`);
        
        if (count > 0) {
          // Obtener una muestra del primer documento
          const sample = await mongoose.connection.db.collection(col.name).findOne();
          console.log(`   📋 Estructura de muestra:`);
          console.log(`       ${JSON.stringify(sample, null, 6).substring(0, 200)}...`);
          
          // Obtener los últimos 3 documentos para ver actividad reciente
          const recent = await mongoose.connection.db.collection(col.name)
            .find({})
            .sort({ _id: -1 })
            .limit(3)
            .toArray();
          
          console.log(`   🕐 Documentos recientes: ${recent.length}`);
          recent.forEach((doc, index) => {
            console.log(`       ${index + 1}. ID: ${doc._id}`);
            if (doc.nombre) console.log(`          Nombre: ${doc.nombre}`);
            if (doc.codigoproducto) console.log(`          Código: ${doc.codigoproducto}`);
            if (doc.numeroEntrada) console.log(`          Entrada: ${doc.numeroEntrada}`);
            if (doc.createdAt) console.log(`          Creado: ${doc.createdAt}`);
          });
        }
        
        console.log();
      } catch (error) {
        console.log(`   ❌ Error al analizar: ${error.message}\n`);
      }
    }

    // Verificar si el problema específico mencionado en los logs existe
    console.log('🔍 BUSCANDO EL PRODUCTO PROBLEMÁTICO ESPECÍFICO:\n');
    const productoProblemático = '688431565042249698785120';
    
    // Buscar en todas las colecciones
    for (const col of collections) {
      try {
        const resultados = await mongoose.connection.db.collection(col.name).find({
          $or: [
            { _id: productoProblemático },
            { codigoproducto: productoProblemático },
            { catalogoProductoId: productoProblemático },
            { productoId: productoProblemático }
          ]
        }).toArray();
        
        if (resultados.length > 0) {
          console.log(`🎯 Encontrado en colección '${col.name}': ${resultados.length} documentos`);
          resultados.forEach((doc, index) => {
            console.log(`   ${index + 1}. ${JSON.stringify(doc, null, 2)}`);
          });
        }
      } catch (error) {
        console.log(`⚠️  Error buscando en ${col.name}: ${error.message}`);
      }
    }

    console.log('\n📋 RECOMENDACIONES BASADAS EN HALLAZGOS:');
    
    const totalDocuments = await Promise.all(
      collections.map(async (col) => {
        try {
          const count = await mongoose.connection.db.collection(col.name).countDocuments();
          return { name: col.name, count };
        } catch {
          return { name: col.name, count: 0 };
        }
      })
    );
    
    const coleccionesConDatos = totalDocuments.filter(col => col.count > 0);
    
    if (coleccionesConDatos.length === 0) {
      console.log('   ❗ Base de datos completamente vacía - inicialización necesaria');
    } else {
      console.log('   📈 Colecciones con datos encontradas:');
      coleccionesConDatos.forEach(col => {
        console.log(`      - ${col.name}: ${col.count} documentos`);
      });
      
      console.log('\n   💡 Posibles problemas:');
      console.log('      1. Los modelos Mongoose no coinciden con los nombres reales');
      console.log('      2. Problema de conexión a la base de datos correcta');
      console.log('      3. Los datos están en formato diferente al esperado');
    }

  } catch (error) {
    console.error('💥 Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar
investigarColecciones();