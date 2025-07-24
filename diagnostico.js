require('dotenv').config();
const mongoose = require('mongoose');

async function diagnosticarProblema() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a:', process.env.MONGODB_URI);
    
    // Definir esquemas básicos para la consulta
    const catalogoSchema = new mongoose.Schema({
      codigoproducto: String,
      nombre: String,
      activo: Boolean
    });
    
    const productoSchema = new mongoose.Schema({
      nombre: String,
      categoryName: String,
      catalogoProductoId: mongoose.Schema.Types.ObjectId
    });
    
    const CatalogoProducto = mongoose.model('CatalogoProducto', catalogoSchema);
    const Producto = mongoose.model('Producto', productoSchema);
    
    // ID problemático del catálogo
    const catalogoId = '687e5466af76045e61985da5';
    console.log('\n=== DIAGNÓSTICO DEL PROBLEMA ===');
    console.log('Buscando catálogo con ID:', catalogoId);
    
    // 1. Verificar si existe el producto del catálogo
    const catalogoProducto = await CatalogoProducto.findById(catalogoId);
    
    if (catalogoProducto) {
      console.log('✅ Producto del catálogo SÍ existe:', {
        id: catalogoProducto._id.toString(),
        nombre: catalogoProducto.nombre,
        codigo: catalogoProducto.codigoproducto,
        activo: catalogoProducto.activo
      });
    } else {
      console.log('❌ Producto del catálogo NO existe');
      
      // Listar catálogos disponibles
      const catalogos = await CatalogoProducto.find({}).limit(5);
      console.log('\n📋 Productos del catálogo disponibles:');
      catalogos.forEach(cat => {
        console.log(`  - ID: ${cat._id} | Código: ${cat.codigoproducto} | Nombre: ${cat.nombre} | Activo: ${cat.activo}`);
      });
      
      // Buscar productos que usan el catálogo problemático
      const productosProblematicos = await Producto.find({ catalogoProductoId: catalogoId });
      console.log(`\n⚠️ Productos afectados (${productosProblematicos.length}):`);
      productosProblematicos.forEach(prod => {
        console.log(`  - ID: ${prod._id} | Nombre: ${prod.nombre} | Categoría: ${prod.categoryName}`);
      });
      
      // Sugerir solución
      console.log('\n🔧 POSIBLES SOLUCIONES:');
      console.log('1. Crear el producto faltante en el catálogo');
      console.log('2. Actualizar las referencias de los productos afectados');
      console.log('3. Verificar si el producto fue eliminado accidentalmente');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  }
}

diagnosticarProblema();
