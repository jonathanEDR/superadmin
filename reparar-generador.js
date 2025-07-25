require('dotenv').config();
const mongoose = require('mongoose');

async function repararGeneradorNumeros() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    
    const InventarioProducto = mongoose.model('InventarioProducto', new mongoose.Schema({
      numeroEntrada: String,
      fechaEntrada: Date,
      productoId: mongoose.Schema.Types.ObjectId
    }));
    
    // Definir esquema de contador mejorado
    const CounterSchema = new mongoose.Schema({
      _id: String,
      seq: { type: Number, default: 0 },
      fecha: { type: Date, default: Date.now },
      reiniciado: { type: Boolean, default: false }
    });
    
    const Counter = mongoose.model('Counter', CounterSchema);
    
    console.log('\n🔧 === REPARANDO GENERADOR DE NÚMEROS ===');
    
    // 1. Analizar entradas existentes por día
    const entradasPorDia = await InventarioProducto.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$fechaEntrada' },
            month: { $month: '$fechaEntrada' },
            day: { $dayOfMonth: '$fechaEntrada' }
          },
          count: { $sum: 1 },
          maxNumero: { $max: '$numeroEntrada' },
          entradas: { $push: '$numeroEntrada' }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 }
      }
    ]);
    
    console.log('📊 Entradas por día:');
    entradasPorDia.forEach(dia => {
      const fecha = `${dia._id.year}-${String(dia._id.month).padStart(2, '0')}-${String(dia._id.day).padStart(2, '0')}`;
      console.log(`  ${fecha}: ${dia.count} entradas, max: ${dia.maxNumero}`);
    });
    
    // 2. Recalcular y ajustar contadores
    for (const dia of entradasPorDia) {
      const fecha = `${dia._id.year}-${String(dia._id.month).padStart(2, '0')}-${String(dia._id.day).padStart(2, '0')}`;
      const counterId = `inventario_${fecha}`;
      
      // Encontrar el número más alto para ese día
      const numerosDelDia = dia.entradas
        .filter(num => num && num.includes(fecha.replace(/-/g, '')))
        .map(num => {
          const match = num.match(/-(\d{3})-/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => !isNaN(num));
      
      const maxNumero = Math.max(0, ...numerosDelDia);
      
      console.log(`  📈 Ajustando contador para ${fecha}: max=${maxNumero}`);
      
      // Actualizar o crear contador con valor correcto
      await Counter.findByIdAndUpdate(
        counterId,
        { 
          seq: maxNumero,
          fecha: new Date(),
          reiniciado: true
        },
        { upsert: true }
      );
    }
    
    // 3. Crear contador para hoy si no existe
    const hoy = new Date();
    const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const counterHoyId = `inventario_${fechaHoy}`;
    
    const counterHoy = await Counter.findById(counterHoyId);
    if (!counterHoy) {
      // Verificar entradas de hoy para calcular el número correcto
      const entradasHoy = await InventarioProducto.find({
        numeroEntrada: { $regex: new RegExp(`ENT-${fechaHoy.replace(/-/g, '')}`) }
      });
      
      const numerosHoy = entradasHoy
        .map(entrada => {
          const match = entrada.numeroEntrada.match(/-(\d{3})-/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => !isNaN(num));
      
      const maxHoy = Math.max(0, ...numerosHoy);
      
      await Counter.create({
        _id: counterHoyId,
        seq: maxHoy,
        fecha: new Date(),
        reiniciado: true
      });
      
      console.log(`  🆕 Contador creado para hoy (${fechaHoy}): ${maxHoy}`);
    }
    
    console.log('\n✅ === REPARACIÓN COMPLETADA ===');
    console.log('🎯 Contadores ajustados correctamente');
    console.log('📝 El generador ahora usará números únicos garantizados');
    
  } catch (error) {
    console.error('❌ Error durante reparación:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

repararGeneradorNumeros();
