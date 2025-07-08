const Reserva = require('../models/Reserva');
const Producto = require('../models/Producto');

const reservaService = {
  // Obtener todas las reservas
  async getReservas(filtros = {}) {
    try {
      let query = {};
      
      // Aplicar filtros
      if (filtros.estado) {
        query.estado = filtros.estado;
      }
      
      if (filtros.nombreColaborador) {
        query.nombreColaborador = { $regex: filtros.nombreColaborador, $options: 'i' };
      }
      
      if (filtros.fechaDesde || filtros.fechaHasta) {
        query.fechaReserva = {};
        if (filtros.fechaDesde) query.fechaReserva.$gte = new Date(filtros.fechaDesde);
        if (filtros.fechaHasta) query.fechaReserva.$lte = new Date(filtros.fechaHasta);
      }

      const reservas = await Reserva.find(query)
        .populate('productos.productoId', 'nombre precio cantidad cantidadVendida')
        .sort({ fechaReserva: -1 });

      return reservas;
    } catch (error) {
      throw { status: 500, message: 'Error al obtener las reservas' };
    }
  },

  // Crear una nueva reserva
  async createReserva(reservaData) {
    try {
      let montoTotal = 0;
      const productosConDetalles = [];

      console.log('Creando reserva con productos:', reservaData.productos);

      // Verificar cada producto y calcular detalles
      for (const productoItem of reservaData.productos) {
        console.log(`Procesando producto: ${productoItem.productoId}, cantidad: ${productoItem.cantidad}`);
        
        const producto = await Producto.findById(productoItem.productoId);
        if (!producto) {
          throw { status: 404, message: `Producto no encontrado: ${productoItem.productoId}` };
        }

        console.log(`Producto encontrado: ${producto.nombre}, stock actual: ${producto.cantidad}, vendido: ${producto.cantidadVendida}`);

        // Calcular stock disponible
        const stockDisponible = producto.cantidad - producto.cantidadVendida;
        if (stockDisponible < productoItem.cantidad) {
          throw { 
            status: 400, 
            message: `Stock insuficiente para ${producto.nombre}. Disponible: ${stockDisponible}, Solicitado: ${productoItem.cantidad}` 
          };
        }

        const subtotal = producto.precio * productoItem.cantidad;
        montoTotal += subtotal;

        productosConDetalles.push({
          productoId: productoItem.productoId,
          productoNombre: producto.nombre,
          cantidad: productoItem.cantidad,
          cantidadInicial: productoItem.cantidad,
          incrementos: [],
          precioUnitario: producto.precio,
          subtotal: subtotal
        });

        // Actualizar la cantidad vendida del producto (descontar del inventario)
        const cantidadVendidaAnterior = producto.cantidadVendida;
        producto.cantidadVendida += productoItem.cantidad;
        await producto.save();
        
        console.log(`Producto ${producto.nombre} actualizado: cantidadVendida de ${cantidadVendidaAnterior} a ${producto.cantidadVendida}`);
      }

      // Crear la reserva
      const nuevaReserva = new Reserva({
        nombreColaborador: reservaData.nombreColaborador,
        productos: productosConDetalles,
        notas: reservaData.notas,
        userId: reservaData.userId,
        creatorId: reservaData.creatorId,
        creatorName: reservaData.creatorName,
        creatorRole: reservaData.creatorRole,
        montoTotal: montoTotal
      });

      const reservaGuardada = await nuevaReserva.save();
      console.log('Reserva guardada exitosamente:', reservaGuardada._id);

      // Obtener la reserva con información del producto
      const reservaCompleta = await Reserva.findById(reservaGuardada._id)
        .populate('productos.productoId', 'nombre precio cantidad cantidadVendida');

      return reservaCompleta;
    } catch (error) {
      console.error('Error en createReserva:', error);
      throw error.status ? error : { status: 500, message: 'Error al crear la reserva' };
    }
  },

  // Actualizar una reserva
  async updateReserva(id, updateData) {
    try {
      const reservaExistente = await Reserva.findById(id);
      if (!reservaExistente) {
        throw { status: 404, message: 'Reserva no encontrada' };
      }

      // Si se está actualizando productos, validar cambios de stock
      if (updateData.productos) {
        const productosAnteriores = reservaExistente.productos || [];
        const productosNuevos = updateData.productos;

        // Calcular diferencias de cantidad para cada producto
        for (let i = 0; i < productosNuevos.length; i++) {
          const productoNuevo = productosNuevos[i];
          const productoAnterior = productosAnteriores[i];
          
          if (productoAnterior && productoNuevo.productoId.toString() === productoAnterior.productoId.toString()) {
            const diferenciaCantidad = productoNuevo.cantidad - productoAnterior.cantidad;
            
            if (diferenciaCantidad !== 0) {
              const producto = await Producto.findById(productoNuevo.productoId);
              if (producto) {
                // Si aumenta la cantidad, verificar stock disponible
                if (diferenciaCantidad > 0) {
                  const stockDisponible = producto.cantidad - producto.cantidadVendida;
                  if (diferenciaCantidad > stockDisponible) {
                    throw { 
                      status: 400, 
                      message: `Stock insuficiente para ${producto.nombre}. Disponible: ${stockDisponible}` 
                    };
                  }
                }
                
                // Actualizar cantidad vendida
                producto.cantidadVendida += diferenciaCantidad;
                await producto.save();
              }
            }
          }
        }
      }

      // Si se está cambiando el estado a 'completada', actualizar fecha de entrega y devolver stock
      if (updateData.estado === 'completada' && reservaExistente.estado !== 'completada') {
        updateData.fechaEntrega = new Date();
        
        // Devolver stock al inventario para que pueda venderse nuevamente
        console.log('Completando reserva y devolviendo stock al inventario...');
        for (const productoItem of reservaExistente.productos) {
          console.log(`Procesando devolución para producto: ${productoItem.productoId}, cantidad a devolver: ${productoItem.cantidad}`);
          
          const producto = await Producto.findById(productoItem.productoId);
          if (producto) {
            const cantidadVendidaAnterior = producto.cantidadVendida;
            producto.cantidadVendida -= productoItem.cantidad;
            
            // Asegurar que no sea negativo
            if (producto.cantidadVendida < 0) {
              producto.cantidadVendida = 0;
            }
            
            await producto.save();
            console.log(`Producto ${producto.nombre} actualizado: cantidadVendida de ${cantidadVendidaAnterior} a ${producto.cantidadVendida}`);
          } else {
            console.log(`Producto ${productoItem.productoId} no encontrado al devolver stock`);
          }
        }
      }

      // Si se está cancelando una reserva activa, devolver stock a los productos
      if (updateData.estado === 'cancelada' && reservaExistente.estado === 'activa') {
        console.log('Cancelando reserva y devolviendo stock...');
        for (const productoItem of reservaExistente.productos) {
          console.log(`Procesando devolución para producto: ${productoItem.productoId}, cantidad a devolver: ${productoItem.cantidad}`);
          
          const producto = await Producto.findById(productoItem.productoId);
          if (producto) {
            const cantidadVendidaAnterior = producto.cantidadVendida;
            producto.cantidadVendida -= productoItem.cantidad;
            
            // Asegurar que no sea negativo
            if (producto.cantidadVendida < 0) {
              producto.cantidadVendida = 0;
            }
            
            await producto.save();
            console.log(`Producto ${producto.nombre} actualizado: cantidadVendida de ${cantidadVendidaAnterior} a ${producto.cantidadVendida}`);
          } else {
            console.log(`Producto ${productoItem.productoId} no encontrado al devolver stock`);
          }
        }
      }

      const reservaActualizada = await Reserva.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).populate('productos.productoId', 'nombre precio cantidad cantidadVendida');

      return reservaActualizada;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al actualizar la reserva' };
    }
  },

  // Eliminar una reserva
  async deleteReserva(id) {
    try {
      const reserva = await Reserva.findById(id);
      if (!reserva) {
        throw { status: 404, message: 'Reserva no encontrada' };
      }

      console.log('Eliminando reserva:', id, 'Estado:', reserva.estado);

      // Si la reserva está activa, devolver stock a los productos
      if (reserva.estado === 'activa') {
        console.log('Devolviendo stock de productos a inventario...');
        for (const productoItem of reserva.productos) {
          console.log(`Procesando devolución para producto: ${productoItem.productoId}, cantidad a devolver: ${productoItem.cantidad}`);
          
          const producto = await Producto.findById(productoItem.productoId);
          if (producto) {
            const cantidadVendidaAnterior = producto.cantidadVendida;
            producto.cantidadVendida -= productoItem.cantidad;
            
            // Asegurar que no sea negativo
            if (producto.cantidadVendida < 0) {
              producto.cantidadVendida = 0;
            }
            
            await producto.save();
            console.log(`Producto ${producto.nombre} actualizado: cantidadVendida de ${cantidadVendidaAnterior} a ${producto.cantidadVendida}`);
          } else {
            console.log(`Producto ${productoItem.productoId} no encontrado al devolver stock`);
          }
        }
      }

      await Reserva.findByIdAndDelete(id);
      console.log('Reserva eliminada exitosamente');
      return reserva;
    } catch (error) {
      console.error('Error en deleteReserva:', error);
      throw error.status ? error : { status: 500, message: 'Error al eliminar la reserva' };
    }
  },

  // Obtener una reserva por ID
  async getReservaById(id) {
    try {
      const reserva = await Reserva.findById(id)
        .populate('productos.productoId', 'nombre precio cantidad cantidadVendida');
      
      if (!reserva) {
        throw { status: 404, message: 'Reserva no encontrada' };
      }
      
      return reserva;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al obtener la reserva' };
    }
  },

  // Incrementar cantidad de un producto específico en una reserva
  async incrementarCantidadProducto(reservaId, productoId, cantidadAdicional, usuario) {
    try {
      const reserva = await Reserva.findById(reservaId);
      if (!reserva) {
        throw { status: 404, message: 'Reserva no encontrada' };
      }

      if (reserva.estado !== 'activa') {
        throw { status: 400, message: 'Solo se puede modificar reservas activas' };
      }

      // Encontrar el producto en la reserva
      const productoIndex = reserva.productos.findIndex(p => p.productoId.toString() === productoId);
      if (productoIndex === -1) {
        throw { status: 404, message: 'Producto no encontrado en la reserva' };
      }

      // Verificar stock disponible
      const producto = await Producto.findById(productoId);
      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }

      const stockDisponible = producto.cantidad - producto.cantidadVendida;
      if (stockDisponible < cantidadAdicional) {
        throw { 
          status: 400, 
          message: `Stock insuficiente. Disponible: ${stockDisponible}, Solicitado: ${cantidadAdicional}` 
        };
      }

      // Actualizar cantidad y agregar incremento
      reserva.productos[productoIndex].cantidad += cantidadAdicional;
      reserva.productos[productoIndex].incrementos.push({
        cantidad: cantidadAdicional,
        fecha: new Date(),
        usuario: usuario
      });

      // Recalcular subtotal
      reserva.productos[productoIndex].subtotal = 
        reserva.productos[productoIndex].cantidad * reserva.productos[productoIndex].precioUnitario;

      // Recalcular total general
      reserva.montoTotal = reserva.productos.reduce((total, prod) => total + prod.subtotal, 0);

      // Actualizar stock del producto
      producto.cantidadVendida += cantidadAdicional;
      await producto.save();

      // Guardar reserva
      await reserva.save();

      // Retornar reserva actualizada con populate
      const reservaActualizada = await Reserva.findById(reservaId)
        .populate('productos.productoId', 'nombre precio cantidad cantidadVendida');

      return reservaActualizada;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al incrementar cantidad del producto' };
    }
  },

  // Decrementar cantidad de un producto en una reserva
  async decrementarProductoReserva(reservaId, productoId, cantidadReducir, userData) {
    try {
      // Buscar la reserva
      const reserva = await Reserva.findById(reservaId);
      if (!reserva) {
        throw { status: 404, message: 'Reserva no encontrada' };
      }

      if (reserva.estado !== 'activa') {
        throw { status: 400, message: 'Solo se puede modificar reservas activas' };
      }

      // Encontrar el producto en la reserva
      const productoIndex = reserva.productos.findIndex(
        p => p.productoId.toString() === productoId.toString()
      );

      if (productoIndex === -1) {
        throw { status: 404, message: 'Producto no encontrado en la reserva' };
      }

      const productoReserva = reserva.productos[productoIndex];

      // Verificar que no se reduzca más de lo que hay
      if (cantidadReducir >= productoReserva.cantidad) {
        throw { status: 400, message: 'No se puede reducir más cantidad de la que está reservada' };
      }

      // Buscar el producto en la BD
      const producto = await Producto.findById(productoId);
      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }

      // Actualizar cantidades
      productoReserva.cantidad -= cantidadReducir;
      productoReserva.subtotal = productoReserva.cantidad * productoReserva.precioUnitario;

      // Agregar al historial de decrementos
      productoReserva.decrementos.push({
        cantidad: cantidadReducir,
        fecha: new Date(),
        usuario: userData.name || userData.firstName || 'Usuario'
      });

      // Recalcular monto total de la reserva
      reserva.montoTotal = reserva.productos.reduce((total, p) => total + p.subtotal, 0);

      // Devolver stock al producto (reducir cantidadVendida)
      producto.cantidadVendida -= cantidadReducir;
      await producto.save();

      // Guardar reserva
      await reserva.save();

      // Retornar reserva actualizada con populate
      const reservaActualizada = await Reserva.findById(reservaId)
        .populate('productos.productoId', 'nombre precio cantidad cantidadVendida');

      return reservaActualizada;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al decrementar cantidad del producto' };
    }
  },

  // Obtener estadísticas de reservas
  async getEstadisticasReservas() {
    try {
      const estadisticas = await Reserva.aggregate([
        {
          $group: {
            _id: '$estado',
            cantidad: { $sum: 1 },
            montoTotal: { $sum: '$montoTotal' }
          }
        }
      ]);

      const totalReservas = await Reserva.countDocuments();
      
      return {
        totalReservas,
        porEstado: estadisticas
      };
    } catch (error) {
      throw { status: 500, message: 'Error al obtener estadísticas' };
    }
  },

  // Obtener reservas completadas
  async getReservasCompletadas() {
    try {
      const reservasCompletadas = await Reserva.find({ estado: 'completada' })
        .populate('productos.productoId', 'nombre precio cantidad cantidadVendida')
        .sort({ updatedAt: -1 }); // Ordenar por fecha de actualización (cuando se completó) más reciente primero

      return reservasCompletadas;
    } catch (error) {
      throw { status: 500, message: 'Error al obtener las reservas completadas' };
    }
  },

  // Agregar un nuevo producto a una reserva existente
  async agregarProductoAReserva(reservaId, productoId, cantidad, userData) {
    try {
      const reserva = await Reserva.findById(reservaId);
      if (!reserva) {
        throw { status: 404, message: 'Reserva no encontrada' };
      }

      if (reserva.estado !== 'activa') {
        throw { status: 400, message: 'Solo se pueden agregar productos a reservas activas' };
      }

      // Verificar que el producto no esté ya en la reserva
      const productoExistente = reserva.productos.find(p => p.productoId.toString() === productoId.toString());
      if (productoExistente) {
        throw { status: 400, message: 'El producto ya está en la reserva. Use la función de incrementar cantidad.' };
      }

      // Verificar stock disponible
      const producto = await Producto.findById(productoId);
      if (!producto) {
        throw { status: 404, message: 'Producto no encontrado' };
      }

      const stockDisponible = producto.cantidad - producto.cantidadVendida;
      if (stockDisponible < cantidad) {
        throw { 
          status: 400, 
          message: `Stock insuficiente. Disponible: ${stockDisponible}, Solicitado: ${cantidad}` 
        };
      }

      // Calcular subtotal
      const subtotal = producto.precio * cantidad;

      // Agregar el nuevo producto a la reserva
      const nuevoProducto = {
        productoId: productoId,
        productoNombre: producto.nombre,
        cantidad: cantidad,
        cantidadInicial: cantidad,
        incrementos: [],
        decrementos: [],
        precioUnitario: producto.precio,
        subtotal: subtotal
      };

      reserva.productos.push(nuevoProducto);

      // Recalcular monto total
      reserva.montoTotal = reserva.productos.reduce((total, p) => total + p.subtotal, 0);

      // Actualizar stock del producto
      producto.cantidadVendida += cantidad;
      await producto.save();

      // Guardar reserva
      await reserva.save();

      // Retornar reserva actualizada con populate
      const reservaActualizada = await Reserva.findById(reservaId)
        .populate('productos.productoId', 'nombre precio cantidad cantidadVendida');

      return reservaActualizada;
    } catch (error) {
      throw error.status ? error : { status: 500, message: 'Error al agregar producto a la reserva' };
    }
  }
};

module.exports = reservaService;
