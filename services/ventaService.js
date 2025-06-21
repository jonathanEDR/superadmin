const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const Devolucion = require('../models/Devolucion');
const User = require('../models/User');
const { canModifyAllVentas } = require('../middleware/authenticate');

/**
 * Obtiene todas las ventas para un usuario específico
 * @param {string} userId - ID del usuario
 * @returns {Promise<Array>} Lista de ventas
 */
async function getVentas(userId) {
  const ventas = await Venta.find({ userId })
    .populate('productos.productoId', 'nombre precio');
  
  // Obtener información de usuarios
  const userIds = ventas.reduce((acc, venta) => {
    if (venta.creatorId) acc.push(venta.creatorId);
    if (venta.userId) acc.push(venta.userId);
    return [...new Set(acc)];
  }, []);

  const users = await User.find({ 
    clerk_id: { $in: userIds } 
  }).select('clerk_id email nombre_negocio role');

  const userMap = users.reduce((acc, user) => {
    if (user && user.clerk_id) {
      acc[user.clerk_id] = user;
    }
    return acc;
  }, {});

  return ventas.map(venta => {
    const creator = venta.creatorId ? userMap[venta.creatorId] : null;
    const owner = venta.userId ? userMap[venta.userId] : null;

    return {
      ...venta.toObject(),
      creator_info: creator ? {
        nombre_negocio: creator.nombre_negocio || 'No especificado',
        email: creator.email,
        role: creator.role || 'user',
        id: venta.creatorId
      } : null,
      user_info: owner ? {
        nombre_negocio: owner.nombre_negocio || 'No especificado',
        email: owner.email,
        role: owner.role || 'user',
        id: venta.userId
      } : null
    };
  });
}

/**
 * Crea una nueva venta
 * @param {Object} ventaData - Datos de la venta
 * @returns {Promise<Object>} Venta creada
 */

async function createVenta(ventaData) {
  const {
    creatorId,
    userId,
    productos,
    montoTotal,
    estadoPago,
    cantidadPagada,
    fechadeVenta
  } = ventaData;

  // Validar productos
  for (const producto of productos) {
    const productoDb = await Producto.findById(producto.productoId);
    if (!productoDb) {
      throw new Error(`Producto ${producto.productoId} no encontrado`);
    }
    if (producto.cantidad > productoDb.cantidadRestante) {
      throw new Error(`Stock insuficiente para ${productoDb.nombre}. Disponible: ${productoDb.cantidadRestante}`);
    }
  }

  // Crear la venta
  const nuevaVenta = new Venta({
    creatorId,
    userId,
    productos,
    montoTotal,
    estadoPago,
    cantidadPagada,
    fechadeVenta: fechadeVenta || new Date()
  });

  const ventaGuardada = await nuevaVenta.save();

  // Actualizar stock de productos
  for (const producto of productos) {
    await Producto.findByIdAndUpdate(
      producto.productoId,
      {
        $inc: {
          cantidadVendida: producto.cantidad,
          cantidadRestante: -producto.cantidad
        }
      }
    );
  }

  // Retornar la venta con información completa
  const ventaCompleta = await Venta.findById(ventaGuardada._id)
    .populate('productos.productoId', 'nombre precio');

  const [ventaConInfo] = await processUserInfo([ventaCompleta]);
  return ventaConInfo;
}

/**
 * Actualiza una venta existente
 * @param {string} id - ID de la venta
 * @param {Object} datosActualizados - Datos a actualizar
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} Venta actualizada
 */
async function updateVenta(id, datosActualizados, userId) {
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return null;

  const { cantidad, estadoPago, cantidadPagada, fechadeVenta } = datosActualizados;

  // Verificar si tiene devoluciones antes de actualizar cualquier dato
  const tieneDevoluciones = await Devolucion.findOne({ ventaId: id });
  if (tieneDevoluciones) {
    throw new Error('No se puede editar una venta que tiene devoluciones asociadas');
  }

  // Actualizar fechadeVenta si viene
  if (fechadeVenta) {
    venta.fechadeVenta = convertirFechaALocalUtc(fechadeVenta);
    venta.markModified('fechadeVenta');
  }

  // Buscar el producto relacionado
  const producto = await Producto.findById(venta.productoId);
  if (!producto) throw new Error('Producto relacionado no encontrado');

  // Actualizar cantidad si es necesario
  if (cantidad !== undefined && cantidad !== venta.cantidad) {
    const nuevaCantidadVendida = producto.cantidadVendida - venta.cantidad + cantidad;

    if (nuevaCantidadVendida < 0) {
      throw new Error('La cantidad vendida no puede ser negativa.');
    }

    if (nuevaCantidadVendida > producto.cantidad) {
      throw new Error(`No hay suficiente stock. Solo hay ${producto.cantidad - producto.cantidadVendida + venta.cantidad} unidades disponibles.`);
    }

    // Actualizar producto
    producto.cantidadVendida = nuevaCantidadVendida;
    producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
    await producto.save();

    // Actualizar venta
    venta.cantidad = cantidad;
    venta.montoTotal = producto.precio * cantidad;
  }

  // Actualizar estado de pago y cantidad pagada
  if (estadoPago) venta.estadoPago = estadoPago;
  if (cantidadPagada !== undefined) venta.cantidadPagada = cantidadPagada;
  await venta.save();

  const ventaActualizada = await Venta.findById(id)
    .populate('productoId', 'nombre precio');
  
  const [ventaConInfo] = await processUserInfo([ventaActualizada]);
  return ventaConInfo;
}

