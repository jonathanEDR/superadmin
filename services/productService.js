const Producto = require('../models/Producto');

// Obtener todos los productos (visible para todos los usuarios)
const getProductos = async () => {
  try {
    const productos = await Producto.find({})
      .sort({ productoNumero: -1 });
      // Calcular cantidadRestante y agregar información del creador
    const productosConInfo = productos.map(producto => {
      const cantidadRestante = producto.cantidad - (producto.cantidadVendida || 0);
      return {
        ...producto.toObject(),
        cantidadRestante,
        creatorInfo: {
          id: producto.creatorId,
          name: producto.creatorInfo?.name || producto.creatorName || 'Desconocido',
          role: producto.creatorInfo?.role || producto.creatorRole || 'admin'
        }
      };
    });
    
    console.log('Productos procesados:', productosConInfo.map(p => ({
      id: p._id,
      nombre: p.nombre,
      creatorId: p.creatorId,
      creatorRole: p.creatorRole
    })));
    
    return productosConInfo;
  } catch (error) {
    console.error('Error al obtener los productos:', error);
    throw new Error(`Error al obtener productos: ${error.message}`);
  }
};

const verificarPermisos = (producto, userId, userRole) => {
  // Verificar que los parámetros necesarios estén presentes
  if (!producto || !userId || !userRole) {
    console.log('Faltan parámetros necesarios:', { producto, userId, userRole });
    return false;
  }

  // Agregar logging inicial para ver los valores exactos que recibimos
  console.log('Valores recibidos en verificarPermisos:', {
    producto: {
      _id: producto._id,
      creatorId: producto.creatorId,
      userId: producto.userId,
      creatorInfo: producto.creatorInfo
    },
    userId,
    userRole
  });

  // Limpiar los IDs antes de comparar
  const cleanUserId = String(userId || '').replace('user_', '');
  const cleanCreatorId = String(producto.creatorId || '').replace('user_', '');
  
  // Si es super_admin, tiene todos los permisos
  if (userRole === 'super_admin') {
    return true;
  }

  // Si es admin, verificar que no esté intentando modificar un producto de super_admin
  if (userRole === 'admin') {
    // Verificar si el producto fue creado por un super_admin
    if (producto.creatorInfo?.role === 'super_admin') {
      console.log('Admin intentando modificar producto de super_admin - Acceso denegado');
      return false;
    }

    // Verificar si el admin es el creador del producto
    const tienePermiso = cleanCreatorId === cleanUserId;
    console.log('Resultado verificación admin:', {
      tienePermiso,
      cleanCreatorId,
      cleanUserId,
      comparacion: `${cleanCreatorId} === ${cleanUserId}`,
      creatorRole: producto.creatorInfo?.role
    });
    return tienePermiso;
  }

  // Si no es super_admin ni admin, denegar acceso
  return false;
};


const createProducto = async (productoData) => {
  console.log('Creando producto con datos:', productoData);
  
  try {
    // Validación de datos
    if (!productoData.userId || !productoData.creatorId) {
      throw new Error('userId y creatorId son requeridos para crear un producto');
    }

    if (!productoData.nombre || productoData.precio === undefined || productoData.cantidad === undefined) {
      throw new Error('Nombre, precio y cantidad son campos obligatorios');
    }

    // Crear el objeto del producto
    const productoCompleto = {
      nombre: productoData.nombre,
      precio: Number(productoData.precio),
      cantidad: Number(productoData.cantidad),
      cantidadVendida: 0,
      cantidadRestante: Number(productoData.cantidad),
      userId: productoData.userId,
      creatorId: String(productoData.creatorId).replace('user_', ''),
      creatorName: productoData.creatorName,
      creatorInfo: {
        name: productoData.creatorName,
        role: productoData.creatorRole, // Aseguramos que se guarde el rol correcto
        email: productoData.creatorEmail
      }
    };
    
    console.log('Producto completo a guardar:', productoCompleto);
    
    // Crear y guardar el producto
    const nuevoProducto = new Producto(productoCompleto);
    const productoGuardado = await nuevoProducto.save();
    
    console.log('Producto guardado exitosamente:', productoGuardado);
    
    return productoGuardado;
  } catch (error) {
    console.error('Error detallado al crear producto:', error);
    if (error.code === 11000) {
      throw new Error('Error de duplicación al crear el producto. Por favor, intenta nuevamente.');
    }
    throw new Error(`Error al crear el producto: ${error.message}`);
  }
};

// En productService.js
const deleteProducto = async (id, userId, userRole) => {
  try {
    const producto = await Producto.findById(id);
    if (!producto) {
      throw new Error('Producto no encontrado');
    }

    const tienePermiso = verificarPermisos(producto, userId, userRole);
    if (!tienePermiso) {
      throw new Error('No tienes permisos para eliminar este producto');
    }

    return await Producto.findByIdAndDelete(id);
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    throw error;
  }
};

const updateProducto = async (id, updateData, userId, userRole) => {
  try {
    const producto = await Producto.findById(id);
    if (!producto) {
      throw new Error('Producto no encontrado');
    }

    const tienePermiso = verificarPermisos(producto, userId, userRole);
    if (!tienePermiso) {
      throw new Error('No tienes permisos para actualizar este producto');
    }

    return await Producto.findByIdAndUpdate(id, updateData, { new: true });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    throw error;
  }
};


module.exports = { getProductos, createProducto, deleteProducto, updateProducto, verificarPermisos };
