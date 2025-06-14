const Cobro = require('../models/Cobro');
const Venta = require('../models/Venta');
const User = require('../models/User');
const { getFechaHoraActual } = require('../utils/fechaHoraUtils');
const mongoose = require('mongoose');

// Obtener ventas pendientes de pago con más detalle
async function getVentasPendientes(userId, role) {
  try {
    console.log('=== Iniciando búsqueda de ventas pendientes ===');
    console.log('userId:', userId);
    console.log('role:', role);

    // Construir el filtro base
    const baseFilter = {
      estadoPago: { $in: ['Pendiente', 'Parcial'] },
      montoTotal: { $gt: 0 }
    };

    // Ajustar el filtro según el rol
    if (role === 'super_admin' || role === 'admin') {
      // Super admin y admin pueden ver todas las ventas pendientes
      console.log('Usuario es admin/super_admin - mostrando todas las ventas pendientes');
    } else {
      // Usuarios normales solo ven sus propias ventas
      console.log('Usuario normal - mostrando solo sus ventas');
      baseFilter.userId = userId;
    }

    console.log('Aplicando filtro:', baseFilter);

    // Buscar ventas pendientes o parcialmente pagadas
    const ventas = await Venta.find(baseFilter)
      .populate({
        path: 'productos.productoId',
        select: 'nombre precio stock' // Seleccionar solo los campos necesarios
      })
      .sort({ fechadeVenta: -1 });

    console.log(`Se encontraron ${ventas.length} ventas pendientes inicialmente`);
    
    if (ventas.length === 0) {
      console.log('No se encontraron ventas que cumplan con los criterios:');
      console.log('- Estado de pago: Pendiente o Parcial');
      console.log('- Monto total mayor a 0');
      return [];
    }

    // Procesar y enriquecer los resultados con validación detallada
    const ventasProcesadas = ventas.map(venta => {
      // Validar y calcular montos
      const cantidadPagada = venta.cantidadPagada || 0;
      const montoTotal = venta.montoTotal || 0;
      const montoPendiente = montoTotal - cantidadPagada;
      const porcentajePagado = montoTotal > 0 ? ((cantidadPagada / montoTotal) * 100).toFixed(2) : '0';

      // Validar que la venta sea válida para cobro
      if (montoPendiente <= 0) {
        console.warn(`Venta ${venta._id} no tiene monto pendiente`);
        return null;
      }

      // Validar y procesar productos
      const productosValidos = venta.productos
        .filter(prod => prod && prod.productoId && prod.cantidad > 0)
        .map(prod => ({
          id: prod.productoId._id,
          nombre: prod.productoId.nombre || 'Producto no disponible',
          cantidad: prod.cantidad,
          precioUnitario: prod.precioUnitario,
          subtotal: prod.subtotal,
          cantidadDevuelta: prod.cantidadDevuelta || 0,
          cantidadEfectiva: prod.cantidad - (prod.cantidadDevuelta || 0)
        }));

      if (productosValidos.length === 0) {
        console.warn(`Venta ${venta._id} no tiene productos válidos`);
        return null;
      }

      // Crear objeto de venta procesado
      return {
        _id: venta._id,
        userId: venta.userId,
        creatorId: venta.creatorId,
        fechadeVenta: venta.fechadeVenta,
        montoTotal: montoTotal,
        cantidadPagada: cantidadPagada,
        montoPendiente: montoPendiente,
        porcentajePagado: porcentajePagado,
        estadoPago: venta.estadoPago,
        productos: productosValidos,
        debe: venta.debe || montoPendiente
      };
    }).filter(Boolean); // Eliminar ventas nulas

    // Logging detallado del resultado
    console.log(`Ventas procesadas: ${ventasProcesadas.length} de ${ventas.length} son válidas para cobro`);
    
    if (ventasProcesadas.length === 0) {
      console.log('No hay ventas válidas para cobro después del procesamiento:');
      console.log('- Verificar que las ventas tengan productos válidos');
      console.log('- Verificar que las ventas tengan montos pendientes');
      return [];
    }

    // Log detallado de cada venta procesada
    ventasProcesadas.forEach(venta => {
      console.log(`Venta ID: ${venta._id} (Usuario: ${venta.userId})`);
      console.log(`  Fecha: ${venta.fechadeVenta}`);
      console.log(`  Monto Total: ${venta.montoTotal}`);
      console.log(`  Pendiente: ${venta.montoPendiente}`);
      console.log(`  Productos: ${venta.productos.length}`);
      console.log('  ---');
    });

    return ventasProcesadas;
  } catch (error) {
    console.error('Error al obtener ventas pendientes:', error);
    throw error;
  }
}

