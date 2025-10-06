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
    
    // Preparar datos de la venta
    const ventaData = {
      numeroVenta,
      ...data,
      fechaVenta: new Date(),
      estadoVenta: 'completada'
    };

    // Si es una venta sin registro, asegurarse de incluir clienteNombre
    if (data.userId === 'sin-registro' && data.clienteNombre) {
      ventaData.clienteNombre = data.clienteNombre;
    }
    
    // Crear nueva venta
    const venta = new Venta(ventaData);

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
    
    console.log('🔍 Análisis de stock:', {
      productoNombre: producto.nombre,
      cantidadAnterior,
      nuevaCantidad,
      diferencia,
      stockTotal: producto.cantidad,
      stockDisponible: producto.cantidadRestante || (producto.cantidad - producto.cantidadVendida),
      cantidadVendida: producto.cantidadVendida
    });

    // ✅ VALIDACIÓN MEJORADA DE STOCK
    if (diferencia > 0) {
      // Si aumentamos la cantidad, verificar stock disponible
      const stockDisponible = producto.cantidadRestante || (producto.cantidad - (producto.cantidadVendida || 0));
      
      if (diferencia > stockDisponible) {
        throw new Error(`Stock insuficiente. Disponible: ${stockDisponible}, solicitado: ${diferencia}`);
      }
      
      if (stockDisponible <= 0) {
        throw new Error(`Producto sin stock disponible`);
      }
    }
    
    // ✅ VALIDACIÓN PARA EVITAR CANTIDADES NEGATIVAS
    if (nuevaCantidad < 0) {
      throw new Error('La cantidad no puede ser negativa');
    }
    
    // ✅ VALIDACIÓN PARA EVITAR EXCEDER STOCK TOTAL
    if (nuevaCantidad > producto.cantidad) {
      throw new Error(`La cantidad (${nuevaCantidad}) no puede exceder el stock total (${producto.cantidad})`);
    }    // Validar que los valores sean números válidos
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
    
    // ✅ RECALCULAR MONTO TOTAL DE LA VENTA (CORREGIDO)
    const montoTotalCalculado = venta.productos.reduce((sum, p) => {
      const subtotalNum = Number(p.subtotal);
      return sum + (isNaN(subtotalNum) ? 0 : subtotalNum);
    }, 0);
    
    // ✅ ACTUALIZAR EL CAMPO CORRECTO (montoTotal, no total)
    venta.montoTotal = montoTotalCalculado;
    
    // ✅ ACTUALIZAR DEUDA PENDIENTE
    venta.debe = venta.montoTotal - (venta.cantidadPagada || 0);
    
    console.log('💰 Monto total recalculado:', {
      montoAnterior: venta.montoTotal !== montoTotalCalculado ? 'diferente' : 'igual',
      montoNuevo: montoTotalCalculado,
      cantidadPagada: venta.cantidadPagada || 0,
      debeNuevo: venta.debe,
      subtotales: venta.productos.map(p => ({
        producto: p.productoId,
        cantidad: p.cantidad,
        precioUnitario: p.precioUnitario,
        subtotal: p.subtotal
      }))
    });
    
    // ✅ ACTUALIZACIÓN MEJORADA DEL STOCK
    const productoActualizado = await Producto.findById(productoId);
    if (productoActualizado) {
      // Calcular nuevos valores
      const cantidadVendidaAnterior = productoActualizado.cantidadVendida || 0;
      const cantidadVendidaNueva = cantidadVendidaAnterior + diferencia;
      
      // ✅ VALIDACIÓN FINAL ANTES DE ACTUALIZAR
      if (cantidadVendidaNueva < 0) {
        throw new Error('No se puede reducir más la cantidad vendida');
      }
      
      if (cantidadVendidaNueva > productoActualizado.cantidad) {
        throw new Error(`La cantidad vendida (${cantidadVendidaNueva}) no puede exceder el stock total (${productoActualizado.cantidad})`);
      }
      
      // Actualizar campos
      productoActualizado.cantidadVendida = cantidadVendidaNueva;
      productoActualizado.cantidadRestante = productoActualizado.cantidad - cantidadVendidaNueva;
      
      // ✅ VALIDACIÓN DE CONSISTENCIA
      if (productoActualizado.cantidadRestante < 0) {
        productoActualizado.cantidadRestante = 0;
        console.warn('⚠️ Ajustando cantidadRestante a 0 para evitar valores negativos');
      }
      
      console.log('🔄 Stock actualizado correctamente:', {
        productoId: productoId,
        nombre: productoActualizado.nombre,
        diferencia: diferencia,
        cantidadTotal: productoActualizado.cantidad,
        cantidadVendidaAnterior: cantidadVendidaAnterior,
        cantidadVendidaNueva: cantidadVendidaNueva,
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
    
    // ✅ RETORNAR VENTA ACTUALIZADA CON POPULATE COMPLETO
    const ventaActualizada = await Venta.findById(ventaId)
      .populate({
        path: 'productos.productoId',
        select: 'nombre precio categoria stock cantidadRestante categoryId'
      });
    
    console.log('🔄 Retornando venta actualizada:', {
      ventaId: ventaActualizada._id,
      montoTotal: ventaActualizada.montoTotal,
      debe: ventaActualizada.debe,
      productos: ventaActualizada.productos.map(p => ({
        id: p.productoId._id,
        nombre: p.productoId.nombre,
        cantidad: p.cantidad,
        subtotal: p.subtotal
      }))
    });
    
    return ventaActualizada;
    
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

const agregarProductoAVenta = async (ventaId, productoId, cantidad, userId, userRole) => {
  try {
    console.log('🔍 Agregando producto a venta:', { ventaId, productoId, cantidad, userId });
    
    // Verificar permisos del usuario
    let user = await User.findOne({ clerkId: userId });
    if (!user) {
      user = await User.findOne({ clerk_id: userId });
    }
    if (!user) {
      throw new Error('Usuario no encontrado en la base de datos');
    }
    
    console.log('✅ Usuario encontrado:', { id: user._id, role: user.role, email: user.email });
    
    // Buscar la venta
    const venta = await Venta.findById(ventaId);
    if (!venta) {
      throw new Error('Venta no encontrada');
    }
    
    // Verificar permisos
    if (user.role === 'user' && venta.userId.toString() !== user._id.toString()) {
      throw new Error('No tienes permisos para modificar esta venta');
    }
    
    // Buscar el producto
    const producto = await Producto.findById(productoId);
    if (!producto) {
      throw new Error('Producto no encontrado');
    }
    
    // Validar cantidad
    const cantidadNum = Number(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      throw new Error('La cantidad debe ser un número mayor a 0');
    }
    
    // Validar stock disponible
    const stockDisponible = producto.cantidadRestante || (producto.cantidad - (producto.cantidadVendida || 0));
    if (cantidadNum > stockDisponible) {
      throw new Error(`Stock insuficiente. Disponible: ${stockDisponible}, solicitado: ${cantidadNum}`);
    }
    
    // Verificar si el producto ya existe en la venta
    const productoExistente = venta.productos.find(p => p.productoId.toString() === productoId);
    
    if (productoExistente) {
      // Si existe, actualizar cantidad
      const nuevaCantidad = productoExistente.cantidad + cantidadNum;
      productoExistente.cantidad = nuevaCantidad;
      productoExistente.subtotal = nuevaCantidad * producto.precio;
      
      // Agregar al historial
      if (!productoExistente.historial) {
        productoExistente.historial = [];
      }
      productoExistente.historial.push({
        operacion: cantidadNum,
        fecha: new Date(),
        cantidadAnterior: productoExistente.cantidad - cantidadNum,
        cantidadNueva: nuevaCantidad
      });
    } else {
      // Si no existe, agregarlo
      const nuevoProducto = {
        productoId: productoId,
        cantidad: cantidadNum,
        precioUnitario: producto.precio,
        subtotal: cantidadNum * producto.precio,
        historial: [{
          operacion: cantidadNum,
          fecha: new Date(),
          cantidadAnterior: 0,
          cantidadNueva: cantidadNum
        }]
      };
      
      venta.productos.push(nuevoProducto);
    }
    
    // ✅ RECALCULAR MONTO TOTAL DE LA VENTA
    const montoTotalCalculado = venta.productos.reduce((sum, p) => {
      const subtotalNum = Number(p.subtotal);
      return sum + (isNaN(subtotalNum) ? 0 : subtotalNum);
    }, 0);
    
    // ✅ ACTUALIZAR EL CAMPO CORRECTO
    venta.montoTotal = montoTotalCalculado;
    venta.debe = venta.montoTotal - (venta.cantidadPagada || 0);
    
    // Actualizar stock del producto
    producto.cantidadVendida = (producto.cantidadVendida || 0) + cantidadNum;
    producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
    
    // Agregar al historial del producto
    if (!producto.historial) {
      producto.historial = [];
    }
    producto.historial.push({
      fecha: new Date(),
      tipo: 'agregado_venta',
      cantidad: cantidadNum,
      stockAnterior: producto.cantidadRestante + cantidadNum,
      stockNuevo: producto.cantidadRestante,
      observaciones: `Agregado a venta ${venta.numeroVenta} por ${user.firstName} ${user.lastName}`,
      usuario: user._id
    });
    
    // Guardar cambios
    await producto.save();
    await venta.save();
    
    // Retornar venta actualizada con populate
    const ventaActualizada = await Venta.findById(ventaId)
      .populate({
        path: 'productos.productoId',
        select: 'nombre precio categoria stock cantidadRestante categoryId'
      });
    
    console.log('✅ Producto agregado exitosamente a la venta');
    return ventaActualizada;
    
  } catch (error) {
    console.error('❌ Error en agregarProductoAVenta:', error);
    throw new Error('Error al agregar producto a la venta: ' + error.message);
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
  getTotalVentas,
  agregarProductoAVenta
};
