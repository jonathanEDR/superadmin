const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const Devolucion = require('../models/Devolucion');
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');

// Obtener todas las devoluciones
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  const { page = 1, limit = 10 } = req.query;
  
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Solo filtrar por userId si el usuario es un usuario normal
    let query = {};
    if (userRole === 'user') {
      query.userId = userId;
    }    const [devoluciones, totalDevoluciones] = await Promise.all([
      Devolucion.find(query)
        .populate('productoId', 'nombre precio')
        .populate('ventaId', 'isCompleted')
        .lean()
        .sort({ fechaDevolucion: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Devolucion.countDocuments(query)
    ]);// Formatear los datos para la respuesta
    const devolucionesFormateadas = devoluciones.map(dev => ({
      _id: dev._id,
      fechaDevolucion: dev.fechaDevolucion,
      colaborador: {
        nombre: dev.creatorName,
        email: dev.creatorEmail
      },
      producto: dev.productoId ? dev.productoId.nombre : 'N/A',
      cantidad: dev.cantidadDevuelta,
      monto: dev.montoDevolucion || 0,
      motivo: dev.motivo,
      estado: dev.estado,
      ventaFinalizada: dev.ventaId ? dev.ventaId.isCompleted : false,
      ventaId: dev.ventaId?._id || dev.ventaId // <-- Campo necesario para el frontend
    }));    // Log para debug
    console.log('Devoluciones formateadas:', devolucionesFormateadas.map(d => ({
      id: d._id,
      producto: d.producto,
      ventaFinalizada: d.ventaFinalizada,
      ventaId: devoluciones.find(orig => orig._id === d._id)?.ventaId?._id,
      ventaIsCompleted: devoluciones.find(orig => orig._id === d._id)?.ventaId?.isCompleted
    })));res.json({
      devoluciones: devolucionesFormateadas,
      totalDevoluciones,
      totalPages: Math.ceil(totalDevoluciones / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error al obtener devoluciones:', error);
    res.status(500).json({ message: 'Error al obtener devoluciones' });
  }
});

// Crear una nueva devolución
router.post('/', authenticate, async (req, res) => {
  const { ventaId, productos, motivo, fechaDevolucion } = req.body;
  const userId = req.user.clerk_id;

  // Log para debugging
  console.log('Datos recibidos para devolución:', {
    ventaId,
    productos: productos?.length,
    motivo: motivo?.substring(0, 50),
    fechaDevolucion,
    fechaDevolucionType: typeof fechaDevolucion
  });

  try {
    // Get user information
    const User = require('../models/User');
    const user = await User.findOne({ clerk_id: userId });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Validar el motivo
    if (!motivo || motivo.length < 1) {
      return res.status(400).json({ 
        message: 'El motivo es requerido' 
      });
    }

    // Validar y procesar la fecha de devolución
    let fechaDevolucionFinal;
    if (fechaDevolucion) {
      fechaDevolucionFinal = new Date(fechaDevolucion);
      // Verificar si la fecha es válida
      if (isNaN(fechaDevolucionFinal.getTime())) {
        return res.status(400).json({ 
          message: 'La fecha de devolución no es válida' 
        });
      }
      // Verificar que no sea fecha futura
      const hoy = new Date();
      hoy.setHours(23, 59, 59, 999);
      if (fechaDevolucionFinal > hoy) {
        return res.status(400).json({ 
          message: 'La fecha de devolución no puede ser futura' 
        });
      }
    } else {
      return res.status(400).json({ 
        message: 'La fecha de devolución es requerida' 
      });
    }

    console.log('Fecha procesada para devolución:', {
      fechaOriginal: fechaDevolucion,
      fechaProcesada: fechaDevolucionFinal,
      fechaISO: fechaDevolucionFinal.toISOString()
    });

    // Validar que la venta existe y pertenece al usuario
    const venta = await Venta.findOne({ _id: ventaId });
    if (!venta) {
      return res.status(404).json({ message: 'Venta no encontrada' });
    }

    // Validar la lista de productos
    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ 
        message: 'Debe especificar al menos un producto para devolver' 
      });
    }

    // Validar cada producto y crear las devoluciones
    const devoluciones = [];
    let montoTotalDevolucion = 0;

    for (const item of productos) {
      const { productoId, cantidadDevuelta, montoDevolucion } = item;

      // Validar que el producto existe en la venta
      const productoEnVenta = venta.productos.find(
        p => p.productoId.toString() === productoId
      );
      
      if (!productoEnVenta) {
        return res.status(400).json({ 
          message: `Producto no encontrado en la venta` 
        });
      }

      // Validar cantidad a devolver
      if (cantidadDevuelta > productoEnVenta.cantidad) {
        return res.status(400).json({ 
          message: `La cantidad a devolver no puede ser mayor a la cantidad vendida` 
        });
      }      // Crear la devolución para este producto
      const nuevaDevolucion = new Devolucion({
        userId,
        creatorName: user.nombre_negocio || user.email.split('@')[0],
        creatorEmail: user.email,
        ventaId,
        productoId,
        cantidadDevuelta,
        montoDevolucion,
        fechaDevolucion: fechaDevolucionFinal, // Usar la fecha procesada y validada
        motivo,
        estado: 'pendiente'
      });

      await nuevaDevolucion.save();
      devoluciones.push(nuevaDevolucion);

      // Actualizar el stock del producto
      const producto = await Producto.findById(productoId);
      if (producto) {
        producto.cantidadRestante += cantidadDevuelta;
        producto.cantidadVendida -= cantidadDevuelta;
        await producto.save();
      }

      // Actualizar el producto en la venta
      productoEnVenta.cantidad -= cantidadDevuelta;
      montoTotalDevolucion += montoDevolucion;
    }

    // Actualizar la venta
    venta.cantidadDevuelta = (venta.cantidadDevuelta || 0) + productos.reduce((sum, p) => sum + p.cantidadDevuelta, 0);
    venta.montoTotalDevuelto = (venta.montoTotalDevuelto || 0) + montoTotalDevolucion;
    await venta.save();

    // Devolver las devoluciones creadas
    const devolucionesPopuladas = await Promise.all(
      devoluciones.map(dev => 
        Devolucion.findById(dev._id)
          .populate('ventaId')
          .populate('productoId')
      )
    );

    res.status(201).json({
      message: 'Devoluciones creadas exitosamente',
      devoluciones: devolucionesPopuladas
    });
  } catch (error) {
    console.error('Error al crear devolución:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Eliminar una devolución
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.clerk_id;
  const userRole = req.user.role;
  try {
    // Construir la consulta basada en el rol
    const query = userRole === 'user' ? { _id: id, userId } : { _id: id };    // Buscar la devolución con información de la venta
    const devolucion = await Devolucion.findOne(query).populate('ventaId', 'isCompleted');
    if (!devolucion) {
      return res.status(404).json({ message: 'Devolución no encontrada o no tienes permisos para eliminarla' });
    }

    console.log('Intentando eliminar devolución:', {
      devolucionId: id,
      ventaId: devolucion.ventaId?._id,
      isCompleted: devolucion.ventaId?.isCompleted,
      userRole
    });

    // Verificar si la venta está finalizada
    if (devolucion.ventaId && devolucion.ventaId.isCompleted) {
      console.log('Bloqueando eliminación: venta finalizada');
      return res.status(400).json({ 
        message: 'No se puede eliminar una devolución asociada a una venta finalizada' 
      });
    }

    // Actualizar el stock del producto
    const producto = await Producto.findById(devolucion.productoId);
    if (producto) {
      producto.cantidadRestante -= devolucion.cantidadDevuelta;
      producto.cantidadVendida += devolucion.cantidadDevuelta;
      await producto.save();
    }

    // Actualizar la venta
    const venta = await Venta.findById(devolucion.ventaId);
    if (venta) {
      const productoEnVenta = venta.productos.find(
        p => p.productoId.toString() === devolucion.productoId.toString()
      );
      
      if (productoEnVenta) {
        productoEnVenta.cantidad += devolucion.cantidadDevuelta;
        venta.cantidadDevuelta -= devolucion.cantidadDevuelta;
        venta.montoTotalDevuelto = (venta.montoTotalDevuelto || 0) - devolucion.montoDevolucion;
        await venta.save();
      }
    }

    // Eliminar la devolución
    await Devolucion.findByIdAndDelete(id);

    res.json({ message: 'Devolución eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar devolución:', error);
    res.status(500).json({ message: 'Error al eliminar la devolución' });
  }
});

module.exports = router;
