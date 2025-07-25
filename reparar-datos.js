require('dotenv').config();
const mongoose = require('mongoose');

async function limpiarYRepararDatos() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado a MongoDB');
    
    // Definir esquemas
    const CatalogoProducto = mongoose.model('CatalogoProducto', new mongoose.Schema({
      codigoproducto: String,
      nombre: String,
      activo: { type: Boolean, default: true }
    }));
    
    const Producto = mongoose.model('Producto', new mongoose.Schema({
      nombre: String,
      categoryName: String,
      catalogoProductoId: mongoose.Schema.Types.ObjectId,
      codigoProducto: String,
      cantidad: Number,
      cantidadRestante: Number,
      cantidadVendida: Number
    }));
    
    const InventarioProducto = mongoose.model('InventarioProducto', new mongoose.Schema({
      productoId: mongoose.Schema.Types.ObjectId,
      catalogoProductoId: mongoose.Schema.Types.ObjectId,
      cantidad: Number,
      cantidadDisponible: Number,
      precio: Number,
      estado: String,
      numeroEntrada: String
    }));
    
    console.log('\\n🔍 === DIAGNÓSTICO DE PROBLEMAS ===');
    
    // 1. Verificar productos con referencias rotas al catálogo
    const productos = await Producto.find({});
    let productosProblematicos = [];
    
    for (const producto of productos) {
      if (producto.catalogoProductoId) {
        const catalogo = await CatalogoProducto.findById(producto.catalogoProductoId);
        if (!catalogo) {
          productosProblematicos.push({
            id: producto._id,
            nombre: producto.nombre,
            catalogoIdRoto: producto.catalogoProductoId
          });
        }
      }
    }
    
    console.log(`📋 Productos con referencias rotas: ${productosProblematicos.length}`);
    
    // 2. Verificar inventarios con referencias rotas
    const inventarios = await InventarioProducto.find({});
    let inventariosProblematicos = [];
    
    for (const inventario of inventarios) {
      const productoExiste = await Producto.findById(inventario.productoId);
      const catalogoExiste = await CatalogoProducto.findById(inventario.catalogoProductoId);
      
      if (!productoExiste || !catalogoExiste) {
        inventariosProblematicos.push({
          id: inventario._id,
          numeroEntrada: inventario.numeroEntrada,
          productoIdRoto: !productoExiste ? inventario.productoId : null,
          catalogoIdRoto: !catalogoExiste ? inventario.catalogoProductoId : null
        });
      }
    }
    
    console.log(`📦 Inventarios con referencias rotas: ${inventariosProblematicos.length}`);
    
    // 3. Buscar duplicados en números de entrada
    const entradasDuplicadas = await InventarioProducto.aggregate([
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
    
    console.log(`🔄 Números de entrada duplicados: ${entradasDuplicadas.length}`);
    
    console.log('\\n🔧 === REPARANDO PROBLEMAS ===');
    
    // REPARACIÓN 1: Limpiar inventarios con referencias rotas
    if (inventariosProblematicos.length > 0) {
      console.log(`🗑️ Eliminando ${inventariosProblematicos.length} inventarios con referencias rotas...`);
      const idsAEliminar = inventariosProblematicos.map(inv => inv.id);
      const resultado = await InventarioProducto.deleteMany({ _id: { $in: idsAEliminar } });
      console.log(`✅ Eliminados ${resultado.deletedCount} inventarios corruptos`);
    }
    
    // REPARACIÓN 2: Corregir duplicados en números de entrada
    for (const duplicado of entradasDuplicadas) {
      console.log(`🔄 Corrigiendo duplicados para entrada: ${duplicado._id}`);
      // Mantener el primero, regenerar números para los demás
      const inventariosDuplicados = await InventarioProducto.find({ 
        _id: { $in: duplicado.ids.slice(1) } // Omitir el primero
      });
      
      for (let i = 0; i < inventariosDuplicados.length; i++) {
        const inventario = inventariosDuplicados[i];
        const fecha = new Date();
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        const timestamp = Date.now().toString().slice(-4);
        
        inventario.numeroEntrada = `ENT-${year}${month}${day}-${timestamp}-${i}`;
        await inventario.save();
        console.log(`  ✅ Renumerado: ${inventario.numeroEntrada}`);
      }
    }
    
    // REPARACIÓN 3: Recalcular stocks de productos
    console.log('🔢 Recalculando stocks de productos...');
    for (const producto of productos) {
      // Obtener sum total de inventarios activos para este producto
      const totalInventario = await InventarioProducto.aggregate([
        {
          $match: { 
            productoId: producto._id,
            estado: { $ne: 'inactivo' }
          }
        },
        {
          $group: {
            _id: null,
            totalDisponible: { $sum: '$cantidadDisponible' }
          }
        }
      ]);
      
      const cantidadReal = totalInventario[0]?.totalDisponible || 0;
      const cantidadVendida = producto.cantidadVendida || 0;
      const cantidadTotal = cantidadReal + cantidadVendida;
      
      // Actualizar producto con valores correctos
      await Producto.findByIdAndUpdate(producto._id, {
        cantidad: cantidadTotal,
        cantidadRestante: cantidadReal
      });
      
      console.log(`  📊 ${producto.nombre}: Total=${cantidadTotal}, Disponible=${cantidadReal}, Vendida=${cantidadVendida}`);
    }
    
    console.log('\\n🧹 === LIMPIEZA FINAL ===');
    
    // Eliminar documentos huérfanos
    await mongoose.connection.db.collection('movimientoinventarios').deleteMany({
      inventario: { $exists: false }
    });
    
    // Limpiar contadores corruptos
    await mongoose.connection.db.collection('counters').deleteMany({
      seq: { $lt: 0 }
    });
    
    console.log('\\n✅ === REPARACIÓN COMPLETADA ===');
    console.log('🎉 Base de datos limpia y reparada');
    console.log('📝 Resumen:');
    console.log(`   - Inventarios corruptos eliminados: ${inventariosProblematicos.length}`);
    console.log(`   - Duplicados corregidos: ${entradasDuplicadas.length}`);
    console.log(`   - Productos actualizados: ${productos.length}`);
    
  } catch (error) {
    console.error('❌ Error durante la reparación:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\\n🔌 Desconectado de MongoDB');
  }
}

limpiarYRepararDatos();