/**
 * Valida que una fecha sea válida y esté en un rango razonable
 * @param {string|Date} fecha - La fecha a validar
 * @returns {boolean} true si la fecha es válida, false en caso contrario
 */
function validarFecha(fecha) {
  const fechaDate = new Date(fecha);
  if (!(fechaDate instanceof Date) || isNaN(fechaDate)) {
    return false;
  }

  // Validar que la fecha no esté muy en el pasado o futuro
  const ahora = new Date();
  const unAnioAntes = new Date();
  unAnioAntes.setFullYear(ahora.getFullYear() - 1);
  const unAnioDespues = new Date();
  unAnioDespues.setFullYear(ahora.getFullYear() + 1);

  return fechaDate >= unAnioAntes && fechaDate <= unAnioDespues;
}


// Función updateVentaC eliminada ya que sus funcionalidades están incluidas en updateVenta


/**
 * Elimina una venta
 * @param {string} id - ID de la venta
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} Resultado de la operación
 */
async function deleteVenta(id, userId) {
  // Buscar la venta
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return false;

  // Verificar si tiene devoluciones
  const tieneDevoluciones = await Devolucion.findOne({ ventaId: id });
  if (tieneDevoluciones) {
    throw new Error('No se puede eliminar una venta que tiene devoluciones asociadas');
  }

  // Actualizar el producto
  const producto = await Producto.findById(venta.productoId);
  if (producto) {

    const nuevaCantidadVendida = producto.cantidadVendida - venta.cantidad;
    if (nuevaCantidadVendida < 0) {
      throw new Error('La cantidad vendida no puede ser negativa');
    }
    producto.cantidadVendida = nuevaCantidadVendida;
    producto.cantidadRestante = producto.cantidad - nuevaCantidadVendida;
    await producto.save();
  }

  // Eliminar la venta
  await Venta.findByIdAndDelete(id);
  return true;
}

// Funciones relacionadas con colaboradores eliminadas ya que ahora usamos el sistema de usuarios de Clerk

// Función para gestionar la devolución de una venta
async function registrarDevolucion(ventaId, productoId, cantidadDevuelta, motivo, userId) {
  // Verificar que la venta exista
  const venta = await Venta.findById(ventaId);
  if (!venta || venta.userId !== userId) {
    throw new Error("Venta no encontrada");
  }

  // Verificar que el producto esté relacionado con la venta
  const producto = await Producto.findById(productoId);
  if (!producto) {
    throw new Error("Producto no encontrado");
  }

  // Verificar que la cantidad a devolver no sea mayor a la vendida
  if (cantidadDevuelta > venta.cantidad) {
    throw new Error(`No se puede devolver más productos que los vendidos. Vendidos: ${venta.cantidad}`);
  }

  // Actualizar la venta
  venta.cantidadVendida -= cantidadDevuelta;
  venta.montoTotal -= (producto.precio * cantidadDevuelta);
  await venta.save();

  // Actualizar el inventario
  producto.cantidadRestante += cantidadDevuelta;
  await producto.save();

  // Registrar la devolución
  const montoDevolucion = producto.precio * cantidadDevuelta;
  const nuevaDevolucion = new Devolucion({
    ventaId,
    productoId,
    cantidadDevuelta,
    montoDevolucion,
    motivo,
    userId
  });

  await nuevaDevolucion.save();
  return nuevaDevolucion;
}


