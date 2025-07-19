const express = require('express');
const router = express.Router();

const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const User = require('../models/User');
const Cobro = require('../models/Cobro');
const { authenticate, requireUser, canModifyAllVentas } = require('../middleware/authenticate');
const { validateVentaAssignment, validateVentaCompletion } = require('../middleware/ventaPermissions');
const Devolucion = require('../models/Devolucion');
const ventaService = require('../services/ventaService');

// Ruta de prueba para verificar que el router funciona
router.get('/test', (req, res) => {
  res.json({ message: 'La ruta de prueba está funcionando' });
});

// ===== RUTAS ESPECÍFICAS =====

// Helper function to process sales with creator info
async function processVentasWithUserInfo(ventas) {
  if (!Array.isArray(ventas)) {
    console.warn('processVentasWithUserInfo received non-array:', ventas);
    return [];
  }

  // Get all unique user IDs (creators and owners)
  const userIds = [...new Set(ventas.reduce((acc, venta) => {
    if (venta?.creatorId) acc.push(venta.creatorId);
    if (venta?.userId) acc.push(venta.userId);
    return acc;
  }, []))];

  if (userIds.length === 0) {
    console.warn('No valid user IDs found in ventas');
    return ventas;
  }

  // Get all users' information
  const users = await User.find({ 
    clerk_id: { $in: userIds } 
  }).select('clerk_id email nombre_negocio role');

  // Create a map of users by clerk_id for quick lookup
  const userMap = users.reduce((acc, user) => {
    if (user && user.clerk_id) {
      acc[user.clerk_id] = user;
    }
    return acc;
  }, {});
  // Get all unique venta IDs to fetch cobros
  const ventaIds = ventas.map(venta => venta._id).filter(Boolean);

  // Get all cobros for these ventas
  const cobros = await Cobro.find({ 
    ventasId: { $in: ventaIds } 
  }).select('ventasId yape efectivo gastosImprevistos fechaPago montoPagado');

  // Create a map of cobros by venta ID
  const cobrosMap = cobros.reduce((acc, cobro) => {
    cobro.ventasId.forEach(ventaId => {
      if (!acc[ventaId]) acc[ventaId] = [];
      acc[ventaId].push({
        yape: cobro.yape || 0,
        efectivo: cobro.efectivo || 0,
        gastosImprevistos: cobro.gastosImprevistos || 0,
        fechaPago: cobro.fechaPago,
        montoPagado: cobro.montoPagado
      });
    });
    return acc;
  }, {});

  // Process ventas to include complete information
  return ventas.map(venta => {
    if (!venta) return null;
    
    const creator = venta.creatorId ? userMap[venta.creatorId] : null;
    const owner = venta.userId ? userMap[venta.userId] : null;
    const ventaCobros = cobrosMap[venta._id] || [];
    
    // Calculate totals from cobros
    const totalYape = ventaCobros.reduce((sum, cobro) => sum + cobro.yape, 0);
    const totalEfectivo = ventaCobros.reduce((sum, cobro) => sum + cobro.efectivo, 0);
    const totalGastosImprevistos = ventaCobros.reduce((sum, cobro) => sum + cobro.gastosImprevistos, 0);
    
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
      } : null,
      cobros_detalle: {
        yape: totalYape,
        efectivo: totalEfectivo,
        gastosImprevistos: totalGastosImprevistos,
        historial: ventaCobros
      }
    };
  }).filter(Boolean);
}

// Ruta para obtener todos los productos
router.get('/productos', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    const productos = await Producto.find({ userId });
    console.log(`Productos encontrados para el usuario ${userId}:`, productos);
    res.json(productos);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ message: 'Error al obtener productos' });
  }
});

// ===== FUNCIONES DE SERVICIO =====

