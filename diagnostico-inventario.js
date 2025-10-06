const mongoose = require('mongoose');
const CatalogoProducto = require('./models/CatalogoProducto');
const Producto = require('./models/Producto');
const InventarioProducto = require('./models/InventarioProducto');
const Inventario = require('./models/Inventario');

/**
 * Script de Diagnóstico y Reparación Urgente del Módulo de Inventario
 * Identifica y corrige referencias rotas detectadas en logs
 */

class DiagnosticoInventario {
  constructor() {
    this.problemas = {
      catalogoRotos: [],
      productosHuerfanos: [],
      inventarioInconsistente: [],
      indicesProblematicos: []
    };
    this.estadisticas = {
      catalogoTotal: 0,
      productosTotal: 0,
      inventarioTotal: 0,
      problemasDetectados: 0,
      reparacionesRealizadas: 0
    };
  }

  async conectarDB() {
    try {
      if (mongoose.connection.readyState === 0) {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/superadmin';
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado a MongoDB para diagnóstico');
      }
    } catch (error) {
      console.error('❌ Error al conectar a MongoDB:', error);
      throw error;
    }
  }

  async diagnosticoCompleto() {
    console.log('🔍 INICIANDO DIAGNÓSTICO COMPLETO DEL MÓDULO DE INVENTARIO\n');
    
    try {
      await this.conectarDB();
      
      // 1. Estadísticas generales
      await this.obtenerEstadisticas();
      
      // 2. Identificar referencias rotas específicas
      await this.identificarCatalogoRoto();
      
      // 3. Validar consistencia entre modelos
      await this.validarConsistenciaModelos();
      
      // 4. Identificar productos huérfanos
      await this.identificarProductosHuerfanos();
      
      // 5. Validar inventario inconsistente
      await this.validarInventarioInconsistente();
      
      // 6. Mostrar resumen
      this.mostrarResumenDiagnostico();
      
    } catch (error) {
      console.error('❌ Error durante el diagnóstico:', error);
    }
  }

  async obtenerEstadisticas() {
    console.log('📊 OBTENIENDO ESTADÍSTICAS GENERALES...\n');
    
    this.estadisticas.catalogoTotal = await CatalogoProducto.countDocuments();
    this.estadisticas.productosTotal = await Producto.countDocuments();
    this.estadisticas.inventarioTotal = await InventarioProducto.countDocuments();
    
    console.log(`📦 Catálogo de Productos: ${this.estadisticas.catalogoTotal}`);
    console.log(`🏷️  Productos Registrados: ${this.estadisticas.productosTotal}`);
    console.log(`📋 Entradas de Inventario: ${this.estadisticas.inventarioTotal}`);
    
    // Verificar si la base de datos está completamente vacía
    if (this.estadisticas.catalogoTotal === 0 && this.estadisticas.productosTotal === 0 && this.estadisticas.inventarioTotal === 0) {
      console.log('\n⚠️  BASE DE DATOS APARENTEMENTE VACÍA');
      console.log('   Esto puede indicar:');
      console.log('   1. Nueva instalación sin datos');
      console.log('   2. Problema de conexión a la base correcta');
      console.log('   3. Colecciones con nombres diferentes\n');
      
      // Listar todas las colecciones disponibles
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('📂 Colecciones disponibles en la base de datos:');
      collections.forEach(col => {
        console.log(`   - ${col.name}`);
      });
      console.log();
    }
  }

  async identificarCatalogoRoto() {
    console.log('🔍 IDENTIFICANDO REFERENCIAS ROTAS EN CATÁLOGO...\n');
    
    // Problema específico detectado en logs
    const productoProblemático = '688431565042249698785120';
    console.log(`🎯 Analizando producto problemático: ${productoProblemático}`);
    
    // Buscar en todos los modelos
    const enCatalogo = await CatalogoProducto.findOne({
      $or: [
        { _id: productoProblemático },
        { codigoproducto: productoProblemático },
        { nombre: { $regex: productoProblemático, $options: 'i' } }
      ]
    });
    
    const enProductos = await Producto.findOne({
      $or: [
        { _id: productoProblemático },
        { catalogoProductoId: productoProblemático },
        { codigoProducto: productoProblemático }
      ]
    });
    
    const enInventario = await InventarioProducto.find({
      $or: [
        { catalogoProductoId: productoProblemático },
        { productoId: productoProblemático }
      ]
    });

    console.log(`   - En Catálogo: ${enCatalogo ? '✅ Encontrado' : '❌ NO ENCONTRADO'}`);
    console.log(`   - En Productos: ${enProductos ? '✅ Encontrado' : '❌ NO ENCONTRADO'}`);
    console.log(`   - En Inventario: ${enInventario.length} registros\n`);

    if (enCatalogo) {
      console.log('📋 Datos del catálogo encontrado:');
      console.log(`   - ID: ${enCatalogo._id}`);
      console.log(`   - Código: ${enCatalogo.codigoproducto}`);
      console.log(`   - Nombre: ${enCatalogo.nombre}`);
    }

    if (enProductos) {
      console.log('🏷️ Datos del producto encontrado:');
      console.log(`   - ID: ${enProductos._id}`);
      console.log(`   - Código: ${enProductos.codigoProducto}`);
      console.log(`   - CatálogoID: ${enProductos.catalogoProductoId}`);
    }

    // Buscar todos los catálogos rotos
    const catalogosRotos = await this.buscarCatalogosRotos();
    this.problemas.catalogoRotos = catalogosRotos;
    
    console.log(`🚨 Total de referencias rotas encontradas: ${catalogosRotos.length}\n`);
  }

