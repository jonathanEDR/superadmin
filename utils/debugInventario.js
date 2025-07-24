const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const CatalogoProducto = require('../models/CatalogoProducto');
const InventarioProducto = require('../models/InventarioProducto');

class DebugInventario {
  
  static async verificarProducto(productoId) {
    try {
      console.log('\n=== VERIFICACIÓN DE PRODUCTO ===');
      console.log('Producto ID:', productoId);
      
      // 1. Verificar que el producto existe
      const producto = await Producto.findById(productoId);
      if (!producto) {
        console.log('❌ Producto no encontrado');
        return false;
      }
      
      console.log('✅ Producto encontrado:');
      console.log('  - Nombre:', producto.nombre);
      console.log('  - Código:', producto.codigoProducto);
      console.log('  - Categoría:', producto.categoryName);
      console.log('  - Catálogo ID:', producto.catalogoProductoId);
      console.log('  - Cantidad actual:', producto.cantidad);
      console.log('  - Cantidad restante:', producto.cantidadRestante);
      
      // 2. Verificar que el producto del catálogo existe
      if (!producto.catalogoProductoId) {
        console.log('❌ Producto sin catalogoProductoId asociado');
        return false;
      }
      
      const catalogoProducto = await CatalogoProducto.findById(producto.catalogoProductoId);
      if (!catalogoProducto) {
        console.log('❌ Producto del catálogo no encontrado');
        return false;
      }
      
      console.log('✅ Producto del catálogo encontrado:');
      console.log('  - Nombre:', catalogoProducto.nombre);
      console.log('  - Código:', catalogoProducto.codigoproducto);
      console.log('  - Activo:', catalogoProducto.activo);
      
      // 3. Verificar entradas de inventario existentes
      const entradas = await InventarioProducto.find({ productoId });
      console.log(`📦 Entradas de inventario existentes: ${entradas.length}`);
      
      if (entradas.length > 0) {
        console.log('Últimas 5 entradas:');
        entradas.slice(-5).forEach((entrada, index) => {
          console.log(`  ${index + 1}. ${entrada.numeroEntrada} - Cantidad: ${entrada.cantidad} - Disponible: ${entrada.cantidadDisponible} - Estado: ${entrada.estado}`);
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error en verificación:', error);
      return false;
    }
  }
  
  static async listarProductosConProblemas() {
    try {
      console.log('\n=== PRODUCTOS CON POSIBLES PROBLEMAS ===');
      
      // Productos sin catalogoProductoId
      const sinCatalogo = await Producto.find({ catalogoProductoId: { $exists: false } });
      if (sinCatalogo.length > 0) {
        console.log(`❌ Productos sin catálogo (${sinCatalogo.length}):`);
        sinCatalogo.forEach(p => console.log(`  - ${p.nombre} (${p._id})`));
      }
      
      // Productos con catalogoProductoId inválido
      const productos = await Producto.find({ catalogoProductoId: { $exists: true } });
      for (const producto of productos) {
        const catalogo = await CatalogoProducto.findById(producto.catalogoProductoId);
        if (!catalogo) {
          console.log(`❌ Producto con catálogo inválido: ${producto.nombre} (${producto._id}) - Catálogo ID: ${producto.catalogoProductoId}`);
        } else if (!catalogo.activo) {
          console.log(`⚠️ Producto con catálogo inactivo: ${producto.nombre} (${producto._id}) - Catálogo: ${catalogo.nombre}`);
        }
      }
      
      // Productos del catálogo sin código
      const catalogoSinCodigo = await CatalogoProducto.find({ 
        $or: [
          { codigoproducto: { $exists: false } },
          { codigoproducto: '' },
          { codigoproducto: null }
        ]
      });
      
      if (catalogoSinCodigo.length > 0) {
        console.log(`❌ Productos del catálogo sin código (${catalogoSinCodigo.length}):`);
        catalogoSinCodigo.forEach(p => console.log(`  - ${p.nombre} (${p._id})`));
      }
      
    } catch (error) {
      console.error('Error al listar problemas:', error);
    }
  }
  
  static async simularCreacionEntrada(productoId, cantidad, precio) {
    try {
      console.log('\n=== SIMULACIÓN DE CREACIÓN DE ENTRADA ===');
      console.log('Datos de entrada:');
      console.log('  - Producto ID:', productoId);
      console.log('  - Cantidad:', cantidad);
      console.log('  - Precio:', precio);
      
      // Paso 1: Verificar producto
      console.log('\nPaso 1: Verificando producto...');
      const producto = await Producto.findById(productoId);
      if (!producto) {
        console.log('❌ FALLA: Producto no encontrado');
        return;
      }
      console.log('✅ Producto encontrado');
      
      // Paso 2: Verificar catálogo
      console.log('\nPaso 2: Verificando catálogo...');
      const catalogoProducto = await CatalogoProducto.findById(producto.catalogoProductoId);
      if (!catalogoProducto) {
        console.log('❌ FALLA: Producto del catálogo no encontrado');
        return;
      }
      console.log('✅ Producto del catálogo encontrado');
      
      // Paso 3: Verificar estado activo
      console.log('\nPaso 3: Verificando estado activo...');
      if (!catalogoProducto.activo) {
        console.log('❌ FALLA: Producto inactivo en catálogo');
        return;
      }
      console.log('✅ Producto activo');
      
      // Paso 4: Validar datos
      console.log('\nPaso 4: Validando datos de entrada...');
      if (!cantidad || cantidad <= 0) {
        console.log('❌ FALLA: Cantidad inválida');
        return;
      }
      if (!precio || precio <= 0) {
        console.log('❌ FALLA: Precio inválido');
        return;
      }
      console.log('✅ Datos válidos');
      
      // Paso 5: Simular creación
      console.log('\nPaso 5: Simulando creación de entrada...');
      const simulatedEntry = {
        productoId,
        catalogoProductoId: producto.catalogoProductoId,
        cantidad: Number(cantidad),
        precio: Number(precio),
        costoTotal: Number(cantidad) * Number(precio)
      };
      console.log('Entrada simulada:', simulatedEntry);
      console.log('✅ Simulación exitosa - La entrada debería crearse correctamente');
      
    } catch (error) {
      console.error('❌ Error en simulación:', error);
    }
  }
}

module.exports = DebugInventario;