// Función para obtener ventas con todos los datos necesarios
async function getVentasService(userId, userRole) {
  let query = {};
    // Si no es admin, solo ver sus propias ventas
  if (!canModifyAllVentas(userRole)) {
    query.userId = userId;
  }    const ventas = await Venta.find(query)
      .populate({
        path: 'productos.productoId',
        select: 'nombre precio cantidadRestante categoryId',
        populate: {
          path: 'categoryId',
          select: 'nombre'
        }
      })
      .sort({ fechadeVenta: -1 });

  return await processVentasWithUserInfo(ventas);
}

// Función para crear venta
async function createVentaService(ventaData) {
  console.log('Datos recibidos en createVentaService:', ventaData);
  const nuevaVenta = new Venta(ventaData);
  await nuevaVenta.save();
  // Actualizar stock de productos
  for (const productoVenta of ventaData.productos) {
    const producto = await Producto.findById(productoVenta.productoId);
    if (producto) {
      producto.cantidadVendida += productoVenta.cantidad;
      producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
      await producto.save();
    }
  }const ventaCompleta = await Venta.findById(nuevaVenta._id)
    .populate({
      path: 'productos.productoId',
      select: 'nombre precio cantidadRestante categoryId',
      populate: {
        path: 'categoryId',
        select: 'nombre'
      }
    });
  
  // Procesar con información de usuario
  const [ventaConInfo] = await processVentasWithUserInfo([ventaCompleta]);
  return ventaConInfo;
}


// Función para eliminar venta
async function deleteVentaService(id, userId) {
  // Verificar si la venta existe y pertenece al usuario
  const venta = await Venta.findOne({ _id: id, userId });
  if (!venta) return false;

  // Verificar si tiene devoluciones asociadas
  const tieneDevolucion = await Devolucion.findOne({ ventaId: id });
  if (tieneDevolucion) {
    throw new Error('No se puede eliminar una venta que tiene devoluciones asociadas');
  }

  // Actualizar el stock de todos los productos
  for (const productoVenta of venta.productos) {
    const producto = await Producto.findById(productoVenta.productoId);
    if (producto) {
      // Asegurar que cantidadVendida no sea negativa
      const nuevaCantidadVendida = Math.max(0, producto.cantidadVendida - productoVenta.cantidad);
      producto.cantidadVendida = nuevaCantidadVendida;
      producto.cantidadRestante = producto.cantidad - producto.cantidadVendida;
      
      console.log('🔄 Actualizando stock al eliminar venta:', {
        productoId: producto._id,
        nombre: producto.nombre,
        cantidadVendidaAnterior: producto.cantidadVendida + productoVenta.cantidad,
        cantidadVendidaNueva: nuevaCantidadVendida,
        cantidadRestante: producto.cantidadRestante
      });
      
      await producto.save();
    }
  }

  // Eliminar la venta
  await Venta.findByIdAndDelete(id);
  return true;
}

// ===== RUTAS CRUD PRINCIPALES =====

