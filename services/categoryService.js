const Category = require('../models/Category');
const Producto = require('../models/Producto');

// Función auxiliar para normalizar el nombre
const normalizarNombre = (nombre) => nombre.trim().toLowerCase();

const categoryService = {
  // Obtener todas las categorías
  async getCategories() {
    try {
      return await Category.find({ estado: 'activo' }).sort({ nombre: 1 });
    } catch (error) {
      throw { status: 500, message: 'Error al obtener las categorías' };
    }
  },

  // Crear una nueva categoría
  async createCategory(categoryData) {
    try {
      const nombreNormalizado = normalizarNombre(categoryData.nombre);
      const categoriaExistente = await Category.findOne({ nombre: nombreNormalizado });
      
      if (categoriaExistente) {
        throw { status: 409, message: 'Ya existe una categoría con este nombre' };
      }

      const categoria = new Category({
        ...categoryData,
        nombre: nombreNormalizado
      });

      return await categoria.save();
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al crear la categoría' };
    }
  },

  // Actualizar una categoría
  async updateCategory(id, updateData) {
    try {
      if (updateData.nombre) {
        const nombreNormalizado = normalizarNombre(updateData.nombre);
        const categoriaExistente = await Category.findOne({
          nombre: nombreNormalizado,
          _id: { $ne: id }
        });
        
        if (categoriaExistente) {
          throw { status: 409, message: 'Ya existe otra categoría con este nombre' };
        }
        updateData.nombre = nombreNormalizado;
      }

      const categoria = await Category.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!categoria) {
        throw { status: 404, message: 'Categoría no encontrada' };
      }

      // Si se actualizó el nombre, actualizar también los productos
      if (updateData.nombre) {
        await Producto.updateMany(
          { categoryId: id },
          { categoryName: updateData.nombre }
        );
      }

      return categoria;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al actualizar la categoría' };
    }
  },

  // Eliminar una categoría
  async deleteCategory(id) {
    try {
      // Verificar si hay productos usando esta categoría
      const productosCount = await Producto.countDocuments({ categoryId: id });
      if (productosCount > 0) {
        throw { 
          status: 400, 
          message: `No se puede eliminar la categoría porque tiene ${productosCount} productos asociados` 
        };
      }

      const categoria = await Category.findByIdAndDelete(id);
      if (!categoria) {
        throw { status: 404, message: 'Categoría no encontrada' };
      }

      return categoria;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al eliminar la categoría' };
    }
  },

  // Obtener una categoría por ID
  async getCategoryById(id) {
    try {
      const categoria = await Category.findById(id);
      if (!categoria) {
        throw { status: 404, message: 'Categoría no encontrada' };
      }
      return categoria;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al obtener la categoría' };
    }
  },

  // Obtener productos por categoría
  async getProductsByCategory(categoryId) {
    try {
      return await Producto.find({ categoryId }).sort({ nombre: 1 });
    } catch (error) {
      throw { status: 500, message: 'Error al obtener los productos de la categoría' };
    }
  }
};

module.exports = categoryService;
