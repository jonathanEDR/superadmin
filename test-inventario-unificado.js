const mongoose = require('mongoose');
const InventarioUnificado = require('./models/InventarioUnificado');
const inventarioMasterService = require('./services/InventarioMasterService');
const CatalogoProducto = require('./models/CatalogoProducto');

/**
 * SCRIPT DE TESTING FUNCIONALIDADES CRÍTICAS - FASE 1
 * 
 * Prueba todas las funcionalidades implementadas:
 * - Crear entradas de inventario
 * - Listar entradas con filtros
 * - Consumir stock
 * - Incrementar stock
 * - Obtener estadísticas
 */

class TesterInventarioUnificado {
  constructor() {
    this.resultados = {
      total: 0,
      exitosos: 0,
      fallidos: 0,
      errores: []
    };
  }

  async ejecutarTests() {
    try {
      require('dotenv').config();
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/superadmin');
      console.log('✅ Conectado a MongoDB para testing\n');

      console.log('🧪 INICIANDO TESTING DE FUNCIONALIDADES CRÍTICAS');
      console.log('═'.repeat(60));
      
      // Tests principales
      await this._testCrearEntrada();
      await this._testListarEntradas();
      await this._testConsumirStock();
      await this._testIncrementarStock();
      await this._testObtenerEstadisticas();
      await this._testResumenPorProducto();
      
      // Mostrar resumen
      this._mostrarResumen();
      
    } catch (error) {
      console.error('💥 Error durante testing:', error);
    } finally {
      await mongoose.disconnect();
      console.log('🔌 Desconectado de MongoDB');
    }
  }

  async _testCrearEntrada() {
    console.log('1️⃣ TESTING: Crear nueva entrada de inventario\n');
    
    try {
      // Obtener un producto del catálogo para usar en el test
      const catalogoProducto = await CatalogoProducto.findOne({ activo: true });
      
      if (!catalogoProducto) {
        throw new Error('No hay productos en el catálogo para testing');
      }

      const datosEntrada = {
        catalogoProductoId: catalogoProducto._id,
        cantidad: 100,
        precio: 15.50,
        precioVenta: 20.00,
        lote: 'TEST-LOTE-001',
        fechaEntrada: new Date(),
        fechaVencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días
        proveedor: 'Proveedor Testing',
        observaciones: 'Entrada creada durante testing automatizado',
        usuario: 'tester',
        usuarioEmail: 'test@example.com',
        usuarioRole: 'admin'
      };

      console.log('📦 Datos de entrada de prueba:');
      console.log(`   - Producto: ${catalogoProducto.nombre}`);
      console.log(`   - Cantidad: ${datosEntrada.cantidad}`);
      console.log(`   - Precio: S/ ${datosEntrada.precio}`);
      console.log(`   - Lote: ${datosEntrada.lote}\n`);

      const entradaCreada = await inventarioMasterService.crearEntrada(datosEntrada);

      console.log('✅ Entrada creada exitosamente:');
      console.log(`   - ID: ${entradaCreada._id}`);
      console.log(`   - Número de entrada: ${entradaCreada.numeroEntrada}`);
      console.log(`   - Estado: ${entradaCreada.estado}`);
      console.log(`   - Stock disponible: ${entradaCreada.cantidadDisponible}\n`);

      this._registrarExito('Crear entrada');
      
      // Guardar ID para tests posteriores
      this.entradaTestId = entradaCreada._id;
      
    } catch (error) {
      this._registrarError('Crear entrada', error);
    }
  }

  async _testListarEntradas() {
    console.log('2️⃣ TESTING: Listar entradas con filtros\n');
    
    try {
      // Test 1: Listar todas las entradas
      console.log('🔍 Test 1: Listar todas las entradas...');
      const todasEntradas = await inventarioMasterService.listarEntradas();
      
      console.log(`   ✅ Total de entradas: ${todasEntradas.entradas.length}`);
      console.log(`   📊 Stock total disponible: ${todasEntradas.resumen.stockTotalDisponible}`);
      console.log(`   💰 Valor total inventario: S/ ${todasEntradas.resumen.valorTotalInventario.toFixed(2)}\n`);

      // Test 2: Filtrar por estado activo
      console.log('🔍 Test 2: Filtrar por estado activo...');
      const entradasActivas = await inventarioMasterService.listarEntradas({ 
        estado: 'activo' 
      }, { 
        limite: 10 
      });
      
      console.log(`   ✅ Entradas activas: ${entradasActivas.entradas.length}`);
      console.log(`   📄 Páginas totales: ${entradasActivas.paginacion.totalPaginas}\n`);

      // Test 3: Búsqueda por texto
      console.log('🔍 Test 3: Búsqueda por texto "Pizza"...');
      const busquedaPizza = await inventarioMasterService.listarEntradas({ 
        busqueda: 'Pizza' 
      });
      
      console.log(`   ✅ Resultados encontrados: ${busquedaPizza.entradas.length}`);
      if (busquedaPizza.entradas.length > 0) {
        console.log(`   📦 Primer resultado: ${busquedaPizza.entradas[0].nombreProducto}`);
      }
      console.log();

      this._registrarExito('Listar entradas con filtros');
      
    } catch (error) {
      this._registrarError('Listar entradas con filtros', error);
    }
  }