// Obtener ventas (filtradas por rol)
router.get('/', authenticate, requireUser, async (req, res) => {
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);    // Construir query basado en el rol
    let query = {};
    if (!canModifyAllVentas(userRole)) {
      query.userId = userId;
    }

    // Obtener ventas y total
    const [ventas, totalVentas] = await Promise.all([      Venta.find(query)
        .populate({
          path: 'productos.productoId',
          select: 'nombre precio cantidadRestante categoryId',
          populate: {
            path: 'categoryId',
            select: 'nombre'
          }
        })
        .sort({ fechadeVenta: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Venta.countDocuments(query)
    ]);

    // Procesar ventas con información de usuario
    const ventasConInfo = await processVentasWithUserInfo(ventas);

    // Responder con todas las ventas
    res.json({
      ventas: ventasConInfo,
      totalVentas,
      totalPages: Math.ceil(totalVentas / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({ message: 'Error al obtener ventas' });
  }
});


// Ruta para crear una nueva venta 
router.post('/', authenticate, requireUser, validateVentaAssignment, async (req, res) => {
  const { productos, montoTotal, estadoPago, cantidadPagada, fechadeVenta, targetUserId } = req.body;
  const creatorId = req.user.clerk_id; // Usar el ID del usuario autenticado
  let userId = creatorId;

  try {
    // Validar que hay productos
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ message: 'Debes proporcionar al menos un producto' });
    }

    // Validar stock de todos los productos
    for (const producto of productos) {
      const productoDb = await Producto.findById(producto.productoId);
      if (!productoDb) {
        return res.status(400).json({ message: `Producto ${producto.productoId} no encontrado` });
      }
      if (producto.cantidad > productoDb.cantidadRestante) {
        return res.status(400).json({ message: `No hay suficiente stock de ${productoDb.nombre}. Solo hay ${productoDb.cantidadRestante} unidades disponibles.` });
      }
    }

    // Validar estado de pago
    if (estadoPago === 'Parcial' && cantidadPagada <= 0) {
      return res.status(400).json({ message: 'La cantidad pagada debe ser mayor a cero cuando el estado es Parcial.' });
    }

    if (estadoPago === 'Pendiente' && cantidadPagada !== 0) {
      return res.status(400).json({ message: 'La cantidad pagada debe ser cero cuando el estado es Pendiente.' });
    }

    if (estadoPago === 'Pagado' && cantidadPagada !== montoTotal) {
      return res.status(400).json({ message: 'La cantidad pagada debe ser igual al monto total cuando el estado es Pagado.' });
    }

    // Validar que el usuario tenga permisos si intenta crear una venta para otro usuario
    if (targetUserId && targetUserId !== creatorId) {
      // Obtener el rol del usuario objetivo
      const targetUser = await User.findOne({ clerk_id: targetUserId });
      if (!targetUser) {
        return res.status(404).json({ message: 'Usuario objetivo no encontrado' });
      }

      // Validar permisos según el rol del creador
      if (req.user.role === 'super_admin') {
        // Super admin puede asignar a cualquiera
        userId = targetUserId;
      } else if (req.user.role === 'admin') {
        // Admin puede asignar a users, otros admins, pero no a super_admin
        if (targetUser.role === 'super_admin') {
          return res.status(403).json({ 
            message: 'Los administradores no pueden crear ventas para super administradores',
            target_role: targetUser.role,
            your_role: req.user.role
          });
        }
        userId = targetUserId;
      } else {
        // Users no pueden crear ventas para otros
        return res.status(403).json({ 
          message: 'No tienes permisos para crear ventas para otros usuarios',
          your_role: req.user.role
        });
      }
    } else {
      // Si no se especifica targetUserId, la venta se asigna al creador
      userId = creatorId;
    }
    
    const ventaData = {
      creatorId,
      userId,
      productos,
      montoTotal,
      estadoPago,
      cantidadPagada,
      fechadeVenta: fechadeVenta ? new Date(fechadeVenta) : new Date()
    };

    const nuevaVenta = await createVentaService(ventaData);

    // Obtener información del usuario y creador
    const [targetUserInfo, creatorInfo] = await Promise.all([
      User.findOne({ clerk_id: userId }).select('email nombre_negocio role'),
      User.findOne({ clerk_id: creatorId }).select('email nombre_negocio role')
    ]);    // Preparar la respuesta con toda la información necesaria
    const ventaResponse = {
      ...(nuevaVenta.toObject ? nuevaVenta.toObject() : nuevaVenta),
      userInfo: {
        email: targetUserInfo?.email,
        nombre_negocio: targetUserInfo?.nombre_negocio,
        role: targetUserInfo?.role
      },
      creatorInfo: {
        email: creatorInfo?.email,
        nombre_negocio: creatorInfo?.nombre_negocio,
        role: creatorInfo?.role
      }
    };

    res.status(201).json({ 
      message: 'Venta creada exitosamente',
      venta: ventaResponse
    });
  } catch (error) {
    console.error('Error al agregar la venta:', error.message);
    res.status(500).json({ message: `Error al agregar la venta: ${error.message}` });
  }
});





