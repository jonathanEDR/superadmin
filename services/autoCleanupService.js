/**
 * Servicio de Auto-Limpieza para Productos Duplicados
 * Se ejecuta automáticamente cuando se detecta el error E11000
 */

const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const CatalogoProducto = require('../models/CatalogoProducto');

class AutoCleanupService {
  constructor() {
    this.isRunning = false;
    this.lastCleanup = null;
    this.cleanupCount = 0;
  }

  /**
   * Detecta si un error es de clave duplicada
   */
  isDuplicateKeyError(error) {
    return error.code === 11000 || 
           (error.message && error.message.includes('E11000')) ||
           (error.message && error.message.includes('duplicate key'));
  }

  /**
   * Extrae información del error de clave duplicada
   */
  extractDuplicateInfo(error) {
    try {
      let field = 'codigoProducto';
      let value = 'unknown';
      let isCompositeIndex = false;
      let catalogoProductoId = null;
      let categoryId = null;

      if (error.keyValue) {
        const keys = Object.keys(error.keyValue);
        field = keys[0];
        value = error.keyValue[field];
        
        // Verificar si es el índice compuesto
        if (error.keyValue.catalogoProductoId && error.keyValue.categoryId) {
          isCompositeIndex = true;
          catalogoProductoId = error.keyValue.catalogoProductoId;
          categoryId = error.keyValue.categoryId;
          field = 'catalogoProducto_categoria';
          value = `${catalogoProductoId}_${categoryId}`;
        }
      } else if (error.message) {
        // Verificar si es error del índice compuesto
        if (error.message.includes('catalogoProducto_categoria_unique')) {
          isCompositeIndex = true;
          field = 'catalogoProducto_categoria';
          
          // Intentar extraer los valores del mensaje
          const match = error.message.match(/dup key: \{ catalogoProductoId: "([^"]+)", categoryId: "([^"]+)" \}/);
          if (match) {
            catalogoProductoId = match[1];
            categoryId = match[2];
            value = `${catalogoProductoId}_${categoryId}`;
          }
        } else {
          // Extraer del mensaje: dup key: { codigoProducto: "1001" }
          const match = error.message.match(/dup key: \{ (\w+): "([^"]+)" \}/);
          if (match) {
            field = match[1];
            value = match[2];
          }
        }
      }

      return { 
        field, 
        value, 
        isCompositeIndex, 
        catalogoProductoId, 
        categoryId 
      };
    } catch (e) {
      console.warn('[AutoCleanup] No se pudo extraer info del error:', e.message);
      return { 
        field: 'codigoProducto', 
        value: 'unknown', 
        isCompositeIndex: false, 
        catalogoProductoId: null, 
        categoryId: null 
      };
    }
  }

  /**
   * Limpia duplicados por combinación catálogo+categoría (NUEVA LÓGICA)
   */
  async cleanDuplicatesByCombination(catalogoProductoId, categoryId) {
    try {
      console.log(`[AutoCleanup] 🧹 Limpiando duplicados para catálogo: ${catalogoProductoId}, categoría: ${categoryId}`);

      // Buscar todos los productos con esa combinación
      const productos = await Producto.find({ catalogoProductoId, categoryId })
        .sort({ createdAt: -1 }) // Más recientes primero
        .lean();

      if (productos.length <= 1) {
        console.log(`[AutoCleanup] ✅ No hay duplicados para esta combinación`);
        return { eliminated: 0, kept: productos.length };
      }

      // Mantener el más reciente, eliminar el resto
      const [keep, ...toDelete] = productos;
      
      console.log(`[AutoCleanup] ✅ Manteniendo: ${keep.nombre} (${keep._id}) - ${new Date(keep.createdAt).toLocaleString()}`);
      
      let eliminated = 0;
      for (const producto of toDelete) {
        console.log(`[AutoCleanup] ❌ Eliminando: ${producto.nombre} (${producto._id}) - ${new Date(producto.createdAt).toLocaleString()}`);
        await Producto.findByIdAndDelete(producto._id);
        eliminated++;
      }

      console.log(`[AutoCleanup] ✅ Limpieza completada: ${eliminated} duplicados eliminados`);
      return { eliminated, kept: 1 };

    } catch (error) {
      console.error(`[AutoCleanup] ❌ Error limpiando combinación ${catalogoProductoId}/${categoryId}:`, error.message);
      throw error;
    }
  }

  /**
   * Limpia duplicados específicos por código de producto
   */
  async cleanDuplicatesByCode(codigoProducto) {
    try {
      console.log(`[AutoCleanup] 🧹 Limpiando duplicados para código: ${codigoProducto}`);

      // Buscar todos los productos con ese código
      const productos = await Producto.find({ codigoProducto })
        .sort({ createdAt: -1 }) // Más recientes primero
        .lean();

      if (productos.length <= 1) {
        console.log(`[AutoCleanup] ✅ No hay duplicados para ${codigoProducto}`);
        return { eliminated: 0, kept: productos.length };
      }

      // Mantener el más reciente, eliminar el resto
      const [keep, ...toDelete] = productos;
      
      console.log(`[AutoCleanup] ✅ Manteniendo: ${keep.nombre} (${keep._id}) - ${new Date(keep.createdAt).toLocaleString()}`);
      
      let eliminated = 0;
      for (const producto of toDelete) {
        console.log(`[AutoCleanup] ❌ Eliminando: ${producto.nombre} (${producto._id}) - ${new Date(producto.createdAt).toLocaleString()}`);
        await Producto.findByIdAndDelete(producto._id);
        eliminated++;
      }

      console.log(`[AutoCleanup] ✅ Limpieza completada: ${eliminated} duplicados eliminados`);
      return { eliminated, kept: 1 };

    } catch (error) {
      console.error(`[AutoCleanup] ❌ Error limpiando código ${codigoProducto}:`, error.message);
      throw error;
    }
  }

