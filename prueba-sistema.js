require('dotenv').config();
const mongoose = require('mongoose');

async function pruebaCompleta() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    
    // Importar el servicio corregido
    const inventarioService = require('./services/inventarioProductoService');
    
    console.log('\n🧪 === PRUEBA INTEGRAL DEL SISTEMA ===');
    
    // Datos de prueba para simular el error original
    const datosPrueba = {
      productoId: '687e54b9af76045e61985df1', // pizza peperoni
      cantidad: 50,
      precio: 4.5,
      lote: 'LOTE-TEST-001',
      observaciones: 'Entrada de prueba para validar corrección',
      usuario: 'test_usuario',
      usuarioEmail: 'test@email.com',
      fechaVencimiento: null,
      proveedor: 'Proveedor Test'
    };
    
    console.log('📝 Datos de prueba:');
    console.log(JSON.stringify(datosPrueba, null, 2));
    
    // Intentar crear la entrada que antes fallaba
    console.log('\n🚀 Intentando crear entrada de inventario...');
    
    try {
      const resultado = await inventarioService.crearEntrada(datosPrueba);
      
      console.log('✅ ENTRADA CREADA EXITOSAMENTE:');
      console.log(`  ID: ${resultado._id}`);
      console.log(`  Número: ${resultado.numeroEntrada}`);
      console.log(`  Producto: ${resultado.productoId}`);
      console.log(`  Cantidad: ${resultado.cantidad}`);
      console.log(`  Precio: ${resultado.precio}`);
      console.log(`  Fecha: ${resultado.fechaEntrada}`);
      
      // Verificar que no hay duplicados
      const InventarioProducto = mongoose.model('InventarioProducto');
      const duplicados = await InventarioProducto.find({ 
        numeroEntrada: resultado.numeroEntrada 
      });
      
      if (duplicados.length === 1) {
        console.log('  ✅ Número único confirmado');
      } else {
        console.log(`  ❌ PROBLEMA: ${duplicados.length} entradas con el mismo número`);
      }
      
      // Intentar crear otra entrada para probar unicidad
      console.log('\n🔄 Creando segunda entrada para probar unicidad...');
      
      const segundaEntrada = await inventarioService.crearEntrada({
        ...datosPrueba,
        cantidad: 25,
        lote: 'LOTE-TEST-002',
        observaciones: 'Segunda entrada de prueba'
      });
      
      console.log('✅ SEGUNDA ENTRADA CREADA:');
      console.log(`  Número: ${segundaEntrada.numeroEntrada}`);
      
      if (resultado.numeroEntrada !== segundaEntrada.numeroEntrada) {
        console.log('  ✅ Números únicos generados correctamente');
      } else {
        console.log('  ❌ ERROR: Mismo número generado dos veces');
      }
      
    } catch (error) {
      console.error('❌ ERROR EN LA PRUEBA:');
      console.error(`  Mensaje: ${error.message}`);
      console.error(`  Status: ${error.status}`);
      if (error.stack) {
        console.error(`  Stack: ${error.stack.split('\\n')[0]}`);
      }
    }
    
    console.log('\n📊 === ESTADO FINAL ===');
    
    // Mostrar estadísticas finales
    const InventarioProducto = mongoose.model('InventarioProducto');
    const totalEntradas = await InventarioProducto.countDocuments();
    const numerosUnicos = await InventarioProducto.distinct('numeroEntrada');
    
    console.log(`Total entradas: ${totalEntradas}`);
    console.log(`Números únicos: ${numerosUnicos.length}`);
    console.log(`Integridad: ${totalEntradas === numerosUnicos.length ? '✅ OK' : '❌ FALLA'}`);
    
  } catch (error) {
    console.error('❌ Error en prueba integral:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

pruebaCompleta();