// Ruta para eliminar una venta
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  
  try {
    // Buscar la venta y popular la información del creador
    const venta = await Venta.findById(id).populate({
      path: 'creatorId',
      select: 'role'
    });

    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    // Verificar permisos según el rol
    if (userRole === 'super_admin') {
      // Super admin puede eliminar cualquier venta
    } else if (userRole === 'admin') {
      // Admin solo puede eliminar sus propias ventas y no las de super_admin
      if (venta.creatorId !== userId || venta.creator_info?.role === 'super_admin') {
        return res.status(403).json({ 
          message: 'No tienes permisos para eliminar esta venta' 
        });
      }
    } else {
      return res.status(403).json({ 
        message: 'No tienes permisos para eliminar ventas' 
      });
    }

    const resultado = await deleteVentaService(id, venta.userId);
    
    if (!resultado) {
      return res.status(404).json({ 
        message: 'Error al eliminar la venta' 
      });
    }
    
    res.status(200).json({ message: 'Venta eliminada exitosamente' });
  } catch (error) {
    console.error('Error al eliminar la venta:', error);
    if (error.message.includes('devoluciones asociadas')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Error al eliminar la venta.' });
  }
});

// Las rutas de devoluciones se han movido a devolucionRoutes.js

// Ruta para actualizar cantidad de un producto en una venta con historial
router.put('/:ventaId/productos/:productoId/cantidad', authenticate, async (req, res) => {
  const { ventaId, productoId } = req.params;
  const { nuevaCantidad, operacion, tipoOperacion = 'manual', motivo = '' } = req.body;
  const userId = req.user.clerk_id;
  
  // Usar nuevaCantidad si está disponible, sino usar operacion para compatibilidad
  const cantidadFinal = nuevaCantidad !== undefined ? Number(nuevaCantidad) : Number(operacion);
  
  console.log('🔍 Debug - Ruta de cantidad recibida:', {
    ventaId,
    productoId,
    nuevaCantidad,
    operacion,
    cantidadFinal,
    tipoOperacion,
    motivo,
    userId,
    body: req.body,
    params: req.params,
    isNaN_cantidadFinal: isNaN(cantidadFinal)
  });
  
  // Validar que cantidadFinal sea un número válido
  if (isNaN(cantidadFinal) || cantidadFinal < 0) {
    return res.status(400).json({
      error: 'Cantidad inválida',
      mensaje: `La cantidad debe ser un número válido mayor o igual a 0. Recibido: ${cantidadFinal}`
    });
  }
  
  try {
    const ventaActualizada = await ventaService.updateProductQuantityInVenta(
      ventaId, 
      productoId, 
      cantidadFinal, 
      userId,
      tipoOperacion,
      motivo
    );
    
    console.log('✅ Venta actualizada exitosamente:', ventaActualizada._id);
    
    res.json({
      message: 'Cantidad actualizada exitosamente',
      venta: ventaActualizada,
      tipoOperacion,
      motivo: motivo || `Cambio ${tipoOperacion}`
    });
  } catch (error) {
    console.error('❌ Error al actualizar cantidad:', error);
    res.status(400).json({ message: error.message });
  }
});

// ===== FUNCIONES PARA REPORTES =====

