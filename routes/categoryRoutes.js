const express = require('express');
const router = express.Router();
const categoryService = require('../services/categoryService');
const { authenticate, requireAdmin } = require('../middleware/authenticate');

// Obtener todas las categorías
router.get('/', authenticate, async (req, res) => {
  try {
    const categories = await categoryService.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(error.status || 500).json({ message: error.message });
  }
});

// Crear una nueva categoría (solo admin)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    
    if (!nombre) {
      return res.status(400).json({ message: 'El nombre es requerido' });
    }

    const categoryData = {
      nombre,
      descripcion,
      creatorId: req.user.clerk_id,
      creatorName: req.user.name || req.user.email.split('@')[0],
      creatorRole: req.user.role
    };

    const newCategory = await categoryService.createCategory(categoryData);
    res.status(201).json(newCategory);
  } catch (error) {
    console.error('Error al crear categoría:', error);
    res.status(error.status || 500).json({ message: error.message });
  }
});

// Actualizar una categoría (solo admin)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const categoria = await categoryService.updateCategory(id, req.body);
    res.json(categoria);
  } catch (error) {
    console.error('Error al actualizar categoría:', error);
    res.status(error.status || 500).json({ message: error.message });
  }
});

// Eliminar una categoría (solo admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await categoryService.deleteCategory(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error al eliminar categoría:', error);
    res.status(error.status || 500).json({ message: error.message });
  }
});

// Obtener productos por categoría
router.get('/:id/productos', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const productos = await categoryService.getProductsByCategory(id);
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener productos de la categoría:', error);
    res.status(error.status || 500).json({ message: error.message });
  }
});

module.exports = router;
