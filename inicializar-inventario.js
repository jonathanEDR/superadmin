const mongoose = require('mongoose');
const CatalogoProducto = require('./models/CatalogoProducto');
const Producto = require('./models/Producto');
const InventarioProducto = require('./models/InventarioProducto');

/**
 * Script de Inicialización para el Módulo de Inventario
 * Crea datos de ejemplo para poder trabajar con el sistema
 */

async function inicializarDatos() {
  try {
    // Conectar a la base de datos
    require('dotenv').config();
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/superadmin';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    console.log('🚀 INICIALIZANDO DATOS DE EJEMPLO PARA INVENTARIO\n');

    // 1. Crear categorías en el catálogo
    console.log('1️⃣ Creando productos en el catálogo...');
    
    const catalogos = [
      {
        codigoproducto: '10004',
        nombre: 'Pizza Hawaiana Personal',
        descripcion: 'Pizza personal con piña y jamón',
        categoria: 'Pizzas',
        precio: 15.00,
        activo: true
      },
      {
        codigoproducto: '10005',
        nombre: 'Pizza Margherita Familiar',
        descripcion: 'Pizza familiar clásica con tomate y albahaca',
        categoria: 'Pizzas',
        precio: 25.00,
        activo: true
      },
      {
        codigoproducto: '10006',
        nombre: 'Bebida Coca Cola 500ml',
        descripcion: 'Gaseosa Coca Cola de 500ml',
        categoria: 'Bebidas',
        precio: 3.50,
        activo: true
      },
      {
        codigoproducto: '10007',
        nombre: 'Ensalada César',
        descripcion: 'Ensalada fresca con pollo y aderezo césar',
        categoria: 'Ensaladas',
        precio: 12.00,
        activo: true
      }
    ];

    const catalogosCreados = [];
    for (const catData of catalogos) {
      try {
        // Verificar si ya existe
        const existe = await CatalogoProducto.findOne({ codigoproducto: catData.codigoproducto });
        if (!existe) {
          const catalogo = new CatalogoProducto(catData);
          await catalogo.save();
          catalogosCreados.push(catalogo);
          console.log(`   ✅ Catálogo creado: ${catData.codigoproducto} - ${catData.nombre}`);
        } else {
          catalogosCreados.push(existe);
          console.log(`   📋 Catálogo existente: ${catData.codigoproducto} - ${catData.nombre}`);
        }
      } catch (error) {
        console.log(`   ❌ Error creando catálogo ${catData.codigoproducto}: ${error.message}`);
      }
    }

    console.log(`\n✅ Catálogos procesados: ${catalogosCreados.length}\n`);

    // 2. Crear productos registrados (que referencian al catálogo)
    console.log('2️⃣ Creando productos registrados...');
    
    const productosRegistrados = [];
    for (const catalogo of catalogosCreados) {
      try {
        // Verificar si ya existe un producto registrado para este catálogo
        const existeProducto = await Producto.findOne({ catalogoProductoId: catalogo._id });
        
        if (!existeProducto) {
          const producto = new Producto({
            catalogoProductoId: catalogo._id,
            codigoProducto: catalogo.codigoproducto,
            nombreProducto: catalogo.nombre,
            descripcionProducto: catalogo.descripcion,
            precio: catalogo.precio,
            categoria: catalogo.categoria,
            activo: true,
            fechaCreacion: new Date()
          });
          
          await producto.save();
          productosRegistrados.push(producto);
          console.log(`   ✅ Producto registrado: ${producto.codigoProducto}`);
        } else {
          productosRegistrados.push(existeProducto);
          console.log(`   📋 Producto existente: ${existeProducto.codigoProducto}`);
        }
      } catch (error) {
        console.log(`   ❌ Error registrando producto para ${catalogo.codigoproducto}: ${error.message}`);
      }
    }

    console.log(`\n✅ Productos registrados procesados: ${productosRegistrados.length}\n`);

    // 3. Crear algunas entradas de inventario de ejemplo
    console.log('3️⃣ Creando entradas de inventario de ejemplo...');
    
    let entradasCreadas = 0;
    for (let i = 0; i < productosRegistrados.length; i++) {
      const producto = productosRegistrados[i];
      const catalogo = catalogosCreados[i];
      
      try {
        // Crear entrada de inventario
        const entrada = new InventarioProducto({
          productoId: producto._id,
          catalogoProductoId: catalogo._id,
          cantidad: 50 + (i * 10), // Cantidades variables
          cantidadInicial: 50 + (i * 10),
          cantidadDisponible: 50 + (i * 10),
          precio: catalogo.precio,
          fechaEntrada: new Date(),
          lote: `LOTE-${Date.now()}-${i}`,
          numeroEntrada: `ENT-INIT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
          observaciones: 'Entrada inicial creada durante inicialización del sistema',
          estado: 'activo',
          usuario: 'sistema',
          usuarioEmail: 'sistema@superadmin.com',
          proveedor: 'Proveedor Inicial'
        });
        
        await entrada.save();
        entradasCreadas++;
        console.log(`   ✅ Entrada creada: ${entrada.numeroEntrada} para ${catalogo.nombre}`);
        
      } catch (error) {
        console.log(`   ❌ Error creando entrada para ${catalogo.nombre}: ${error.message}`);
      }
    }

    console.log(`\n✅ Entradas de inventario creadas: ${entradasCreadas}\n`);

    // 4. Mostrar resumen final
    console.log('📊 RESUMEN DE INICIALIZACIÓN:');
    console.log('═'.repeat(50));
    
    const totalCatalogos = await CatalogoProducto.countDocuments();
    const totalProductos = await Producto.countDocuments();
    const totalInventarios = await InventarioProducto.countDocuments();
    
    console.log(`📦 Catálogo de Productos: ${totalCatalogos}`);
    console.log(`🏷️  Productos Registrados: ${totalProductos}`);
    console.log(`📋 Entradas de Inventario: ${totalInventarios}`);
    console.log('═'.repeat(50));
    
    console.log('\n🎉 ¡INICIALIZACIÓN COMPLETADA!');
    console.log('   El sistema de inventario ahora tiene datos de ejemplo.');
    console.log('   Puedes probar el registro de nuevas entradas en el frontend.\n');

  } catch (error) {
    console.error('💥 Error durante la inicialización:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar inicialización
inicializarDatos();