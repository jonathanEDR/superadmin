require('dotenv').config();
const mongoose = require('mongoose');

async function diagnosticarDuplicados() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    
    const InventarioProducto = mongoose.model('InventarioProducto', new mongoose.Schema({
      numeroEntrada: String,
      fechaEntrada: Date,
      productoId: mongoose.Schema.Types.ObjectId,
      cantidad: Number,
      precio: Number
    }));
    
    console.log('\n🔍 === DIAGNÓSTICO DE NÚMEROS DE ENTRADA ===');
    
    // 1. Verificar duplicados
    const duplicados = await InventarioProducto.aggregate([
      {
        $group: {
          _id: '$numeroEntrada',
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          fechas: { $push: '$fechaEntrada' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);
    
    console.log(`📋 Números duplicados encontrados: ${duplicados.length}`);
    
    if (duplicados.length > 0) {
      console.log('\n🔄 DETALLES DE DUPLICADOS:');
      duplicados.forEach(dup => {
        console.log(`  Número: ${dup._id}`);
        console.log(`  Cantidad: ${dup.count}`);
        console.log(`  IDs: ${dup.ids.join(', ')}`);
        console.log(`  Fechas: ${dup.fechas.map(f => f?.toISOString()).join(', ')}`);
        console.log('  ---');
      });
    }
    
    // 2. Verificar entradas de hoy
    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const finHoy = new Date(inicioHoy);
    finHoy.setDate(finHoy.getDate() + 1);
    
    const entradasHoy = await InventarioProducto.find({
      fechaEntrada: {
        $gte: inicioHoy,
        $lt: finHoy
      }
    }).sort({ numeroEntrada: 1 });
    
    console.log(`\n📅 Entradas de hoy (${inicioHoy.toISOString().split('T')[0]}): ${entradasHoy.length}`);
    
    entradasHoy.forEach((entrada, index) => {
      console.log(`  ${index + 1}. ${entrada.numeroEntrada} - ${entrada.fechaEntrada?.toISOString()}`);
    });
    
    // 3. Verificar el problema específico
    const problematico = await InventarioProducto.findOne({ numeroEntrada: 'ENT-20250724-002' });
    
    if (problematico) {
      console.log('\n❌ ENTRADA PROBLEMÁTICA ENCONTRADA:');
      console.log(`  ID: ${problematico._id}`);
      console.log(`  Número: ${problematico.numeroEntrada}`);
      console.log(`  Fecha: ${problematico.fechaEntrada}`);
      console.log(`  Producto: ${problematico.productoId}`);
    } else {
      console.log('\n✅ No se encontró la entrada problemática ENT-20250724-002');
    }
    
    // 4. Verificar patrón de numeración
    const patron = await InventarioProducto.find({
      numeroEntrada: { $regex: /^ENT-20250724/ }
    }).sort({ numeroEntrada: 1 });
    
    console.log(`\n🔢 Entradas con patrón ENT-20250724: ${patron.length}`);
    patron.forEach((entrada, index) => {
      console.log(`  ${index + 1}. ${entrada.numeroEntrada}`);
    });
    
  } catch (error) {
    console.error('❌ Error durante diagnóstico:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

diagnosticarDuplicados();
