const Producto = require('../models/Producto');
const Category = require('../models/Category');
const autoCleanupService = require('./autoCleanupService');

// Función auxiliar para normalizar el nombre
const normalizarNombre = (nombre) => nombre.trim().toLowerCase();

const productService = {
  // Obtener todos los productos
  async getProductos(categoryId = null) {
    try {
      const query = categoryId ? { categoryId } : {};
      const productos = await Producto.find(query)
        .sort({ nombre: 1 })
        .populate('categoryId', 'nombre descripcion');
      console.log('[productService] getProductos query:', query);
      console.log('[productService] getProductos productos:', productos);
      return productos;
    } catch (error) {
      console.error('[productService] getProductos error:', error);
      throw { status: 500, message: 'Error al obtener los productos', error: error.message };
    }
  },

  // Crear un nuevo producto
  async createProducto(productData) {
    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        attempt++;
        console.log(`[productService] createProducto - Intento ${attempt}/${maxRetries + 1}`);

        // Verificación preventiva de duplicados antes de crear
        if (attempt === 1) {
          await autoCleanupService.checkAndCleanIfNeeded();
        }

        return await this._createProductoInternal(productData);

      } catch (error) {
        console.error(`[productService] Error en intento ${attempt}:`, error.message);

        // Si es error de clave duplicada y no es el último intento
        if (autoCleanupService.isDuplicateKeyError(error) && attempt <= maxRetries) {
          console.log(`[productService] 🚨 Error de duplicado detectado, ejecutando auto-limpieza...`);
          
          try {
            // Ejecutar auto-limpieza
            await autoCleanupService.handleDuplicateError(error);
            console.log(`[productService] ✅ Auto-limpieza completada, reintentando...`);
            continue; // Continuar con el siguiente intento
          } catch (cleanupError) {
            console.error('[productService] ❌ Auto-limpieza falló:', cleanupError.message);
            throw new Error(`Error de duplicado y auto-limpieza falló: ${cleanupError.message}`);
          }
        }

        // Si no es error de duplicado o es el último intento, lanzar error
        throw error;
      }
    }
  },

  // Función interna para crear producto (sin retry logic)
  async _createProductoInternal(productData) {
    try {
      console.log('[productService] _createProductoInternal - Iniciando creación:', productData);

      // Buscar el producto del catálogo
      const CatalogoProducto = require('../models/CatalogoProducto');
      const catalogoProducto = await CatalogoProducto.findById(productData.catalogoProductoId);
      if (!catalogoProducto) {
        throw { status: 404, message: 'Producto de catálogo no encontrado' };
      }

      // Verificar que la categoría existe
      const categoria = await Category.findById(productData.categoryId);
      if (!categoria) {
        throw { status: 404, message: 'La categoría especificada no existe' };
      }

      // Usar el nombre y código del producto del catálogo
      const nombreNormalizado = normalizarNombre(catalogoProducto.nombre);
      const codigoProducto = catalogoProducto.codigoproducto || catalogoProducto.codigoProducto || catalogoProducto.codigo;
      
      console.log('[productService] Información del catálogo:', {
        id: catalogoProducto._id,
        nombre: catalogoProducto.nombre,
        codigoproducto: catalogoProducto.codigoproducto,
        codigoFinal: codigoProducto
      });
      
      if (!codigoProducto) {
        console.error('[productService] Producto de catálogo sin código:', catalogoProducto);
        throw { status: 400, message: `El producto '${catalogoProducto.nombre}' no tiene código asignado en el catálogo` };
      }
      
      // VALIDACIÓN MEJORADA: Verificar duplicados SOLO por catálogo+categoría
      console.log('[productService] Verificando duplicados...');
      
      // Verificar por combinación catálogo + categoría (esta es la única validación necesaria)
      const productoPorCombinacion = await Producto.findOne({ 
        catalogoProductoId: productData.catalogoProductoId,
        categoryId: productData.categoryId 
      });
      
      if (productoPorCombinacion) {
        console.log('[productService] Producto existente con misma combinación:', productoPorCombinacion);
        throw { 
          status: 409, 
          message: `Ya existe este producto en esta categoría. Producto existente: '${productoPorCombinacion.nombre}' con código '${productoPorCombinacion.codigoProducto}'` 
        };
      }

      console.log('[productService] Validaciones pasadas, creando producto...');

      const producto = new Producto({
        ...productData,
        nombre: nombreNormalizado,
        codigoProducto,
        cantidadVendida: 0,
        cantidadDevuelta: 0,
        categoryName: categoria.nombre
      });

      console.log('[productService] Guardando producto en base de datos...');
      const productoGuardado = await producto.save();
      console.log('[productService] Producto guardado exitosamente:', productoGuardado._id);
      
      return productoGuardado;
    } catch (error) {
      console.error('[productService] Error detallado en _createProductoInternal:', error);
      
      // Manejar errores específicos de MongoDB
      if (error.code === 11000) {
        // Error de clave duplicada - verificar si es por el índice compuesto
        const keyPattern = error.keyPattern || {};
        
        if (keyPattern.catalogoProductoId && keyPattern.categoryId) {
          // Error por el índice compuesto catalogoProducto_categoria_unique
          throw { 
            status: 409, 
            message: 'Ya existe este producto en esta categoría',
            code: 11000
          };
        } else {
          // Otros errores de clave duplicada
          const field = Object.keys(error.keyValue || {})[0];
          const value = error.keyValue ? error.keyValue[field] : 'desconocido';
          
          console.error('[productService] Error de clave duplicada:', { field, value });
          
          // Crear error con información completa para auto-cleanup
          const duplicateError = new Error(`E11000 duplicate key error collection: productos index: ${field}_1 dup key: { ${field}: "${value}" }`);
          duplicateError.code = 11000;
          duplicateError.keyValue = error.keyValue || { [field]: value };
          throw duplicateError;
        }
      }
      
      throw error.status ? error : { 
        status: 500, 
        message: 'Error al crear el producto', 
        details: error.message 
      };
    }
  },

  // Actualizar un producto
  async updateProduct(id, updateData) {
    try {
      console.log('[productService] updateProduct called with:', { id, updateData });
      
      // Verificar que el producto existe
      const existingProduct = await Producto.findById(id);
      if (!existingProduct) {
        throw { status: 404, message: 'Producto no encontrado' };
      }

      console.log('[productService] Producto existente encontrado:', existingProduct.nombre);

      // Para actualizaciones, solo permitir campos específicos
      const allowedFields = ['precio', 'activo', 'status'];
      const filteredUpdateData = {};
      
      Object.keys(updateData).forEach(key => {
        if (allowedFields.includes(key)) {
          filteredUpdateData[key] = updateData[key];
        }
      });

      console.log('[productService] Datos filtrados para actualización:', filteredUpdateData);

      // Solo validar nombre si se está actualizando
      if (updateData.nombre) {
        const nombreNormalizado = normalizarNombre(updateData.nombre);
        const productoExistente = await Producto.findOne({
          nombre: nombreNormalizado,
          _id: { $ne: id }
        });
        if (productoExistente) {
          throw { status: 409, message: 'Ya existe otro producto con este nombre' };
        }
        filteredUpdateData.nombre = nombreNormalizado;
      }

      // Validar nueva categoría si se actualiza
      if (updateData.categoryId) {
        const categoria = await Category.findById(updateData.categoryId);
        if (!categoria) {
          throw { status: 404, message: 'La categoría especificada no existe' };
        }
        filteredUpdateData.categoryName = categoria.nombre;
      }

      // Agregar timestamp de actualización
      filteredUpdateData.updatedAt = new Date();

      console.log('[productService] Actualizando producto con datos:', filteredUpdateData);

      const producto = await Producto.findByIdAndUpdate(
        id,
        filteredUpdateData,
        { new: true, runValidators: true }
      );

      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }

      console.log('[productService] Producto actualizado exitosamente');

      // Retornar con populate
      return await Producto.findById(producto._id).populate('categoryId', 'nombre descripcion');
    } catch (error) {
      console.error('[productService] Error en updateProduct:', error);
      throw error.status ? error : { status: 500, message: 'Error al actualizar el producto', details: error.message };
    }
  },

  // Actualizar cantidad vendida
  async updateCantidadVendida(id, cantidad) {
    try {
      const producto = await Producto.findById(id);
      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }

      const cantidadDisponible = producto.cantidad - producto.cantidadVendida + producto.cantidadDevuelta;
      if (cantidad > cantidadDisponible) {
        throw { status: 400, message: 'No hay suficiente stock disponible' };
      }

      producto.cantidadVendida += cantidad;
      return await producto.save();
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al actualizar la cantidad vendida' };
    }
  },

  // Registrar devolución
  async registrarDevolucion(id, cantidad) {
    try {
      const producto = await Producto.findById(id);
      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }

      if (cantidad > producto.cantidadVendida - producto.cantidadDevuelta) {
        throw { status: 400, message: 'La cantidad a devolver excede las ventas registradas' };
      }

      producto.cantidadDevuelta += cantidad;
      return await producto.save();
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al registrar la devolución' };
    }
  },

  // Obtener todos los productos
  async getAllProducts() {
    try {
      return await Producto.find().sort({ createdAt: -1 }).populate('categoryId', 'nombre descripcion');
    } catch (error) {
      throw { status: 500, message: 'Error al obtener los productos' };
    }
  },

  // Obtener un producto por ID
  async getProductById(id) {
    try {
      const producto = await Producto.findById(id).populate('categoryId', 'nombre descripcion');
      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }
      return producto;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al obtener el producto' };
    }
  },

  // Eliminar un producto
  async deleteProduct(id) {
    try {
      const producto = await Producto.findByIdAndDelete(id);
      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }
      return producto;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al eliminar el producto' };
    }
  }
};

module.exports = productService;
