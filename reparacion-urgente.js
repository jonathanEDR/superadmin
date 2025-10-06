const mongoose = require('mongoose');
const Producto = require('./models/Producto');
const CatalogoProducto = require('./models/CatalogoProducto');

/**
 * Script de Reparación Urgente para Referencias Rotas
 * Específicamente diseñado para solucionar el error CATALOG_REFERENCE_CORRUPTION
 */

async function reparacionUrgente() {
  try {
    require('dotenv').config();
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/superadmin');
    console.log('✅ Conectado a MongoDB\n');

    console.log('🚑 INICIANDO REPARACIÓN URGENTE DE REFERENCIAS ROTAS\n');

    // 1. Identificar productos con referencias rotas
    console.log('1️⃣ Identificando productos con catalogoProductoId roto...');
    
    const productos = await Producto.find({});
    console.log(`   📊 Total de productos encontrados: ${productos.length}`);
    
    const productosRotos = [];
    
    for (const producto of productos) {
      if (producto.catalogoProductoId) {
        try {
          const catalogoExiste = await CatalogoProducto.findById(producto.catalogoProductoId);
          if (!catalogoExiste) {
            productosRotos.push({
              producto: producto,
              catalogoRotoId: producto.catalogoProductoId
            });
            console.log(`   🚨 ROTO: Producto "${producto.nombre || producto.codigoProducto}" referencia catálogo inexistente: ${producto.catalogoProductoId}`);
          }
        } catch (error) {
          console.log(`   ⚠️  Error verificando producto ${producto._id}: ${error.message}`);
        }
      } else {
        productosRotos.push({
          producto: producto,
          catalogoRotoId: null
        });
        console.log(`   🚨 SIN REFERENCIA: Producto "${producto.nombre || producto.codigoProducto}" no tiene catalogoProductoId`);
      }
    }

    console.log(`\n📊 Productos con referencias rotas: ${productosRotos.length}\n`);

    if (productosRotos.length === 0) {
      console.log('✅ No se encontraron referencias rotas. El problema puede estar en otro lugar.');
      return;
    }

    // 2. Reparar cada producto roto
    console.log('2️⃣ Reparando productos con referencias rotas...\n');
    
    let reparacionesExitosas = 0;
    let reparacionesFallidas = 0;

    for (let i = 0; i < productosRotos.length; i++) {
      const { producto, catalogoRotoId } = productosRotos[i];
      
      try {
        console.log(`   🔧 Reparando ${i + 1}/${productosRotos.length}: ${producto.nombre || producto.codigoProducto}`);
        
        // Buscar si existe un catálogo con el mismo código o nombre
        let catalogoExistente = null;
        
        if (producto.codigoProducto) {
          catalogoExistente = await CatalogoProducto.findOne({ codigoproducto: producto.codigoProducto });
        }
        
        if (!catalogoExistente && producto.nombre) {
          catalogoExistente = await CatalogoProducto.findOne({ nombre: producto.nombre });
        }

        let catalogoParaUsar;
        
        if (catalogoExistente) {
          // Usar catálogo existente
          catalogoParaUsar = catalogoExistente;
          console.log(`      ♻️  Usando catálogo existente: ${catalogoExistente.nombre}`);
        } else {
          // Crear nuevo catálogo
          const nuevoCatalogo = new CatalogoProducto({
            codigoproducto: producto.codigoProducto || `AUTO-${Date.now()}-${i}`,
            nombre: producto.nombre || `Producto ${producto.codigoProducto || producto._id}`,
            descripcion: `Catálogo creado automáticamente para reparar referencia rota`,
            categoria: producto.categoryName || 'General',
            precio: producto.precio || 0,
            activo: true,
            fechaCreacion: new Date(),
            creadoPor: 'sistema-reparacion'
          });
          
          catalogoParaUsar = await nuevoCatalogo.save();
          console.log(`      ✨ Nuevo catálogo creado: ${catalogoParaUsar.nombre}`);
        }
        
        // Actualizar producto con la referencia correcta
        producto.catalogoProductoId = catalogoParaUsar._id;
        await producto.save();
        
        reparacionesExitosas++;
        console.log(`      ✅ Reparación exitosa\n`);
        
      } catch (error) {
        reparacionesFallidas++;
        console.log(`      ❌ Error en reparación: ${error.message}\n`);
      }
    }

    // 3. Resumen de reparaciones
    console.log('📊 RESUMEN DE REPARACIONES:');
    console.log('═'.repeat(50));
    console.log(`🔧 Productos procesados: ${productosRotos.length}`);
    console.log(`✅ Reparaciones exitosas: ${reparacionesExitosas}`);
    console.log(`❌ Reparaciones fallidas: ${reparacionesFallidas}`);
    console.log('═'.repeat(50));

    // 4. Verificar que las reparaciones funcionaron
    console.log('\n4️⃣ Verificando reparaciones...');
    
    let verificacionesExitosas = 0;
    for (const { producto } of productosRotos) {
      try {
        const productoActualizado = await Producto.findById(producto._id);
        if (productoActualizado.catalogoProductoId) {
          const catalogoReferenciado = await CatalogoProducto.findById(productoActualizado.catalogoProductoId);
          if (catalogoReferenciado) {
            verificacionesExitosas++;
          }
        }
      } catch (error) {
        console.log(`   ⚠️  Error verificando ${producto._id}: ${error.message}`);
      }
    }

    console.log(`✅ Referencias verificadas como válidas: ${verificacionesExitosas}/${productosRotos.length}\n`);

    if (verificacionesExitosas === productosRotos.length) {
      console.log('🎉 ¡TODAS LAS REFERENCIAS HAN SIDO REPARADAS!');
      console.log('   Ahora puedes probar el registro de inventario en el frontend.');
    } else {
      console.log('⚠️  Algunas referencias aún tienen problemas. Revisar manualmente.');
    }

  } catch (error) {
    console.error('💥 Error durante la reparación:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

// Ejecutar reparación
reparacionUrgente();