// Ruta para obtener resumen de ventas por colaborador
router.get('/reportes/resumen', authenticate, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const ventas = await Venta.find({ userId })
      .populate('colaboradorId', 'nombre')
      .populate({
        path: 'productos.productoId',
        select: 'nombre precio cantidadRestante categoryId',
        populate: {
          path: 'categoryId',
          select: 'nombre'
        }
      });
    
    const resumen = ventas.reduce((acc, venta) => {
      const nombre = venta.colaboradorId?.nombre || 'Sin colaborador';
      const estado = venta.completionStatus || 'sin_finalizar';
      
      if (!acc[nombre]) {
        acc[nombre] = {
          total: 0,
          estados: {
            pending: 0,
            approved: 0,
            rejected: 0,
            sin_finalizar: 0
          }
        };
      }
      
      acc[nombre].total += venta.montoTotal;
      acc[nombre].estados[estado]++;
      
      return acc;
    }, {});

    res.json({ resumen });
  } catch (error) {
    console.error('Error al obtener el resumen de ventas:', error);
    res.status(500).json({ message: 'Error al obtener el resumen de ventas.' });
  }
});

// Ruta para obtener informe de ventas por colaborador
router.get('/reportes/ventas', authenticate, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const ventas = await Venta.find({ userId })
      .populate('colaboradorId', 'nombre') // Poblar colaborador con su nombre
      .populate('productoId', 'nombre precio'); // Poblar producto con nombre y precio

    const ventasPorColaborador = ventas.reduce((acc, venta) => {
      if (!venta.colaboradorId || !venta.colaboradorId._id) return acc;
      
      const colaboradorId = venta.colaboradorId._id.toString();
      
      if (!acc[colaboradorId]) {
        acc[colaboradorId] = {
          nombre: venta.colaboradorId.nombre,
          totalVentas: 0,
          estadoPago: {
            pendiente: 0,
            pagado: 0,
            parcial: 0
          }
        };
      }
      
      acc[colaboradorId].totalVentas += venta.montoTotal;
      acc[colaboradorId].estadoPago[venta.estadoPago.toLowerCase()] += venta.montoTotal;

      return acc;
    }, {});

    res.json(ventasPorColaborador);
  } catch (error) {
    console.error('Error al obtener el informe de ventas:', error);
    res.status(500).json({ message: 'Error al obtener el informe de ventas', error: error.message });
  }
});

// Ruta para obtener ventas finalizadas
router.get('/finalizadas', authenticate, async (req, res) => {
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  
  try {
    // Obtener parámetros de paginación
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    let query = { isCompleted: true };
    if (!['super_admin', 'admin'].includes(userRole)) {
      query.userId = userId;
    }

    // Obtener el total de ventas finalizadas para paginación
    const totalVentas = await Venta.countDocuments(query);

    // Obtener las ventas con límite y offset
    const ventas = await Venta.find(query)
      .populate({
        path: 'productos.productoId',
        select: 'nombre precio cantidadRestante categoryId',
        populate: {
          path: 'categoryId',
          select: 'nombre'
        }
      })
      .sort({ completionDate: -1 })
      .limit(limit)
      .skip(offset);    const ventasConInfo = await processVentasWithUserInfo(ventas);

    // Debug logs
    console.log('Ventas finalizadas - Backend:', {
      limit,
      offset,
      totalVentas,
      ventasEncontradas: ventas.length,
      hasMore: offset + limit < totalVentas,
      query: JSON.stringify(query)
    });

    res.json({
      ventas: ventasConInfo,
      totalVentas,
      hasMore: offset + limit < totalVentas,
      currentOffset: offset,
      currentLimit: limit
    });
  } catch (error) {
    console.error('Error al obtener ventas finalizadas:', error);
    res.status(500).json({ message: 'Error al obtener ventas finalizadas' });
  }
});