  /**
   * Limpieza completa de todos los duplicados REALES (por combinación catálogo+categoría)
   */
  async fullCleanup() {
    try {
      console.log('[AutoCleanup] 🚀 Iniciando limpieza completa...');
      
      // Buscar duplicados reales por combinación catálogo+categoría
      const duplicates = await Producto.aggregate([
        {
          $group: {
            _id: { 
              catalogoProductoId: '$catalogoProductoId', 
              categoryId: '$categoryId' 
            },
            count: { $sum: 1 },
            docs: { 
              $push: { 
                id: '$_id', 
                nombre: '$nombre', 
                createdAt: '$createdAt' 
              } 
            }
          }
        },
        {
          $match: { count: { $gt: 1 } }
        }
      ]);

      if (duplicates.length === 0) {
        console.log('[AutoCleanup] ✅ No hay duplicados para limpiar');
        return { totalEliminated: 0, codesProcessed: 0 };
      }

      console.log(`[AutoCleanup] 📋 Encontradas ${duplicates.length} combinaciones con duplicados`);
      
      let totalEliminated = 0;
      
      for (const duplicate of duplicates) {
        const result = await this.cleanDuplicatesByCombination(
          duplicate._id.catalogoProductoId, 
          duplicate._id.categoryId
        );
        totalEliminated += result.eliminated;
      }

      console.log(`[AutoCleanup] 🎉 Limpieza completa terminada: ${totalEliminated} productos eliminados`);
      return { totalEliminated, codesProcessed: duplicates.length };

    } catch (error) {
      console.error('[AutoCleanup] ❌ Error en limpieza completa:', error.message);
      throw error;
    }
  }

  /**
   * Ejecuta limpieza automática cuando se detecta error de duplicado
   */
  async handleDuplicateError(error, retryFunction = null, ...retryArgs) {
    // Prevenir ejecución concurrente
    if (this.isRunning) {
      console.log('[AutoCleanup] ⏳ Limpieza ya en progreso, esperando...');
      
      // Esperar hasta que termine la limpieza actual
      while (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Intentar la operación nuevamente después de la limpieza
      if (retryFunction) {
        console.log('[AutoCleanup] 🔄 Reintentando operación después de limpieza...');
        return await retryFunction(...retryArgs);
      }
      return null;
    }

    try {
      this.isRunning = true;
      this.cleanupCount++;
      
      console.log(`[AutoCleanup] 🚨 Error de clave duplicada detectado (limpieza #${this.cleanupCount})`);
      console.log(`[AutoCleanup] 📋 Error: ${error.message}`);
      
      const { field, value, isCompositeIndex, catalogoProductoId, categoryId } = this.extractDuplicateInfo(error);
      console.log(`[AutoCleanup] 🎯 Campo duplicado: ${field} = "${value}"`);

      let result;
      
      if (isCompositeIndex && catalogoProductoId && categoryId) {
        // Limpieza específica por combinación catálogo+categoría
        console.log(`[AutoCleanup] 🎯 Limpiando combinación específica: catálogo=${catalogoProductoId}, categoría=${categoryId}`);
        result = await this.cleanDuplicatesByCombination(catalogoProductoId, categoryId);
      } else if (field === 'codigoProducto' && value !== 'unknown') {
        // Limpieza específica por código (compatibilidad)
        result = await this.cleanDuplicatesByCode(value);
      } else {
        // Limpieza completa si no podemos determinar la combinación específica
        console.log('[AutoCleanup] ⚠️  No se pudo determinar combinación específica, ejecutando limpieza completa...');
        result = await this.fullCleanup();
      }

      this.lastCleanup = new Date();
      
      console.log(`[AutoCleanup] ✅ Auto-limpieza completada exitosamente`);
      console.log(`[AutoCleanup] 📊 Productos eliminados: ${result.eliminated || result.totalEliminated}`);
      
      // Intentar la operación original nuevamente
      if (retryFunction) {
        console.log('[AutoCleanup] 🔄 Reintentando operación original...');
        try {
          const retryResult = await retryFunction(...retryArgs);
          console.log('[AutoCleanup] ✅ Operación original exitosa después de limpieza');
          return retryResult;
        } catch (retryError) {
          console.error('[AutoCleanup] ❌ Operación falló incluso después de limpieza:', retryError.message);
          throw retryError;
        }
      }

      return result;

    } catch (cleanupError) {
      console.error('[AutoCleanup] ❌ Error durante auto-limpieza:', cleanupError.message);
      throw new Error(`Auto-limpieza falló: ${cleanupError.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Obtiene estadísticas de limpieza
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      lastCleanup: this.lastCleanup,
      cleanupCount: this.cleanupCount,
      lastCleanupFormatted: this.lastCleanup ? this.lastCleanup.toLocaleString() : 'Nunca'
    };
  }

  /**
   * Verifica si es necesaria una limpieza preventiva
   */
  async checkAndCleanIfNeeded() {
    try {
      const duplicates = await Producto.aggregate([
        { $group: { _id: '$codigoProducto', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
      ]);

      if (duplicates.length > 0) {
        console.log(`[AutoCleanup] 🔍 Detectados ${duplicates.length} códigos duplicados, ejecutando limpieza preventiva...`);
        return await this.fullCleanup();
      }

      return { totalEliminated: 0, codesProcessed: 0 };
    } catch (error) {
      console.error('[AutoCleanup] ❌ Error en verificación preventiva:', error.message);
      throw error;
    }
  }
}

// Crear instancia singleton
const autoCleanupService = new AutoCleanupService();

module.exports = autoCleanupService;