// Agregar nueva función para obtener datos del gráfico
async function getChartData(userId, userRole, range) {
  const startDate = getStartDate(range);
  
  let query = {};
  if (!canModifyAllVentas(userRole)) {
    query.userId = userId;
  }
  query.fechadeVenta = { $gte: startDate };

  const [ventas, devoluciones] = await Promise.all([
    Venta.find(query)
      .sort({ fechadeVenta: 1 })
      .populate('productoId', 'nombre precio'),
    
    Devolucion.find({
      ...query,
      createdAt: { $gte: startDate }
    })
      .populate('ventaId')
      .populate('productoId')
  ]);

  return {
    ventas,
    devoluciones
  };
}

// Modificar la función getVentas para soportar paginación
async function getVentas(userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  const [ventas, total] = await Promise.all([
    Venta.find({ userId })
      .sort({ fechadeVenta: -1 })
      .skip(skip)
      .limit(limit)
      .populate('colaboradorId', 'nombre')
      .populate('productoId', 'nombre precio'),
    Venta.countDocuments({ userId })
  ]);

  return {
    ventas,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
    totalRecords: total,
    itemsPerPage: limit
  };
}

async function getAllVentas(userId, userRole) {
  try {
    let query = {};
    if (!canModifyAllVentas(userRole)) {
      query.userId = userId;
    }    const ventas = await Venta.find(query)
      .sort({ fechadeVenta: -1 })
      .populate('productos.productoId', 'nombre precio');

    return await processUserInfo(ventas);
  } catch (error) {
    console.error('Error en getAllVentas:', error);
    throw error;
  }
}

// Helper function to process user info
async function processUserInfo(ventas) {
  if (!Array.isArray(ventas)) {
    console.warn('processUserInfo received non-array:', ventas);
    return [];
  }

  const userIds = [...new Set(ventas.reduce((acc, venta) => {
    if (venta?.creatorId) acc.push(venta.creatorId);
    if (venta?.userId) acc.push(venta.userId);
    return acc;
  }, []))];

  if (userIds.length === 0) {
    return ventas;
  }

  const users = await User.find({ 
    clerk_id: { $in: userIds } 
  }).select('clerk_id email nombre_negocio role');

  const userMap = users.reduce((acc, user) => {
    if (user?.clerk_id) {
      acc[user.clerk_id] = user;
    }
    return acc;
  }, {});

  return ventas.map(venta => {
    if (!venta) return null;
    
    const creator = venta.creatorId ? userMap[venta.creatorId] : null;
    const owner = venta.userId ? userMap[venta.userId] : null;

    return {
      ...venta.toObject(),
      creator_info: creator ? {
        nombre_negocio: creator.nombre_negocio || 'No especificado',
        email: creator.email,
        role: creator.role || 'user',
        id: venta.creatorId
      } : null,
      user_info: owner ? {
        nombre_negocio: owner.nombre_negocio || 'No especificado',
        email: owner.email,
        role: owner.role || 'user',
        id: venta.userId
      } : null
    };
  }).filter(Boolean);
}

/**
 * Actualiza el estado de finalización de una venta
 * @param {string} ventaId - ID de la venta
 * @param {Object} updateData - Datos de actualización
 * @param {string} userId - ID del usuario que actualiza
 * @returns {Promise<Object>} Venta actualizada con información de usuario
 */
async function updateVentaCompletion(ventaId, updateData, userId) {
  try {
    const { completionStatus, isCompleted, completionDate, completionNotes } = updateData;

    const venta = await Venta.findById(ventaId).populate('productos.productoId');
    if (!venta) {
      throw new Error('Venta no encontrada');
    }

    // Validar estado actual
    if (venta.isCompleted && venta.completionStatus === 'approved') {
      throw new Error('No se puede modificar una venta que ya ha sido aprobada');
    }

    // Para ventas rechazadas que se están reenviando
    if (venta.completionStatus === 'rejected' && completionStatus === 'pending') {
      venta.isCompleted = false;
    } else {
      // Para otros casos
      venta.isCompleted = completionStatus === 'approved';
    }

    // Actualizar campos de la venta
    venta.completionStatus = completionStatus;
    venta.completionDate = completionDate || new Date();
    venta.completionNotes = completionNotes || '';
    venta.updatedAt = new Date();
    venta.updatedBy = userId;

    const ventaGuardada = await venta.save();
    if (!ventaGuardada) {
      throw new Error('Error al guardar la venta');
    }

    // Procesar y retornar la venta con información de usuario
    const [ventaConInfo] = await processUserInfo([ventaGuardada]);
    return ventaConInfo;
  } catch (error) {
    console.error('Error en updateVentaCompletion:', error);
    throw new Error(`Error al actualizar estado de venta: ${error.message}`);
  }
}

module.exports = {
  getVentas,
  createVenta,
  updateVenta,
  updateVentaCompletion,
  validarFecha
};