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
    console.log('\n🚨 === RUTA PRODUCTOS LLAMADA (POSIBLE ERROR) ===');
    console.log('📍 URL completa:', req.originalUrl);
    console.log('📍 Método:', req.method);
    console.log('📍 Esta ruta NO debería llamarse para inventario!');
    console.log('[DEBUG] POST /api/productos - Request body:', req.body);
    console.log('[DEBUG] POST /api/productos - User:', req.user);
    
    const { precio, cantidad, creatorName, creatorEmail, categoryId, catalogoProductoId } = req.body;
    // Validar campos requeridos
    if (!precio || !cantidad || !categoryId || !catalogoProductoId) {
      console.error('[DEBUG] POST /api/productos - Missing required fields:', {
        precio: !precio ? 'Missing' : 'OK',
        cantidad: !cantidad ? 'Missing' : 'OK',
        categoryId: !categoryId ? 'Missing' : 'OK',
        catalogoProductoId: !catalogoProductoId ? 'Missing' : 'OK'
      });
      return res.status(400).json({ 
        message: 'Faltan campos requeridos',
        details: {
          precio: !precio ? 'El precio es requerido' : null,
          cantidad: !cantidad ? 'La cantidad es requerida' : null,
          categoryId: !categoryId ? 'La categoría es requerida' : null,
          catalogoProductoId: !catalogoProductoId ? 'El producto de catálogo es requerido' : null
        }
      });
    }
    const userId = req.user.clerk_id;
    const creatorId = req.user.clerk_id;
    const creatorRole = req.user.role;

    const productData = {
      userId,
      creatorId,
      creatorRole,
      precio: Number(precio),
      cantidad: Number(cantidad),
      categoryId,
      catalogoProductoId,
      creatorName: creatorName || req.user.email.split('@')[0],
      creatorEmail: creatorEmail || req.user.email
    };

    console.log('[DEBUG] POST /api/productos - Product data to create:', productData);

    const nuevoProducto = await productService.createProducto(productData);

    console.log('[DEBUG] POST /api/productos - Product created successfully:', nuevoProducto);
    res.status(201).json(nuevoProducto);
  } catch (error) {
    console.error('[ERROR] POST /api/productos - Error creating product:', error);
    console.error('[ERROR] POST /api/productos - Error stack:', error.stack);
    
    // Manejar errores específicos del servicio
    if (error.status) {
      return res.status(error.status).json({ 
        message: error.message,
        error: error.message 
      });
    }
    
    // Manejar error específico de duplicado
    if (error.message && error.message.includes('Ya existe un producto con este nombre')) {
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
      error: error.message,
      details: error.stack
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
    // Usar el servicio para obtener productos con categoría poblada
    const productos = await productService.getProductos();
    const reporteInventario = productos.map((producto) => ({
      nombre: producto.nombre,
      cantidad: producto.cantidad,
      precio: producto.precio,
      categoria: producto.categoryId?.nombre || 'Sin categoría',
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

// --- Catálogo de productos ---
// GET /api/productos/catalogo → lista de productos del catálogo (solo código, nombre, activo)
router.get('/catalogo', authenticate, requireAdmin, async (req, res) => {
  try {
    const productos = await productService.getCatalogoProductos();
    // Solo devolver los campos requeridos
    const catalogo = productos.map(p => ({
      _id: p._id,
      codigoProducto: p.codigoProducto,
      nombre: p.nombre,
      activo: p.activo
    }));
    res.json(catalogo);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el catálogo', error: error.message });
  }
});

// POST /api/productos/catalogo → agregar producto al catálogo
router.post('/catalogo', authenticate, requireAdmin, async (req, res) => {
  try {
    const { codigoProducto, nombre, activo } = req.body;
    if (!codigoProducto || !nombre) {
      return res.status(400).json({ message: 'Faltan campos requeridos: código y nombre' });
    }
    const nuevoProducto = await productService.createCatalogoProducto({ codigoProducto, nombre, activo });
    res.status(201).json(nuevoProducto);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'El código o nombre ya existe', error: 'Duplicate key error' });
    }
    res.status(500).json({ message: 'Error al agregar producto al catálogo', error: error.message });
  }
});

// PUT /api/productos/catalogo/:id → editar producto del catálogo
router.put('/catalogo/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { codigoProducto, nombre, activo } = req.body;
    const actualizado = await productService.updateCatalogoProducto(id, { codigoProducto, nombre, activo });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ message: 'Error al editar producto del catálogo', error: error.message });
  }
});

// PUT /api/productos/catalogo/:id/estado → activar/desactivar producto
router.put('/catalogo/:id/estado', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    if (typeof activo !== 'boolean') {
      return res.status(400).json({ message: 'El campo "activo" debe ser booleano' });
    }
    const actualizado = await productService.updateCatalogoEstado(id, activo);
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ message: 'Error al cambiar estado del producto', error: error.message });
  }
});

module.exports = router;