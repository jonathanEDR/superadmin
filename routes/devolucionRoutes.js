const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const Devolucion = require('../models/Devolucion');
const Venta = require('../models/Venta');
const Producto = require('../models/Producto');
const { getFechaHoraActual, formatearFecha, validarFormatoFecha, convertirFechaFrontendAPeruUTC } = require('../utils/fechaHoraUtils');

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
    }

    const [devoluciones, totalDevoluciones] = await Promise.all([
      Devolucion.find(query)
        .populate('productoId', 'nombre precio')
        .populate('ventaId', 'isCompleted estadoPago')
        .lean()
        .sort({ fechaDevolucion: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Devolucion.countDocuments(query)
    ]);

    // Formatear los datos para la respuesta usando utilidad unificada
    const devolucionesFormateadas = devoluciones.map(dev => ({
      _id: dev._id,
      fechaDevolucion: formatearFecha(dev.fechaDevolucion), // Usar utilidad unificada
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
      ventaEstadoPago: dev.ventaId ? dev.ventaId.estadoPago : undefined,
      ventaId: dev.ventaId?._id || dev.ventaId,
      productoId: dev.productoId,
      cantidadDevuelta: dev.cantidadDevuelta
    }));

    // Log para debug
    console.log('Devoluciones formateadas:', devolucionesFormateadas.map(d => ({
      id: d._id,
      producto: d.producto,
      ventaFinalizada: d.ventaFinalizada,
      ventaId: devoluciones.find(orig => orig._id === d._id)?.ventaId?._id,
      ventaIsCompleted: devoluciones.find(orig => orig._id === d._id)?.ventaId?.isCompleted
    })));

    res.json({
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

    // Validar y procesar la fecha de devolución usando utilidad unificada
    let fechaDevolucionFinal;
    if (fechaDevolucion) {
      // Convertir la fecha del frontend a hora de Perú UTC
      const fechaConvertida = convertirFechaFrontendAPeruUTC(fechaDevolucion);
      
      if (!fechaConvertida) {
        return res.status(400).json({ 
          message: 'La fecha de devolución no es válida' 
        });
      }
      
      fechaDevolucionFinal = new Date(fechaConvertida);
      
      // Verificar que no sea fecha futura (comparar en hora de Perú)
      const ahora = new Date();
      const ahoraPeruUTC = new Date(ahora.getTime() - (5 * 60 * 60 * 1000));
      
      if (fechaDevolucionFinal > ahoraPeruUTC) {
        return res.status(400).json({ 
          message: 'La fecha de devolución no puede ser futura' 
        });
      }
    } else {
      // Si no se proporciona fecha, usar fecha actual de Perú
      fechaDevolucionFinal = new Date(getFechaHoraActual());
    }

    console.log('📅 Fecha procesada para devolución (Backend):', {
      fechaOriginal: fechaDevolucion,
      fechaConvertidaPeruUTC: fechaDevolucionFinal.toISOString(),
      fechaDisplay: formatearFecha(fechaDevolucionFinal)
    });

    // Validar que la venta existe y pertenece al usuario - CON POPULATE
    const venta = await Venta.findOne({ _id: ventaId }).populate({
      path: 'productos.productoId',
      select: 'nombre precio'
    });
    console.log('🔍 Backend - Venta encontrada:', {
      id: venta?._id,
      productosCount: venta?.productos?.length || 0,
      productos: venta?.productos?.map(p => ({
        id: p.productoId?._id,
        cantidad: p.cantidad,
        poblado: !!p.productoId?.nombre
      }))
    });
    
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

      // Validar que el producto existe en la venta - MEJORAR BÚSQUEDA
      const productoEnVenta = venta.productos.find(
        p => {
          const productoIdString = p.productoId?._id?.toString() || p.productoId?.toString();
          console.log('🔍 Comparando productos:', {
            buscado: productoId,
            encontrado: productoIdString,
            coincide: productoIdString === productoId
          });
          return productoIdString === productoId;
        }
      );
      
      console.log('🔍 Producto en venta encontrado:', {
        encontrado: !!productoEnVenta,
        cantidad: productoEnVenta?.cantidad
      });
      
      if (!productoEnVenta) {
        console.log('❌ Producto no encontrado. Productos disponibles:', 
          venta.productos.map(p => ({
            id: p.productoId?._id?.toString() || p.productoId?.toString(),
            nombre: p.productoId?.nombre
          }))
        );
        return res.status(400).json({ 
          message: `Producto no encontrado en la venta` 
        });
      }

      // ✅ VALIDACIÓN MEJORADA DE CANTIDAD A DEVOLVER
      if (cantidadDevuelta > productoEnVenta.cantidad) {
        return res.status(400).json({ 
          message: `La cantidad a devolver (${cantidadDevuelta}) no puede ser mayor a la cantidad vendida (${productoEnVenta.cantidad})` 
        });
      }

      if (cantidadDevuelta <= 0) {
        return res.status(400).json({ 
          message: 'La cantidad a devolver debe ser mayor a 0' 
        });
      }

      // Crear la devolución para este producto
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

      // ✅ ACTUALIZACIÓN MEJORADA DEL STOCK EN DEVOLUCIONES
      const producto = await Producto.findById(productoId);
      if (producto) {
        const cantidadVendidaAnterior = producto.cantidadVendida || 0;
        const cantidadVendidaNueva = cantidadVendidaAnterior - cantidadDevuelta;
        
        // Validar que la cantidad vendida no sea negativa
        if (cantidadVendidaNueva < 0) {
          return res.status(400).json({ 
            message: 'Error en cálculo de stock: cantidad vendida resultante sería negativa' 
          });
        }
        
        // Actualizar stock correctamente
        producto.cantidadVendida = cantidadVendidaNueva;
        producto.cantidadRestante = producto.cantidad - cantidadVendidaNueva;
        
        console.log('🔄 Actualizando stock por devolución:', {
          productoNombre: producto.nombre,
          cantidadDevuelta,
          cantidadVendidaAnterior,
          cantidadVendidaNueva,
          cantidadRestante: producto.cantidadRestante
        });
        
        await producto.save();
      }

      // Actualizar el producto en la venta
      productoEnVenta.cantidad -= cantidadDevuelta;
      montoTotalDevolucion += montoDevolucion;
    }

    // Actualizar la venta
    venta.cantidadDevuelta = (venta.cantidadDevuelta || 0) + productos.reduce((sum, p) => sum + p.cantidadDevuelta, 0);
    venta.montoTotalDevuelto = (venta.montoTotalDevuelto || 0) + montoTotalDevolucion;
    
    // ✅ RECALCULAR SUBTOTALES INDIVIDUALES CONSIDERANDO DEVOLUCIONES
    for (const producto of venta.productos) {
      // Buscar todas las devoluciones para este producto en esta venta
      const devolucionesProducto = await Devolucion.find({
        ventaId: ventaId,
        productoId: producto.productoId,
        estado: { $in: ['aprobada', 'completada'] }
      });
      
      // Calcular total devuelto para este producto
      const cantidadTotalDevuelta = devolucionesProducto.reduce((sum, dev) => sum + dev.cantidadDevuelta, 0);
      
      // Calcular cantidad efectiva (original - devuelta)
      const cantidadEfectiva = Math.max(0, producto.cantidad - cantidadTotalDevuelta);
      
      // Actualizar subtotal basado en cantidad efectiva
      const precioUnitario = producto.precioUnitario || producto.precio || 0;
      const subtotalEfectivo = cantidadEfectiva * precioUnitario;
      
      console.log(`💰 Recalculando subtotal para ${producto.productoId}:`, {
        cantidadOriginal: producto.cantidad,
        cantidadDevuelta: cantidadTotalDevuelta,
        cantidadEfectiva: cantidadEfectiva,
        precioUnitario: precioUnitario,
        subtotalAnterior: producto.subtotal,
        subtotalNuevo: subtotalEfectivo
      });
      
      // Actualizar el subtotal del producto
      producto.subtotal = subtotalEfectivo;
    }
    
    // ✅ RECALCULAR MONTO TOTAL BASADO EN SUBTOTALES ACTUALIZADOS
    const montoTotalCalculado = venta.productos.reduce((sum, p) => {
      const subtotalNum = Number(p.subtotal);
      return sum + (isNaN(subtotalNum) ? 0 : subtotalNum);
    }, 0);
    
    // ✅ ACTUALIZAR MONTO TOTAL Y DEUDA
    venta.montoTotal = montoTotalCalculado;
    venta.debe = venta.montoTotal - (venta.cantidadPagada || 0);
    
    
    console.log('💰 Recálculo completo tras devolución:', {
      montoTotalCalculado: montoTotalCalculado,
      montoTotalDevuelto: venta.montoTotalDevuelto,
      cantidadPagada: venta.cantidadPagada || 0,
      debeNuevo: venta.debe,
      subtotalesActualizados: venta.productos.map(p => ({
        producto: p.productoId,
        cantidad: p.cantidad,
        precioUnitario: p.precioUnitario || p.precio,
        subtotal: p.subtotal
      }))
    });
    
    await venta.save();

    // Poblar la venta actualizada con toda la información necesaria
    const ventaActualizada = await Venta.findById(ventaId)
      .populate({
        path: 'productos.productoId',
        select: 'nombre precio codigoProducto categoryId cantidadRestante'
      });

    console.log('✅ Backend - Venta actualizada tras devolución:', {
      ventaId: ventaActualizada._id,
      cantidadDevuelta: ventaActualizada.cantidadDevuelta,
      montoTotalDevuelto: ventaActualizada.montoTotalDevuelto,
      productos: ventaActualizada.productos.map(p => ({
        id: p.productoId._id,
        cantidad: p.cantidad,
        nombre: p.productoId.nombre
      }))
    });

    // Devolver las devoluciones creadas Y la venta actualizada
    const devolucionesPopuladas = await Promise.all(
      devoluciones.map(dev => 
        Devolucion.findById(dev._id)
          .populate('ventaId')
          .populate('productoId')
      )
    );

    res.status(201).json({
      message: 'Devoluciones creadas exitosamente',
      devoluciones: devolucionesPopuladas,
      venta: ventaActualizada
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
  
  // Validar que el ID sea válido
  if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ message: 'ID de devolución inválido' });
  }
  
  try {
    // Construir la consulta basada en el rol
    const query = userRole === 'user' ? { _id: id, userId } : { _id: id };

    // Buscar la devolución con información de la venta
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

    // Eliminar la devolución ANTES de hacer las actualizaciones
    // para prevenir condiciones de carrera
    const devolucionEliminada = await Devolucion.findByIdAndDelete(id);
    
    if (!devolucionEliminada) {
      return res.status(404).json({ message: 'La devolución ya fue eliminada' });
    }

    // Actualizar el stock del producto usando la devolución eliminada
    const producto = await Producto.findById(devolucionEliminada.productoId);
    if (producto) {
      // Solo modificar cantidadVendida, el pre-save recalcula cantidadRestante
      producto.cantidadVendida += devolucionEliminada.cantidadDevuelta;
      await producto.save();
    }

    // Actualizar la venta usando la devolución eliminada
    const venta = await Venta.findById(devolucionEliminada.ventaId);
    if (venta) {
      const productoEnVenta = venta.productos.find(
        p => p.productoId.toString() === devolucionEliminada.productoId.toString()
      );
      
      if (productoEnVenta) {
        productoEnVenta.cantidad += devolucionEliminada.cantidadDevuelta;
        venta.cantidadDevuelta -= devolucionEliminada.cantidadDevuelta;
        venta.montoTotalDevuelto = (venta.montoTotalDevuelto || 0) - devolucionEliminada.montoDevolucion;
        
        // ✅ RECALCULAR SUBTOTALES INDIVIDUALES TRAS ELIMINAR DEVOLUCIÓN
        for (const producto of venta.productos) {
          // Buscar todas las devoluciones restantes para este producto en esta venta
          const devolucionesProducto = await Devolucion.find({
            ventaId: devolucionEliminada.ventaId,
            productoId: producto.productoId,
            estado: { $in: ['aprobada', 'completada'] }
          });
          
          // Calcular total devuelto para este producto (tras eliminar la devolución)
          const cantidadTotalDevuelta = devolucionesProducto.reduce((sum, dev) => sum + dev.cantidadDevuelta, 0);
          
          // Calcular cantidad efectiva (original - devuelta restante)
          const cantidadEfectiva = Math.max(0, producto.cantidad - cantidadTotalDevuelta);
          
          // Actualizar subtotal basado en cantidad efectiva
          const precioUnitario = producto.precioUnitario || producto.precio || 0;
          const subtotalEfectivo = cantidadEfectiva * precioUnitario;
          
          console.log(`💰 Recalculando subtotal tras eliminar devolución para ${producto.productoId}:`, {
            cantidadOriginal: producto.cantidad,
            cantidadDevueltaRestante: cantidadTotalDevuelta,
            cantidadEfectiva: cantidadEfectiva,
            precioUnitario: precioUnitario,
            subtotalAnterior: producto.subtotal,
            subtotalNuevo: subtotalEfectivo
          });
          
          // Actualizar el subtotal del producto
          producto.subtotal = subtotalEfectivo;
        }
        
        // ✅ RECALCULAR MONTO TOTAL BASADO EN SUBTOTALES ACTUALIZADOS
        const montoTotalCalculado = venta.productos.reduce((sum, p) => {
          const subtotalNum = Number(p.subtotal);
          return sum + (isNaN(subtotalNum) ? 0 : subtotalNum);
        }, 0);
        
        // ✅ ACTUALIZAR MONTO TOTAL Y DEUDA
        venta.montoTotal = montoTotalCalculado;
        venta.debe = venta.montoTotal - (venta.cantidadPagada || 0);
        
        await venta.save();
      }
    }

    console.log('Devolución eliminada exitosamente:', id);
    res.json({ 
      message: 'Devolución eliminada correctamente',
      devolucionId: id
    });
    
  } catch (error) {
    console.error('Error al eliminar devolución:', error);
    
    // Error específico para ID inválido
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID de devolución inválido' });
    }
    
    res.status(500).json({ message: 'Error al eliminar la devolución' });
  }
});

module.exports = router;