  async _testConsumirStock() {
    console.log('3️⃣ TESTING: Consumir stock de entrada\n');
    
    try {
      if (!this.entradaTestId) {
        throw new Error('No hay entrada de test disponible');
      }

      // Obtener estado inicial
      const entradaInicial = await inventarioMasterService.obtenerEntrada(this.entradaTestId);
      const stockInicial = entradaInicial.cantidadDisponible;
      
      console.log(`📦 Stock inicial: ${stockInicial}`);
      
      // Consumir 10 unidades
      const cantidadConsumir = 10;
      console.log(`🔻 Consumiendo ${cantidadConsumir} unidades...`);
      
      const entradaActualizada = await inventarioMasterService.consumirStock(
        this.entradaTestId,
        cantidadConsumir,
        {
          motivo: 'venta',
          observaciones: 'Consumo durante testing',
          usuario: 'tester'
        }
      );

      console.log(`✅ Stock después del consumo: ${entradaActualizada.cantidadDisponible}`);
      console.log(`📊 Stock vendido: ${entradaActualizada.cantidadVendida}`);
      
      // Validar que el cálculo es correcto
      const stockEsperado = stockInicial - cantidadConsumir;
      if (entradaActualizada.cantidadDisponible === stockEsperado) {
        console.log('✅ Cálculo de stock correcto\n');
        this._registrarExito('Consumir stock');
      } else {
        throw new Error(`Stock incorrecto. Esperado: ${stockEsperado}, Actual: ${entradaActualizada.cantidadDisponible}`);
      }
      
    } catch (error) {
      this._registrarError('Consumir stock', error);
    }
  }

  async _testIncrementarStock() {
    console.log('4️⃣ TESTING: Incrementar stock (devolución)\n');
    
    try {
      if (!this.entradaTestId) {
        throw new Error('No hay entrada de test disponible');
      }

      // Obtener estado actual
      const entradaInicial = await inventarioMasterService.obtenerEntrada(this.entradaTestId);
      const stockInicial = entradaInicial.cantidadDisponible;
      
      console.log(`📦 Stock antes de incremento: ${stockInicial}`);
      
      // Incrementar 5 unidades
      const cantidadIncrementar = 5;
      console.log(`🔺 Incrementando ${cantidadIncrementar} unidades...`);
      
      const entradaActualizada = await inventarioMasterService.incrementarStock(
        this.entradaTestId,
        cantidadIncrementar,
        {
          motivo: 'devolucion',
          observaciones: 'Devolución durante testing',
          usuario: 'tester'
        }
      );

      console.log(`✅ Stock después del incremento: ${entradaActualizada.cantidadDisponible}`);
      console.log(`📊 Stock devuelto: ${entradaActualizada.cantidadDevuelta}`);
      
      // Validar que el cálculo es correcto
      const stockEsperado = stockInicial + cantidadIncrementar;
      if (entradaActualizada.cantidadDisponible === stockEsperado) {
        console.log('✅ Cálculo de incremento correcto\n');
        this._registrarExito('Incrementar stock');
      } else {
        throw new Error(`Stock incorrecto. Esperado: ${stockEsperado}, Actual: ${entradaActualizada.cantidadDisponible}`);
      }
      
    } catch (error) {
      this._registrarError('Incrementar stock', error);
    }
  }

