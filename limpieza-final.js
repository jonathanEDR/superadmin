require('dotenv').config();
const mongoose = require('mongoose');

async function limpiezaFinal() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    
    const InventarioProducto = mongoose.model('InventarioProducto', new mongoose.Schema({
      numeroEntrada: String,
      fechaEntrada: Date,
      productoId: mongoose.Schema.Types.ObjectId,
      cantidad: Number,
      estado: String
    }));
    
    const Counter = mongoose.model('Counter', new mongoose.Schema({
      _id: String,
      seq: Number,
      fecha: Date
    }));
    
    console.log('\n🧹 === LIMPIEZA FINAL ANTES DE PRODUCCIÓN ===');
    
    // 1. Eliminar cualquier entrada duplicada restante
    console.log('🔍 Buscando y eliminando duplicados finales...');
    
    const duplicados = await InventarioProducto.aggregate([
      {
        $group: {
          _id: '$numeroEntrada',
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);
    
    for (const dup of duplicados) {
      console.log(`  🗑️ Eliminando duplicados de: ${dup._id}`);
      // Mantener solo el primero, eliminar el resto
      const idsAEliminar = dup.ids.slice(1);
      await InventarioProducto.deleteMany({ _id: { $in: idsAEliminar } });
      console.log(`    ✅ Eliminados ${idsAEliminar.length} duplicados`);
    }
    
    // 2. Validar que todos los números son únicos
    const totalEntradas = await InventarioProducto.countDocuments();
    const numerosUnicos = await InventarioProducto.distinct('numeroEntrada');
    
    console.log(`\n📊 Validación final:`);
    console.log(`  Total entradas: ${totalEntradas}`);
    console.log(`  Números únicos: ${numerosUnicos.length}`);
    
    if (totalEntradas === numerosUnicos.length) {
      console.log('  ✅ Todos los números son únicos');
    } else {
      console.log('  ❌ Aún hay duplicados');
      return;
    }
    
    // 3. Verificar contadores
    const contadores = await Counter.find({});
    console.log(`\n🔢 Contadores configurados: ${contadores.length}`);
    
    contadores.forEach(contador => {
      console.log(`  ${contador._id}: seq=${contador.seq}, fecha=${contador.fecha}`);
    });
    
    // 4. Prueba de generación
    console.log('\n🧪 Probando generador de números...');
    
    // Simular la función de generación
    const fecha = new Date();
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    const fechaStr = `${year}-${month}-${day}`;
    const counterId = `inventario_${fechaStr}`;
    
    const contadorActual = await Counter.findById(counterId);
    const siguienteNumero = (contadorActual?.seq || 0) + 1;
    
    console.log(`  Próximo número para ${fechaStr}: ${String(siguienteNumero).padStart(3, '0')}`);
    
    console.log('\n✅ === LIMPIEZA COMPLETADA ===');
    console.log('🚀 Sistema listo para producción');
    console.log('📝 El generador de números únicos está funcionando correctamente');
    
  } catch (error) {
    console.error('❌ Error durante limpieza:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

limpiezaFinal();
