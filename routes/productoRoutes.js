const express = require('express');
const router = express.Router();
const { 
  getProductos, 
  createProducto, 
  deleteProducto, 
  updateProducto 
} = require('../services/productService');
const { authenticate, requireAdmin, requireUser } = require('../middleware/authenticate');

// Ruta para obtener todos los productos (accesible para todos los usuarios autenticados)
router.get('/', authenticate, requireUser, async (req, res) => {
  try {
    const productos = await getProductos();
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
});


// Ruta para agregar un producto (admin y super_admin)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    console.log('Recibiendo petición POST con datos:', {
      body: req.body,
      user: req.user
    });

    const { nombre, precio, cantidad, creatorName, creatorEmail } = req.body;
    const userId = req.user.id;
    const creatorId = req.user.id;
    const creatorRole = req.user.role;

    console.log('Datos procesados:', {
      userId,
      creatorId,
      creatorRole,
      creatorName,
      creatorEmail,
      nombre,
      precio,
      cantidad
    });

    const nuevoProducto = await createProducto({
      userId,
      creatorId,
      creatorRole,
      creatorName: creatorName || req.user.name,
      creatorEmail,
      nombre,
      precio,
      cantidad
    });

    res.status(201).json(nuevoProducto);
  } catch (error) {
    console.error('Error en ruta POST /productos:', error);
    res.status(500).json({
      message: 'Error al crear producto',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Ruta para eliminar un producto (admin y super_admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const producto = await deleteProducto(id, userId, userRole);
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(403).json({ message: error.message });
  }
});

// Ruta para actualizar un producto (admin y super_admin)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nombre, precio, cantidad } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const producto = await updateProducto(
      id, 
      { nombre, precio, cantidad },
      userId,
      userRole
    );
    
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    
    res.json(producto);
  } catch (error) {
    res.status(403).json({ message: error.message });
  }
});

// Ruta para obtener informe de inventario
router.get('/reportes/inventario', authenticate, requireAdmin, async (req, res) => {
  try {
    const productos = await getProductos();
    const reporteInventario = productos.map((producto) => ({
      nombre: producto.nombre,
      cantidad: producto.cantidad,
      precio: producto.precio,
      valorTotal: producto.precio * producto.cantidad
    }));

    const valorTotalInventario = reporteInventario.reduce((acc, item) => acc + item.valorTotal, 0);

    res.json({ reporteInventario, valorTotalInventario });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener el informe de inventario', 
      error: error.message 
    });
  }
});

module.exports = router;