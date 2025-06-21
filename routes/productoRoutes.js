const express = require('express');
const router = express.Router();
const productService = require('../services/productService');
const { authenticate, requireAdmin, requireUser } = require('../middleware/authenticate');

// Ruta para obtener todos los productos (accesible para todos los usuarios autenticados)
router.get('/', authenticate, requireUser, async (req, res) => {
  try {
    const productos = await productService.getProductos();
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error al obtener productos', error: error.message });
  }
});

// Ruta para obtener un producto específico por ID
router.get('/:id', authenticate, requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const producto = await productService.getProductById(id);
    
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    
    res.json(producto);
  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({ message: 'Error al obtener el producto', error: error.message });
  }
});

// Ruta para agregar un producto (admin y super_admin)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { nombre, precio, cantidad, creatorName, creatorEmail } = req.body;
    
    if (!nombre || !precio || !cantidad) {
      return res.status(400).json({ 
        message: 'Faltan campos requeridos',
        details: {
          nombre: !nombre ? 'El nombre es requerido' : null,
          precio: !precio ? 'El precio es requerido' : null,
          cantidad: !cantidad ? 'La cantidad es requerida' : null
        }
      });
    }    const userId = req.user.clerk_id; // Usando clerk_id en lugar de id
    const creatorId = req.user.clerk_id;
    const creatorRole = req.user.role;    const nuevoProducto = await productService.createProducto({
      userId,
      creatorId,
      creatorRole,
      nombre,
      precio: Number(precio),
      cantidad: Number(cantidad),
      creatorName: creatorName || req.user.email.split('@')[0],
      creatorEmail: creatorEmail || req.user.email,
      cantidad: Number(cantidad)
    });

    res.status(201).json(nuevoProducto);
  } catch (error) {
    console.error('Error al crear producto:', error);
    
    // Manejar error específico de duplicado
    if (error.message.includes('Ya existe un producto con este nombre')) {
      return res.status(409).json({ 
        message: 'Ya existe un producto con este nombre',
        error: error.message 
      });
    }
    
    // Manejar error de mongoose unique
    if (error.code === 11000) {
      return res.status(409).json({ 
        message: 'Ya existe un producto con este nombre',
        error: 'Duplicate key error'
      });
    }

    res.status(500).json({ 
      message: 'Error al crear el producto', 
      error: error.message 
    });
  }
});

// Ruta para eliminar un producto (admin y super_admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Primero verificamos si el usuario tiene permisos para eliminar este producto
    const producto = await productService.getProductById(id);
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Verificar permisos
    if (userRole !== 'super_admin' && producto.creatorInfo?.role === 'super_admin') {
      return res.status(403).json({ message: 'No tienes permiso para eliminar este producto' });
    }

    await productService.deleteProduct(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(error.status || 500).json({ message: error.message });
  }
});

// Ruta para actualizar un producto (admin y super_admin)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Primero verificamos si el usuario tiene permisos para editar este producto
    const producto = await productService.getProductById(id);
    if (!producto) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    // Verificar permisos
    if (userRole !== 'super_admin' && producto.creatorInfo?.role === 'super_admin') {
      return res.status(403).json({ message: 'No tienes permiso para editar este producto' });
    }

    const updatedProduct = await productService.updateProduct(id, {
      ...updateData,
      updatedAt: new Date()
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    const status = error.status || 500;
    const message = error.message || 'Error al actualizar el producto';
    res.status(status).json({ message });
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