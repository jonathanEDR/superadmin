const Producto = require('../models/Producto');
const Category = require('../models/Category');

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
    try {
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
      const codigoProducto = catalogoProducto.codigoproducto || catalogoProducto.codigoProducto;
      console.log('[DEBUG] Código del producto del catálogo:', codigoProducto);
      
      if (!codigoProducto) {
        throw { status: 400, message: 'El producto de catálogo no tiene código' };
      }
      
      // Validar que no exista el mismo producto del catálogo en la misma categoría
      const productoExistente = await Producto.findOne({ 
        catalogoProductoId: productData.catalogoProductoId,
        categoryId: productData.categoryId 
      });
      
      if (productoExistente) {
        throw { status: 409, message: 'Este producto ya existe en esta categoría' };
      }

      console.log('[DEBUG] Creando producto con datos:', {
        nombre: nombreNormalizado,
        codigoProducto,
        categoryId: categoria._id,
        categoryName: categoria.nombre
      });

      const producto = new Producto({
        ...productData,
        nombre: nombreNormalizado,
        codigoProducto,
        cantidadVendida: 0,
        cantidadDevuelta: 0,
        categoryName: categoria.nombre
      });

      console.log('[DEBUG] Guardando producto en base de datos...');
      const productoGuardado = await producto.save();
      console.log('[DEBUG] Producto guardado exitosamente:', productoGuardado._id);
      
      return productoGuardado;
    } catch (error) {
      console.error('[ERROR] Error detallado en createProducto:', error);
      console.error('[ERROR] Stack trace:', error.stack);
      throw error.status ? error : { status: 500, message: 'Error al crear el producto', details: error.message };
    }
  },

  // Actualizar un producto
  async updateProduct(id, updateData) {
    try {
      if (updateData.nombre) {
        const nombreNormalizado = normalizarNombre(updateData.nombre);
        const productoExistente = await Producto.findOne({
          nombre: nombreNormalizado,
          _id: { $ne: id }
        });
        if (productoExistente) {
          throw { status: 409, message: 'Ya existe otro producto con este nombre' };
        }
        updateData.nombre = nombreNormalizado;
      }
      // Validar nueva categoría si se actualiza
      if (updateData.categoryId) {
        const categoria = await Category.findById(updateData.categoryId);
        if (!categoria) {
          throw { status: 404, message: 'La categoría especificada no existe' };
        }
      }
      const producto = await Producto.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
      );
      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }
      // Retornar con populate
      return await Producto.findById(producto._id).populate('categoryId', 'nombre descripcion');
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al actualizar el producto' };
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