// Ruta para actualizar el estado de finalización de una venta
router.post('/:id/completion', authenticate, requireUser, validateVentaCompletion, async (req, res) => {
  try {
    const { id } = req.params;
    const { completionStatus, completionNotes } = req.body;
    const userId = req.user.clerk_id;

    console.log('Recibida solicitud de completion:', {
      ventaId: id,
      status: completionStatus,
      notes: completionNotes,
      userId
    });

    // Buscar la venta
    const venta = await Venta.findById(id);
    if (!venta) {
      console.log('Venta no encontrada:', id);
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    // Validar el estado
    if (!['approved', 'rejected', 'pending'].includes(completionStatus)) {
      console.log('Estado inválido:', completionStatus);
      return res.status(400).json({ 
        message: 'Estado de completado inválido',
        received: completionStatus,
        allowed: ['approved', 'rejected', 'pending']
      });
    }

    try {
      // Actualizar la venta usando updateOne
      const updateResult = await Venta.updateOne(
        { _id: id },
        {
          $set: {
            completionStatus,
            isCompleted: completionStatus === 'approved',
            completionDate: new Date(),
            completionNotes,
            reviewerId: userId
          }
        }
      );

      console.log('Resultado de la actualización:', updateResult);

      if (updateResult.matchedCount === 0) {
        return res.status(404).json({ message: 'Venta no encontrada' });
      }

      if (updateResult.modifiedCount === 0) {
        return res.status(400).json({ message: 'No se pudo actualizar la venta' });
      }

      // Obtener la venta actualizada
      const ventaActualizada = await Venta.findById(id);
      if (!ventaActualizada) {
        return res.status(404).json({ message: 'Error al recuperar la venta actualizada' });
      }

      // Obtener información del creador y revisor
      const [creator, reviewer] = await Promise.all([
        User.findOne({ clerk_id: venta.creatorId }).select('email nombre_negocio role'),
        User.findOne({ clerk_id: userId }).select('email nombre_negocio role')
      ]);

      // Preparar la respuesta
      const response = {
        ...ventaActualizada.toObject(),
        creator_info: creator ? {
          nombre_negocio: creator.nombre_negocio || 'No especificado',
          email: creator.email,
          role: creator.role
        } : null,
        reviewer_info: reviewer ? {
          nombre_negocio: reviewer.nombre_negocio || 'No especificado',
          email: reviewer.email,
          role: reviewer.role
        } : null
      };

      res.json({
        message: `Venta ${completionStatus === 'approved' ? 'aprobada' : 
                  completionStatus === 'rejected' ? 'rechazada' : 'marcada como pendiente'} exitosamente`,
        venta: response
      });

    } catch (updateError) {
      console.error('Error al actualizar la venta:', updateError);
      return res.status(500).json({ 
        message: 'Error al actualizar la venta',
        error: updateError.message
      });
    }
  } catch (error) {
    console.error('Error en la ruta de completion:', error);
    res.status(500).json({ 
      message: 'Error al procesar la solicitud',
      error: error.message
    });
  }
});

// Ruta para revertir una venta finalizada (quitar de finalizadas)
router.post('/:id/revert', authenticate, requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.clerk_id;
    const userRole = req.user.role;

    console.log('Recibida solicitud de reversión:', {
      ventaId: id,
      userId,
      userRole
    });

    // Solo admins y super_admins pueden revertir ventas
    if (!['admin', 'super_admin'].includes(userRole)) {
      return res.status(403).json({ 
        message: 'No tienes permisos para revertir ventas finalizadas' 
      });
    }

    // Buscar la venta
    const venta = await Venta.findById(id);
    if (!venta) {
      console.log('Venta no encontrada:', id);
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    // Verificar que la venta esté finalizada
    if (!venta.isCompleted) {
      return res.status(400).json({ 
        message: 'La venta no está finalizada, no se puede revertir' 
      });
    }

    // Los admins no pueden revertir ventas de super_admins
    if (userRole === 'admin') {
      // Obtener información del creador de la venta
      const creator = await User.findOne({ clerk_id: venta.creatorId });
      if (creator && creator.role === 'super_admin') {
        return res.status(403).json({ 
          message: 'Los administradores no pueden revertir ventas de super administradores' 
        });
      }
    }

    try {
      // Revertir la venta a estado activo
      const updateResult = await Venta.updateOne(
        { _id: id },
        {
          $set: {
            completionStatus: 'pending',
            isCompleted: false,
            completionDate: null,
            completionNotes: `Venta revertida por ${userRole} el ${new Date().toISOString()}`,
            reviewerId: userId
          }
        }
      );

      console.log('Resultado de la reversión:', updateResult);

      if (updateResult.matchedCount === 0) {
        return res.status(404).json({ message: 'Venta no encontrada' });
      }

      if (updateResult.modifiedCount === 0) {
        console.log('No se pudo actualizar la venta');
        return res.status(500).json({ message: 'No se pudo revertir la venta' });
      }

      // Obtener la venta actualizada con toda la información
      const ventaActualizada = await Venta.findById(id)
        .populate({
          path: 'productos.productoId',
          select: 'nombre precio cantidadRestante categoryId',
          populate: {
            path: 'categoryId',
            select: 'nombre'
          }
        });

      console.log('Venta revertida exitosamente:', ventaActualizada);

      res.json({
        message: 'Venta revertida exitosamente',
        venta: ventaActualizada
      });

    } catch (updateError) {
      console.error('Error al actualizar venta:', updateError);
      return res.status(500).json({ message: 'Error interno al revertir la venta' });
    }

  } catch (error) {
    console.error('Error al revertir venta:', error);
    res.status(500).json({ 
      message: 'Error interno del servidor al revertir la venta',
      error: error.message 
    });
  }
});

