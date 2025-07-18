const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const User = require('../models/User');
const { getNextSequenceValue } = require('../utils/counter');

const createVenta = async (data) => {
  try {
    // Generar número de venta
    const numeroVenta = await getNextSequenceValue('venta');
    
    // Inicializar historial para cada producto
    if (data.productos && data.productos.length > 0) {
      data.productos = data.productos.map(producto => ({
        ...producto,
        historial: [{
          operacion: producto.cantidad,
          fecha: new Date(),
          cantidadAnterior: 0,
          cantidadNueva: producto.cantidad
        }]
      }));
    }
    
    // Crear nueva venta
    const venta = new Venta({
      numeroVenta,
      ...data,
      fechaVenta: new Date(),
      estadoVenta: 'completada'
    });

    // Guardar venta
    const savedVenta = await venta.save();

    // Actualizar stock de productos
    if (data.productos && data.productos.length > 0) {
      for (const producto of data.productos) {
        await Producto.findByIdAndUpdate(
          producto.productoId,
          { $inc: { stock: -producto.cantidad } }
        );
      }
    }

    return savedVenta;
  } catch (error) {
    throw new Error('Error al crear la venta: ' + error.message);
  }
};

const getAllVentas = async (userId, userRole) => {
  try {
    let filter = {};
    
    if (userRole === 'user') {
      filter.userId = userId;
    }
    
    const ventas = await Venta.find(filter)
      .populate('userId', 'firstName lastName email')
      .populate('productos.productoId', 'nombre precio categoria')
      .sort({ fechaVenta: -1 });
    
    return ventas;
  } catch (error) {
    throw new Error('Error al obtener las ventas: ' + error.message);
  }
};

const getVentaById = async (ventaId) => {
  try {
    const venta = await Venta.findById(ventaId)
      .populate('userId', 'firstName lastName email')
      .populate('productos.productoId', 'nombre precio categoria stock');
    
    if (!venta) {
      throw new Error('Venta no encontrada');
    }
    
    return venta;
  } catch (error) {
    throw new Error('Error al obtener la venta: ' + error.message);
  }
};

const updateVenta = async (ventaId, data) => {
  try {
    const venta = await Venta.findByIdAndUpdate(ventaId, data, { new: true });
    
    if (!venta) {
      throw new Error('Venta no encontrada');
    }
    
    return venta;
  } catch (error) {
    throw new Error('Error al actualizar la venta: ' + error.message);
  }
};

const deleteVenta = async (ventaId) => {
  try {
    const venta = await Venta.findByIdAndDelete(ventaId);
    
    if (!venta) {
      throw new Error('Venta no encontrada');
    }
    
    return venta;
  } catch (error) {
    throw new Error('Error al eliminar la venta: ' + error.message);
  }
};