// Obtener historial de pagos
async function getPaymentHistory(userId, role) {
  try {
    console.log('=== Iniciando búsqueda de historial de pagos ===');
    console.log('userId:', userId);
    console.log('role:', role);

    // Construir el filtro base
    let filter = {};

    // Ajustar el filtro según el rol
    if (role === 'super_admin' || role === 'admin') {
      // Super admin y admin pueden ver todos los cobros
      console.log('Usuario es admin/super_admin - mostrando todos los cobros');
    } else {
      // Usuarios normales solo ven sus propios cobros
      console.log('Usuario normal - mostrando solo sus cobros');
      filter.userId = userId;
    }

    console.log('Aplicando filtro:', filter);

    const cobros = await Cobro.find(filter)
      .populate({
        path: 'ventasId',
        select: 'fechadeVenta estadoPago montoTotal montoPagado productos userId',
        populate: {
          path: 'productos.productoId',
          select: 'nombre precio'
        }
      })
      .sort({ fechaCobro: -1 });

    console.log(`Se encontraron ${cobros.length} cobros`);

    // Procesar y enriquecer los resultados
    const cobrosProcesados = cobros.map(cobro => {
      try {
        // Verificar si el cobro tiene las propiedades necesarias
        if (!cobro || !cobro.ventasId) {
          console.warn('Cobro inválido encontrado:', cobro?._id);
          return null;
        }

        // Procesar las ventas incluidas en el cobro
        const ventasProcesadas = cobro.ventasId
          .filter(venta => venta) // Filtrar ventas nulas
          .map(venta => {
            try {
              if (!venta) return null;

              return {
                ventaId: venta._id,
                fechaVenta: venta.fechadeVenta,
                estadoPago: venta.estadoPago,
                montoTotal: venta.montoTotal || 0,
                montoPagado: venta.montoPagado || 0,
                userId: venta.userId,
                productos: (venta.productos || [])
                  .filter(p => p && p.productoId)
                  .map(p => ({
                    nombre: p.productoId?.nombre || 'Producto no disponible',
                    cantidad: p.cantidad || 0,
                    precioUnitario: p.precioUnitario || 0,
                    subtotal: p.subtotal || 0
                  }))
              };
            } catch (ventaError) {
              console.error('Error procesando venta:', ventaError);
              return null;
            }
          })
          .filter(Boolean); // Filtrar resultados nulos

        // Si no hay ventas válidas, omitir este cobro
        if (ventasProcesadas.length === 0) {
          console.warn('Cobro sin ventas válidas:', cobro._id);
          return null;
        }

        return {
          _id: cobro._id,
          userId: cobro.userId,
          creatorId: cobro.creatorId,
          creatorName: cobro.creatorName,
          creatorEmail: cobro.creatorEmail,
          fechaCobro: cobro.fechaCobro,
          totalCobrado: cobro.montoPagado || 0,
          metodoPago: {
            yape: cobro.yape || 0,
            efectivo: cobro.efectivo || 0
          },
          gastosImprevistos: cobro.gastosImprevistos || 0,
          ventas: ventasProcesadas,
          observaciones: cobro.observaciones || '',
          estadoPago: cobro.estadoPago || 'Pagado'
        };
      } catch (cobroError) {
        console.error('Error procesando cobro:', cobroError);
        return null;
      }
    }).filter(Boolean); // Filtrar cobros nulos

    console.log(`Cobros procesados exitosamente: ${cobrosProcesados.length}`);
    return cobrosProcesados;
  } catch (error) {
    console.error('Error al obtener historial de pagos:', error);
    throw error;
  }
}