  async _testObtenerEstadisticas() {
    console.log('5️⃣ TESTING: Obtener estadísticas generales\n');
    
    try {
      const estadisticas = await inventarioMasterService.obtenerEstadisticasGenerales();

      console.log('📈 Estadísticas generales obtenidas:');
      console.log(`   📊 Total entradas: ${estadisticas.resumen.totalEntradas}`);
      console.log(`   ✅ Entradas activas: ${estadisticas.resumen.entradasActivas}`);
      console.log(`   💰 Valor total inventario: S/ ${estadisticas.resumen.valorTotalInventario.toFixed(2)}`);
      console.log(`   🏷️  Productos con stock: ${estadisticas.resumen.productosConStock}`);
      
      console.log('\n🚨 Alertas:');
      console.log(`   ⏰ Próximos a vencer: ${estadisticas.alertas.proximosVencer}`);
      console.log(`   📉 Stock bajo: ${estadisticas.alertas.stockBajo}`);
      console.log(`   🔔 Total alertas: ${estadisticas.alertas.totalAlertas}`);

      if (estadisticas.detalleAlertas.proximosVencer.length > 0) {
        console.log('\n⏰ Detalle productos próximos a vencer:');
        estadisticas.detalleAlertas.proximosVencer.slice(0, 3).forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.nombreProducto} - Vence en ${item.diasRestantes} días`);
        });
      }

      console.log();
      this._registrarExito('Obtener estadísticas generales');
      
    } catch (error) {
      this._registrarError('Obtener estadísticas generales', error);
    }
  }

  async _testResumenPorProducto() {
    console.log('6️⃣ TESTING: Resumen por producto\n');
    
    try {
      // Obtener un producto para el test
      const catalogoProducto = await CatalogoProducto.findOne({ activo: true });
      
      if (!catalogoProducto) {
        throw new Error('No hay productos disponibles para testing');
      }

      console.log(`🔍 Obteniendo resumen para: ${catalogoProducto.nombre}`);
      
      const resumen = await inventarioMasterService.obtenerResumenPorProducto(catalogoProducto._id);

      console.log('📊 Resumen del producto:');
      console.log(`   📦 Stock total: ${resumen.stockTotal || 0}`);
      console.log(`   🔒 Stock reservado: ${resumen.stockReservado || 0}`);
      console.log(`   💰 Valor total: S/ ${(resumen.valorTotal || 0).toFixed(2)}`);
      console.log(`   📋 Número de lotes: ${resumen.lotes || 0}`);
      
      if (resumen.proximoVencimiento) {
        console.log(`   ⏰ Próximo vencimiento: ${new Date(resumen.proximoVencimiento).toLocaleDateString()}`);
      }
      
      console.log(`   🚨 Alertas activas: ${resumen.alertas?.length || 0}`);

      console.log();
      this._registrarExito('Resumen por producto');
      
    } catch (error) {
      this._registrarError('Resumen por producto', error);
    }
  }

  _registrarExito(test) {
    this.resultados.total++;
    this.resultados.exitosos++;
    console.log(`✅ TEST EXITOSO: ${test}\n`);
  }

  _registrarError(test, error) {
    this.resultados.total++;
    this.resultados.fallidos++;
    this.resultados.errores.push({ test, error: error.message });
    console.log(`❌ TEST FALLIDO: ${test}`);
    console.log(`   Error: ${error.message}\n`);
  }

  _mostrarResumen() {
    console.log('📋 RESUMEN DE TESTING');
    console.log('═'.repeat(60));
    console.log(`🧪 Tests ejecutados: ${this.resultados.total}`);
    console.log(`✅ Tests exitosos: ${this.resultados.exitosos}`);
    console.log(`❌ Tests fallidos: ${this.resultados.fallidos}`);
    
    const porcentajeExito = this.resultados.total > 0 
      ? ((this.resultados.exitosos / this.resultados.total) * 100).toFixed(1)
      : 0;
    
    console.log(`📊 Porcentaje de éxito: ${porcentajeExito}%`);

    if (this.resultados.errores.length > 0) {
      console.log('\n❌ ERRORES ENCONTRADOS:');
      this.resultados.errores.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.test}: ${error.error}`);
      });
    }

    console.log('═'.repeat(60));
    
    if (this.resultados.fallidos === 0) {
      console.log('🎉 ¡TODOS LOS TESTS PASARON! El sistema está listo para producción.');
    } else {
      console.log('⚠️  Algunos tests fallaron. Revisar errores antes de usar en producción.');
    }
  }
}

// Función principal
async function ejecutarTests() {
  const tester = new TesterInventarioUnificado();
  await tester.ejecutarTests();
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  ejecutarTests().catch(error => {
    console.error('Error fatal en testing:', error);
    process.exit(1);
  });
}

module.exports = TesterInventarioUnificado;