require('dotenv').config();
const mongoose = require('mongoose');

async function solucionarProblema() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    
    const catalogoSchema = new mongoose.Schema({
      codigoproducto: String,
      nombre: String,
      activo: { type: Boolean, default: true }
    });
    
    const productoSchema = new mongoose.Schema({
      nombre: String,
      categoryName: String,
      catalogoProductoId: mongoose.Schema.Types.ObjectId,
      codigoProducto: String
    });
    
    const CatalogoProducto = mongoose.model('CatalogoProducto', catalogoSchema);
    const Producto = mongoose.model('Producto', productoSchema);
    
    console.log('\n=== SOLUCIONANDO PROBLEMA ===');
    
    // 1. Buscar todos los productos que tienen catalogoProductoId pero no existe en catálogo
    const productos = await Producto.find({});
    const catalogosNecesarios = new Set();
    
    for (const producto of productos) {
      if (producto.catalogoProductoId) {
        const existe = await CatalogoProducto.findById(producto.catalogoProductoId);
        if (!existe) {
          catalogosNecesarios.add(JSON.stringify({
            id: producto.catalogoProductoId.toString(),
            nombre: producto.nombre,
            codigo: producto.codigoProducto
          }));
        }
      }
    }
    
    console.log(`📋 Productos del catálogo que necesitan ser creados: ${catalogosNecesarios.size}`);
    
    // 2. Crear los productos faltantes en el catálogo
    for (const catalogoStr of catalogosNecesarios) {
      const catalogoData = JSON.parse(catalogoStr);
      
      console.log(`\n🔨 Creando producto del catálogo:`, catalogoData);
      
      const nuevoCatalogo = new CatalogoProducto({
        _id: catalogoData.id,
        codigoproducto: catalogoData.codigo,
        nombre: catalogoData.nombre,
        activo: true
      });
      
      try {
        await nuevoCatalogo.save();
        console.log(`✅ Creado: ${catalogoData.nombre} (${catalogoData.codigo})`);
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️ Ya existe: ${catalogoData.nombre}`);
        } else {
          console.error(`❌ Error creando ${catalogoData.nombre}:`, error.message);
        }
      }
    }
    
    // 3. Verificar que ahora todo funcione
    console.log('\n=== VERIFICACIÓN FINAL ===');
    const catalogoProblematico = await CatalogoProducto.findById('687e5466af76045e61985da5');
    if (catalogoProblematico) {
      console.log('✅ Producto del catálogo creado exitosamente:', {
        id: catalogoProblematico._id.toString(),
        nombre: catalogoProblematico.nombre,
        codigo: catalogoProblematico.codigoproducto,
        activo: catalogoProblematico.activo
      });
    } else {
      console.log('❌ Aún hay problemas');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  }
}

solucionarProblema();