  async buscarCatalogosRotos() {
    console.log('🔎 Buscando todas las referencias rotas...\n');
    
    const productos = await Producto.find({});
    const catalogosRotos = [];
    
    for (const producto of productos) {
      if (producto.catalogoProductoId) {
        const catalogoExiste = await CatalogoProducto.findById(producto.catalogoProductoId);
        if (!catalogoExiste) {
          catalogosRotos.push({
            productoId: producto._id,
            codigoProducto: producto.codigoProducto,
            catalogoRotoId: producto.catalogoProductoId,
            tipo: 'CATALOGO_NO_EXISTE'
          });
        }
      }
    }
    
    return catalogosRotos;
  }

  async validarConsistenciaModelos() {
    console.log('🔍 VALIDANDO CONSISTENCIA ENTRE MODELOS...\n');
    
    // Verificar InventarioProducto con referencias rotas
    const inventariosProblematicos = [];
    const inventarios = await InventarioProducto.find({}).limit(100);
    
    for (const inventario of inventarios) {
      const problemas = [];
      
      // Verificar catalogoProductoId
      if (inventario.catalogoProductoId) {
        const catalogoExiste = await CatalogoProducto.findById(inventario.catalogoProductoId);
        if (!catalogoExiste) {
          problemas.push('CATALOGO_NO_EXISTE');
        }
      }
      
      // Verificar productoId
      if (inventario.productoId) {
        const productoExiste = await Producto.findById(inventario.productoId);
        if (!productoExiste) {
          problemas.push('PRODUCTO_NO_EXISTE');
        }
      }
      
      if (problemas.length > 0) {
        inventariosProblematicos.push({
          inventarioId: inventario._id,
          numeroEntrada: inventario.numeroEntrada,
          problemas: problemas,
          catalogoId: inventario.catalogoProductoId,
          productoId: inventario.productoId
        });
      }
    }
    
    this.problemas.inventarioInconsistente = inventariosProblematicos;
    console.log(`🚨 Inventarios con problemas: ${inventariosProblematicos.length}\n`);
    
    // Mostrar los primeros 5 problemas
    inventariosProblematicos.slice(0, 5).forEach((item, index) => {
      console.log(`   ${index + 1}. Entrada: ${item.numeroEntrada}`);
      console.log(`      Problemas: ${item.problemas.join(', ')}`);
      console.log(`      CatálogoID: ${item.catalogoId}`);
      console.log(`      ProductoID: ${item.productoId}\n`);
    });
  }

  async identificarProductosHuerfanos() {
    console.log('🔍 IDENTIFICANDO PRODUCTOS HUÉRFANOS...\n');
    
    try {
      // Buscar productos con diferentes tipos de problemas en catalogoProductoId
      const productosHuerfanos = await Producto.find({
        $or: [
          { catalogoProductoId: { $exists: false } },
          { catalogoProductoId: null }
        ]
      });
      
      // Buscar por separado los que tienen string vacío (para evitar cast error)
      const productosStringVacio = await Producto.find({
        catalogoProductoId: ""
      }).catch(() => []); // Si falla el cast, retorna array vacío
      
      // Combinar resultados
      const todosHuerfanos = [...productosHuerfanos, ...productosStringVacio];
      
      this.problemas.productosHuerfanos = todosHuerfanos;
      console.log(`👤 Productos sin catálogo: ${todosHuerfanos.length}`);
      console.log(`   - Sin campo catalogoProductoId: ${productosHuerfanos.length}`);
      console.log(`   - Con string vacío: ${productosStringVacio.length}\n`);
      
      if (todosHuerfanos.length > 0) {
        console.log('Primeros 3 productos huérfanos:');
        todosHuerfanos.slice(0, 3).forEach((prod, index) => {
          console.log(`   ${index + 1}. ID: ${prod._id}`);
          console.log(`      Código: ${prod.codigoProducto || 'Sin código'}`);
          console.log(`      Nombre: ${prod.nombreProducto || 'Sin nombre'}`);
          console.log(`      CatálogoID: ${prod.catalogoProductoId || 'VACÍO'}\n`);
        });
      }
    } catch (error) {
      console.log(`⚠️  Error al buscar productos huérfanos: ${error.message}`);
      this.problemas.productosHuerfanos = [];
    }
  }