// ===== RUTAS PARA MODIFICAR PRODUCTOS EN VENTAS =====

// Agregar producto a una venta existente
router.post('/:id/productos', authenticate, requireUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { productoId, cantidad } = req.body;
    const userId = req.user.clerk_id;
    const userRole = req.user.role;

    // Validaciones básicas
    if (!productoId || !cantidad || cantidad <= 0) {
      return res.status(400).json({
        message: 'Producto ID y cantidad son requeridos, y la cantidad debe ser mayor a 0'
      });
    }

    // Usar el servicio para agregar el producto
    const ventaActualizada = await ventaService.agregarProductoAVenta(id, productoId, cantidad, userId, userRole);

    res.json({
      message: 'Producto agregado exitosamente',
      venta: ventaActualizada
    });
  } catch (error) {
    console.error('Error al agregar producto a venta:', error);
    res.status(error.status || 500).json({
      message: error.message || 'Error interno del servidor'
    });
  }
});

// Actualizar cantidad de un producto en una venta
router.put('/:id/productos/:productoId', authenticate, requireUser, async (req, res) => {
  try {
    const { id, productoId } = req.params;
    const { cantidad } = req.body;
    const userId = req.user.clerk_id;
    const userRole = req.user.role;

    // Validaciones básicas
    if (!cantidad || cantidad <= 0) {
      return res.status(400).json({
        message: 'La cantidad debe ser mayor a 0'
      });
    }

    // Usar el servicio para actualizar la cantidad
    const ventaActualizada = await ventaService.actualizarCantidadProducto(id, productoId, cantidad, userId, userRole);

    res.json({
      message: 'Cantidad actualizada exitosamente',
      venta: ventaActualizada
    });
  } catch (error) {
    console.error('Error al actualizar cantidad de producto:', error);
    res.status(error.status || 500).json({
      message: error.message || 'Error interno del servidor'
    });
  }
});

// Eliminar producto de una venta
router.delete('/:id/productos/:productoId', authenticate, requireUser, async (req, res) => {
  try {
    const { id, productoId } = req.params;
    const userId = req.user.clerk_id;
    const userRole = req.user.role;

    // Usar el servicio para eliminar el producto
    const ventaActualizada = await ventaService.eliminarProductoDeVenta(id, productoId, userId, userRole);

    res.json({
      message: 'Producto eliminado exitosamente',
      venta: ventaActualizada
    });
  } catch (error) {
    console.error('Error al eliminar producto de venta:', error);
    res.status(error.status || 500).json({
      message: error.message || 'Error interno del servidor'
    });
  }
});

module.exports = router;