// Crear nuevo cobro
async function createCobro(cobroData) {
  try {
    console.log('Iniciando creación de cobro...');
    
    // Asegurarse de que la descripción esté definida
    const descripcion = cobroData.descripcion || '';
    
    // Crear el objeto de cobro
    const cobro = new Cobro({
      userId: cobroData.userId,
      creatorId: cobroData.creatorId,
      creatorName: cobroData.creatorName,
      creatorEmail: cobroData.creatorEmail,
      descripcion: descripcion, // Agregar descripción
      ventasId: cobroData.ventas.map(v => v.ventaId),
      montoPagado: cobroData.montoTotal,
      montoTotalVentas: cobroData.montoTotal,
      estadoPago: 'Pagado',
      yape: cobroData.yape || 0,
      efectivo: cobroData.efectivo || 0,
      gastosImprevistos: cobroData.gastosImprevistos || 0,
      fechaPago: new Date(),      distribucionPagos: cobroData.distribucionPagos.map(v => ({
        ventaId: v.ventaId,
        montoPagado: Number(v.montoPagado) || 0,
        montoOriginal: Number(v.montoOriginal) || 0,
        montoPendiente: Number(v.montoPendiente) || 0
      })),
      estado: 'procesando'
    });

    // Guardar el cobro
    const cobroGuardado = await cobro.save();

    // Actualizar el estado de las ventas
    const updatePromises = cobroData.ventas.map(async (venta) => {
      return Venta.findByIdAndUpdate(
        venta.ventaId,
        {
          $set: {
            estadoPago: 'Pagado',
            cantidadPagada: venta.montoPagado,
            ultimaActualizacion: new Date()
          }
        },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    console.log('Cobro creado exitosamente:', cobroGuardado);
    return cobroGuardado;

  } catch (error) {
    console.error('Error al crear cobro:', error);
    throw error;
  }
}

// Obtener historial de cobros con paginación
async function getCobrosHistorial(page = 1, limit = 10) {
  try {
    console.log('Obteniendo historial de cobros - página:', page, 'límite:', limit);
    const skip = (page - 1) * limit;

    // Primero obtener el total de documentos para la paginación
    const total = await Cobro.countDocuments();
    console.log('Total de cobros encontrados:', total);

    if (total === 0) {
      return {
        cobros: [],
        total: 0,
        currentPage: page,
        totalPages: 1
      };
    }

    // Realizar la agregación para obtener los cobros
    const cobros = await Cobro.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'creatorId',
          foreignField: 'clerk_id',
          as: 'creator'
        }
      },
      {
        $lookup: {
          from: 'ventas',
          localField: 'ventasId',
          foreignField: '_id',
          as: 'ventas'
        }
      },
      {
        $addFields: {
          creatorName: { $ifNull: [{ $arrayElemAt: ['$creator.name', 0] }, ''] },
          creatorEmail: { $ifNull: [{ $arrayElemAt: ['$creator.email', 0] }, ''] },
          montoTotal: { $ifNull: [{ $sum: '$ventas.montoTotal' }, 0] },          descripcion: {
            $ifNull: ['$descripcion', { $ifNull: ['$observaciones', ''] }]
          }
        }
      },
      {
        $project: {
          _id: 1,
          fechaPago: 1,
          montoPagado: { $ifNull: ['$montoPagado', 0] },
          yape: { $ifNull: ['$yape', 0] },
          efectivo: { $ifNull: ['$efectivo', 0] },
          gastosImprevistos: { $ifNull: ['$gastosImprevistos', 0] },
          descripcion: 1,
          creatorName: 1,
          creatorEmail: 1,
          creatorId: 1,
          userId: 1,
          ventasId: 1,
          estado: 1,
          montoTotal: 1
        }
      },
      { $sort: { fechaPago: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    console.log(`Se encontraron ${cobros.length} cobros para la página ${page}`);

    return {
      cobros,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    console.error('Error en getCobrosHistorial:', error);
    throw error;
  }
}

// Anular cobro
async function anularCobro(cobroId) {
  try {
    console.log('Iniciando anulación de cobro:', cobroId);
    
    // Buscar el cobro
    const cobro = await Cobro.findById(cobroId);
    if (!cobro) {
      throw new Error('Cobro no encontrado');
    }

    // Obtener las ventas asociadas al cobro
    const ventasIds = cobro.ventasId;

    // Actualizar el estado de las ventas asociadas a pendiente
    await Promise.all(ventasIds.map(async (ventaId) => {
      return Venta.findByIdAndUpdate(
        ventaId,
        {
          $set: {
            estadoPago: 'Pendiente',
            cantidadPagada: 0,
            ultimaActualizacion: new Date()
          }
        }
      );
    }));

    // Eliminar el cobro
    await Cobro.findByIdAndDelete(cobroId);

    return { message: 'Cobro anulado exitosamente' };
  } catch (error) {
    console.error('Error al anular cobro:', error);
    throw error;
  }
}

// Exportar todas las funciones del servicio
module.exports = {
  getVentasPendientes,
  getPaymentHistory,
  createCobro,
  getCobrosHistorial,
  anularCobro
};
