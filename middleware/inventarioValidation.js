const Producto = require('../models/Producto');
const CatalogoProducto = require('../models/CatalogoProducto');

/**
 * Middleware para validar integridad de datos antes de operaciones de inventario
 */
const validarIntegridadInventario = async (req, res, next) => {
  try {
    const { productoId } = req.body;
    
    if (!productoId) {
      return res.status(400).json({ 
        message: 'El ID del producto es requerido',
        code: 'MISSING_PRODUCT_ID'
      });
    }

    console.log('[VALIDATION] Validando integridad para producto:', productoId);

    // 1. Verificar que el producto existe
    const producto = await Producto.findById(productoId);
    if (!producto) {
      return res.status(404).json({ 
        message: 'Producto no encontrado',
        code: 'PRODUCT_NOT_FOUND',
        productoId
      });
    }

    // 2. Verificar que el producto tiene catalogoProductoId válido
    if (!producto.catalogoProductoId) {
      console.log('[VALIDATION] Producto sin catalogoProductoId, intentando reparar...');
      
      // Intentar reparar automáticamente
      try {
        const nuevoCatalogo = new CatalogoProducto({
          codigoproducto: producto.codigoProducto || `AUTO-${Date.now()}`,
          nombre: producto.nombre,
          activo: true
        });
        const catalogoCreado = await nuevoCatalogo.save();
        
        // Actualizar producto con el nuevo catalogoProductoId
        producto.catalogoProductoId = catalogoCreado._id;
        await producto.save();
        
        console.log('[VALIDATION] ✅ Reparación automática exitosa');
      } catch (repairError) {
        return res.status(500).json({ 
          message: 'Producto con datos inconsistentes que no se pueden reparar',
          code: 'PRODUCT_DATA_CORRUPTION',
          productoId
        });
      }
    }

    // 3. Verificar que el catálogo referenciado existe
    const catalogoProducto = await CatalogoProducto.findById(producto.catalogoProductoId);
    if (!catalogoProducto) {
      console.log('[VALIDATION] Catálogo no encontrado, intentando reparar...');
      
      // Intentar reparar creando el catálogo faltante
      try {
        const nuevoCatalogo = new CatalogoProducto({
          _id: producto.catalogoProductoId,
          codigoproducto: producto.codigoProducto || `AUTO-${Date.now()}`,
          nombre: producto.nombre,
          activo: true
        });
        await nuevoCatalogo.save();
        
        console.log('[VALIDATION] ✅ Catálogo faltante creado automáticamente');
      } catch (repairError) {
        return res.status(500).json({ 
          message: 'Referencia de catálogo corrupta que no se puede reparar',
          code: 'CATALOG_REFERENCE_CORRUPTION',
          productoId,
          catalogoProductoId: producto.catalogoProductoId
        });
      }
    }

    // 4. Verificar que el catálogo está activo
    const catalogoFinal = catalogoProducto || await CatalogoProducto.findById(producto.catalogoProductoId);
    if (!catalogoFinal.activo) {
      return res.status(400).json({ 
        message: `El producto '${catalogoFinal.nombre}' está inactivo en el catálogo`,
        code: 'CATALOG_PRODUCT_INACTIVE',
        productoId,
        catalogoProductoId: catalogoFinal._id
      });
    }

    console.log('[VALIDATION] ✅ Validación de integridad completada');
    
    // Agregar información validada al request para usar en el controlador
    req.validatedData = {
      producto,
      catalogoProducto: catalogoFinal
    };
    
    next();
  } catch (error) {
    console.error('[VALIDATION] Error durante validación de integridad:', error);
    res.status(500).json({ 
      message: 'Error interno durante validación de datos',
      code: 'VALIDATION_ERROR',
      error: error.message
    });
  }
};

/**
 * Middleware para prevenir operaciones concurrentes en el mismo producto
 */
const prevencicOperacionesConcurrentes = (() => {
  const operacionesEnProceso = new Set();
  
  return (req, res, next) => {
    const { productoId } = req.body;
    const operationKey = `${req.method}-${req.originalUrl}-${productoId}`;
    
    if (operacionesEnProceso.has(operationKey)) {
      return res.status(429).json({ 
        message: 'Operación en progreso para este producto. Intente nuevamente en unos momentos.',
        code: 'CONCURRENT_OPERATION'
      });
    }
    
    operacionesEnProceso.add(operationKey);
    
    // Limpiar la operación cuando termine
    const cleanup = () => {
      operacionesEnProceso.delete(operationKey);
    };
    
    res.on('finish', cleanup);
    res.on('error', cleanup);
    
    // Timeout de seguridad
    setTimeout(cleanup, 30000); // 30 segundos
    
    next();
  };
})();

module.exports = {
  validarIntegridadInventario,
  prevencicOperacionesConcurrentes
};