const updateProductQuantityInVenta = async (ventaId, productoId, nuevaCantidad, userId) => {
  try {
    console.log('🔍 Actualizando cantidad en venta:', { ventaId, productoId, nuevaCantidad, userId });
    
    // Verificar permisos del usuario con múltiples campos
    console.log('🔍 Buscando usuario con clerkId:', userId);
    let user = await User.findOne({ clerkId: userId });
    
    if (!user) {
      console.log('🔍 Buscando usuario con clerk_id:', userId);
      user = await User.findOne({ clerk_id: userId });
    }
    
    if (!user) {
      // Mostrar todos los usuarios para debug
      const allUsers = await User.find({}).select('clerkId clerk_id email firstName lastName');
      console.log('🔍 Todos los usuarios en la BD:', allUsers);
      throw new Error('Usuario no encontrado en la base de datos');
    }
    
    console.log('✅ Usuario encontrado:', { 
      id: user._id, 
      role: user.role, 
      email: user.email,
      clerkId: user.clerkId || user.clerk_id
    });
    
    // Buscar la venta
    const venta = await Venta.findById(ventaId);
    if (!venta) {
      throw new Error('Venta no encontrada');
    }
    
    console.log('✅ Venta encontrada:', venta.numeroVenta);
    
    // Verificar permisos: super_admin y admin pueden modificar cualquier venta
    // user solo puede modificar sus propias ventas
    if (user.role === 'user' && venta.userId.toString() !== user._id.toString()) {
      throw new Error('No tienes permisos para modificar esta venta');
    }
    
    // Buscar el producto en la venta
    const productoEnVenta = venta.productos.find(p => p.productoId.toString() === productoId);
    if (!productoEnVenta) {
      throw new Error('Producto no encontrado en la venta');
    }
    
    // Obtener el producto completo
    const producto = await Producto.findById(productoId);
    if (!producto) {
      throw new Error('Producto no encontrado');
    }
    
    // Calcular diferencia de cantidad
    const cantidadAnterior = productoEnVenta.cantidad;
    const diferencia = nuevaCantidad - cantidadAnterior;
    
    console.log('🔍 Diferencia de cantidad:', diferencia);
    
    // Verificar stock disponible si aumentamos la cantidad
    if (diferencia > 0 && producto.stock < diferencia) {
      throw new Error('Stock insuficiente');
    }
    
    // Validar que los valores sean números válidos
    const cantidadNum = Number(nuevaCantidad);
    const precioNum = Number(productoEnVenta.precioUnitario || productoEnVenta.precio);
    
    console.log('🔍 Validando valores:', {
      nuevaCantidad: nuevaCantidad,
      cantidadNum: cantidadNum,
      precio: productoEnVenta.precio,
      precioUnitario: productoEnVenta.precioUnitario,
      precioNum: precioNum,
      isNaN_cantidad: isNaN(cantidadNum),
      isNaN_precio: isNaN(precioNum),
      productoEnVenta: productoEnVenta
    });
    
    if (isNaN(cantidadNum) || isNaN(precioNum) || cantidadNum < 0 || precioNum < 0) {
      throw new Error(`Valores inválidos: cantidad=${nuevaCantidad}, precio=${productoEnVenta.precioUnitario || productoEnVenta.precio}`);
    }
    
    // Actualizar cantidad en la venta
    productoEnVenta.cantidad = cantidadNum;
    productoEnVenta.subtotal = cantidadNum * precioNum;
    
    console.log('✅ Subtotal calculado:', productoEnVenta.subtotal);
    
    // Agregar entrada al historial del producto en la venta
    if (!productoEnVenta.historial) {
      productoEnVenta.historial = [];
    }
    
    productoEnVenta.historial.push({
      operacion: diferencia,
      fecha: new Date(),
      cantidadAnterior: cantidadAnterior,
      cantidadNueva: cantidadNum
    });
    
    console.log('✅ Historial agregado:', {
      operacion: diferencia,
      cantidadAnterior: cantidadAnterior,
      cantidadNueva: cantidadNum
    });
    
    // Recalcular total de la venta
    venta.total = venta.productos.reduce((sum, p) => {
      const subtotalNum = Number(p.subtotal);
      return sum + (isNaN(subtotalNum) ? 0 : subtotalNum);
    }, 0);
    
    // Actualizar stock del producto
    const productoActualizado = await Producto.findById(productoId);
    if (productoActualizado) {
      // Actualizar stock y cantidades
      productoActualizado.stock -= diferencia;
      productoActualizado.cantidadVendida += diferencia;
      productoActualizado.cantidadRestante = productoActualizado.cantidad - productoActualizado.cantidadVendida;
      
      // Asegurar que no haya valores negativos
      if (productoActualizado.cantidadVendida < 0) {
        productoActualizado.cantidadVendida = 0;
      }
      if (productoActualizado.cantidadRestante < 0) {
        productoActualizado.cantidadRestante = 0;
      }
      
      console.log('🔄 Actualizando stock del producto:', {
        productoId: productoId,
        nombre: productoActualizado.nombre,
        diferencia: diferencia,
        stockAnterior: productoActualizado.stock + diferencia,
        stockNuevo: productoActualizado.stock,
        cantidadVendida: productoActualizado.cantidadVendida,
        cantidadRestante: productoActualizado.cantidadRestante
      });
      
      await productoActualizado.save();
    }
    
    // Agregar entrada al historial del producto
    if (!producto.historial) {
      producto.historial = [];
    }
    
    producto.historial.push({
      fecha: new Date(),
      tipo: 'modificacion_venta',
      cantidad: diferencia,
      stockAnterior: producto.stock,
      stockNuevo: producto.stock - diferencia,
      observaciones: `Modificación en venta ${venta.numeroVenta} por ${user.firstName} ${user.lastName}`,
      usuario: user._id
    });
    
    await producto.save();
    await venta.save();
    
    console.log('✅ Venta actualizada exitosamente');
    
    return await Venta.findById(ventaId)
      .populate('userId', 'firstName lastName email')
      .populate('productos.productoId', 'nombre precio categoria stock');
    
  } catch (error) {
    console.error('❌ Error en updateProductQuantityInVenta:', error);
    throw new Error('Error al actualizar cantidad del producto: ' + error.message);
  }
};

const getVentasByDateRange = async (startDate, endDate, userId, userRole) => {
  try {
    let filter = {
      fechaVenta: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };
    
    if (userRole === 'user') {
      filter.userId = userId;
    }
    
    const ventas = await Venta.find(filter)
      .populate('userId', 'firstName lastName email')
      .populate('productos.productoId', 'nombre precio categoria')
      .sort({ fechaVenta: -1 });
    
    return ventas;
  } catch (error) {
    throw new Error('Error al obtener las ventas por rango de fechas: ' + error.message);
  }
};

const getVentasByUser = async (targetUserId, requestingUserId, userRole) => {
  try {
    // Solo admin y super_admin pueden ver ventas de otros usuarios
    if (userRole === 'user' && targetUserId !== requestingUserId) {
      throw new Error('No tienes permisos para ver las ventas de otros usuarios');
    }
    
    const ventas = await Venta.find({ userId: targetUserId })
      .populate('userId', 'firstName lastName email')
      .populate('productos.productoId', 'nombre precio categoria')
      .sort({ fechaVenta: -1 });
    
    return ventas;
  } catch (error) {
    throw new Error('Error al obtener las ventas del usuario: ' + error.message);
  }
};

const getTotalVentas = async (userId, userRole) => {
  try {
    let filter = {};
    
    if (userRole === 'user') {
      filter.userId = userId;
    }
    
    const result = await Venta.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
          cantidad: { $sum: 1 }
        }
      }
    ]);
    
    return result.length > 0 ? result[0] : { total: 0, cantidad: 0 };
  } catch (error) {
    throw new Error('Error al obtener el total de ventas: ' + error.message);
  }
};

module.exports = {
  createVenta,
  getAllVentas,
  getVentaById,
  updateVenta,
  deleteVenta,
  updateProductQuantityInVenta,
  getVentasByDateRange,
  getVentasByUser,
  getTotalVentas
};