  async validarInventarioInconsistente() {
    console.log('🔍 VALIDANDO INVENTARIO INCONSISTENTE...\n');
    
    // Verificar duplicados por numeroEntrada
    const duplicados = await InventarioProducto.aggregate([
      {
        $group: {
          _id: '$numeroEntrada',
          count: { $sum: 1 },
          docs: { $push: '$$ROOT' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);
    
    console.log(`🔄 Números de entrada duplicados: ${duplicados.length}`);
    
    if (duplicados.length > 0) {
      console.log('Primeros duplicados encontrados:');
      duplicados.slice(0, 3).forEach((dup, index) => {
        console.log(`   ${index + 1}. Número: ${dup._id} (${dup.count} duplicados)`);
      });
    }
    console.log();
  }

  mostrarResumenDiagnostico() {
    console.log('📋 RESUMEN DEL DIAGNÓSTICO');
    console.log('═'.repeat(50));
    console.log(`📊 Estadísticas generales:`);
    console.log(`   - Catálogo: ${this.estadisticas.catalogoTotal} productos`);
    console.log(`   - Productos: ${this.estadisticas.productosTotal} registros`);
    console.log(`   - Inventario: ${this.estadisticas.inventarioTotal} entradas`);
    console.log();
    
    console.log(`🚨 Problemas detectados:`);
    console.log(`   - Referencias de catálogo rotas: ${this.problemas.catalogoRotos.length}`);
    console.log(`   - Productos huérfanos: ${this.problemas.productosHuerfanos.length}`);
    console.log(`   - Inventarios inconsistentes: ${this.problemas.inventarioInconsistente.length}`);
    console.log();
    
    const totalProblemas = this.problemas.catalogoRotos.length + 
                          this.problemas.productosHuerfanos.length + 
                          this.problemas.inventarioInconsistente.length;
    
    if (totalProblemas > 0) {
      console.log('⚠️  ACCIÓN REQUERIDA:');
      console.log('   1. Ejecutar script de reparación urgente');
      console.log('   2. Implementar modelo unificado');
      console.log('   3. Migrar datos a nueva estructura');
      console.log();
      console.log('💡 Para reparar inmediatamente, ejecuta:');
      console.log('   node diagnostico-inventario.js --reparar');
    } else {
      console.log('✅ No se encontraron problemas críticos');
    }
    
    console.log('═'.repeat(50));
  }

  async reparacionUrgente() {
    console.log('🔧 INICIANDO REPARACIÓN URGENTE...\n');
    
    let reparaciones = 0;
    
    // 1. Reparar referencias rotas creando catálogos faltantes
    console.log('1️⃣ Reparando referencias de catálogo rotas...');
    
    for (const problema of this.problemas.catalogoRotos) {
      try {
        // Crear catálogo faltante basado en datos del producto
        const producto = await Producto.findById(problema.productoId);
        if (producto) {
          const nuevoCatalogo = new CatalogoProducto({
            codigoproducto: producto.codigoProducto || `AUTO-${Date.now()}`,
            nombre: producto.nombreProducto || 'Producto Sin Nombre',
            descripcion: 'Catálogo creado automáticamente durante reparación',
            categoria: 'General',
            precio: producto.precio || 0,
            activo: true
          });
          
          await nuevoCatalogo.save();
          
          // Actualizar referencia en producto
          producto.catalogoProductoId = nuevoCatalogo._id;
          await producto.save();
          
          reparaciones++;
          console.log(`   ✅ Reparado: ${producto.codigoProducto}`);
        }
      } catch (error) {
        console.log(`   ❌ Error reparando ${problema.productoId}: ${error.message}`);
      }
    }
    
    console.log(`✅ Reparaciones completadas: ${reparaciones}\n`);
    this.estadisticas.reparacionesRealizadas = reparaciones;
  }
}

// Función principal
async function ejecutarDiagnostico() {
  const diagnostico = new DiagnosticoInventario();
  
  const args = process.argv.slice(2);
  const reparar = args.includes('--reparar');
  
  try {
    await diagnostico.diagnosticoCompleto();
    
    if (reparar) {
      await diagnostico.reparacionUrgente();
      console.log('🎉 Reparación completada. Reinicia el servidor para aplicar cambios.');
    }
    
  } catch (error) {
    console.error('💥 Error fatal:', error);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('🔌 Desconectado de MongoDB');
    }
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  ejecutarDiagnostico();
}

module.exports = DiagnosticoInventario;