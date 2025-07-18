const express = require('express');
const router = express.Router();
const catalogoService = require('../services/catalogoService');
const { authenticate, requireAdmin } = require('../middleware/authenticate');

// GET /api/catalogo → lista de productos del catálogo
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const productos = await catalogoService.getCatalogo();
    res.json(productos);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el catálogo', error: error.message });
  }
});

// POST /api/catalogo → agregar producto al catálogo
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    // Asegurarse que el frontend envía codigoproducto
    const nuevoProducto = await catalogoService.addProducto(req.body);
    res.status(201).json(nuevoProducto);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

// PUT /api/catalogo/:id → editar producto del catálogo
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    // Asegurarse que el frontend envía codigoproducto si se edita
    const actualizado = await catalogoService.editProducto(req.params.id, req.body);
    res.json(actualizado);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

// PUT /api/catalogo/:id/estado → activar/desactivar producto
router.put('/:id/estado', authenticate, requireAdmin, async (req, res) => {
  try {
    const actualizado = await catalogoService.setEstado(req.params.id, req.body.activo);
    res.json(actualizado);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

// Eliminar producto del catálogo
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await catalogoService.deleteProducto(req.params.id);
    res.json({ message: 'Producto eliminado correctamente' });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

module.exports = router;
