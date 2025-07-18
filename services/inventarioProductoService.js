const InventarioProducto = require('../models/InventarioProducto');
const CatalogoProducto = require('../models/CatalogoProducto');
const MovimientoInventario = require('../models/MovimientoInventario');
const Producto = require('../models/Producto');

class InventarioProductoService {
  
  /**
   * Crear una nueva entrada de inventario
   * Cada entrada es un registro individual con su propio historial
   */
  async crearEntrada(data) {
    try {
      console.log('[DEBUG] crearEntrada iniciado con datos:', data);
      
      const {
        productoId,
        cantidad,
        precio,
        lote = '',
        observaciones = '',
        usuario,
        usuarioEmail,
        fechaVencimiento,
        proveedor = ''
      } = data;

      console.log('[DEBUG] Validando producto registrado:', productoId);
      
      // Validar que el producto registrado existe
      const producto = await Producto.findById(productoId);
      if (!producto) {
        console.error('[ERROR] Producto registrado no encontrado:', productoId);
        throw { status: 404, message: 'Producto registrado no encontrado' };
      }

      console.log('[DEBUG] Producto encontrado:', producto.nombre, 'en categoría:', producto.categoryName);

      // Validar que el producto del catálogo existe
      const catalogoProducto = await CatalogoProducto.findById(producto.catalogoProductoId);
      if (!catalogoProducto) {
        console.error('[ERROR] Producto del catálogo no encontrado:', producto.catalogoProductoId);
        throw { status: 404, message: 'Producto del catálogo no encontrado' };
      }

      console.log('[DEBUG] Producto del catálogo encontrado:', catalogoProducto.nombre);

      if (!catalogoProducto.activo) {
        console.error('[ERROR] Producto inactivo en catálogo:', producto.catalogoProductoId);
        throw { status: 400, message: 'El producto está inactivo en el catálogo' };
      }

      // Validar campos requeridos
      if (!cantidad || cantidad <= 0) {
        throw { status: 400, message: 'La cantidad debe ser mayor a 0' };
      }

      if (!precio || precio <= 0) {
        throw { status: 400, message: 'El precio debe ser mayor a 0' };
      }

      if (!usuario) {
        throw { status: 400, message: 'El usuario es requerido' };
      }

      // Crear nueva entrada individual
      const nuevaEntrada = new InventarioProducto({
        productoId: productoId,
        catalogoProductoId: producto.catalogoProductoId,
        cantidad: Number(cantidad),
        cantidadInicial: Number(cantidad),
        cantidadDisponible: Number(cantidad),
        precio: Number(precio),
        lote,
        observaciones,
        usuario,
        usuarioEmail,
        fechaVencimiento,
        proveedor,
        costoTotal: Number(cantidad) * Number(precio)
      });

      console.log('[DEBUG] Guardando nueva entrada:', nuevaEntrada);
      const entradaGuardada = await nuevaEntrada.save();
      console.log('[DEBUG] Entrada guardada exitosamente:', entradaGuardada._id);
      
      // Poblar información del producto
      await entradaGuardada.populate('productoId');
      await entradaGuardada.populate('catalogoProductoId');

      // Actualizar el stock del producto individual (no del catálogo)
      await this.actualizarStockProductoIndividual(productoId, Number(cantidad));

      // Registrar movimiento de inventario
      await this.registrarMovimiento(entradaGuardada._id, 'ingreso', cantidad, usuario, 'Entrada inicial de inventario');

      console.log('[DEBUG] Entrada completada exitosamente');
      return entradaGuardada;
    } catch (error) {
      console.error('Error al crear entrada:', error);
      throw error;
    }
  }

  /**
   * Listar todas las entradas de inventario con filtros
   */
  async listarEntradas(filtros = {}) {
    try {
      const {
        catalogoProductoId,
        estado,
        usuario,
        fechaDesde,
        fechaHasta,
        lote,
        limit = 50,
        skip = 0,
        sortBy = 'fechaEntrada',
        sortOrder = -1
      } = filtros;

      // Construir query
      const query = {};
      
      if (catalogoProductoId) {
        query.catalogoProductoId = catalogoProductoId;
      }
      
      if (estado) {
        query.estado = estado;
      }
      
      if (usuario) {
        query.usuario = { $regex: usuario, $options: 'i' };
      }
      
      if (lote) {
        query.lote = { $regex: lote, $options: 'i' };
      }
      
      if (fechaDesde || fechaHasta) {
        query.fechaEntrada = {};
        if (fechaDesde) {
          query.fechaEntrada.$gte = new Date(fechaDesde);
        }
        if (fechaHasta) {
          query.fechaEntrada.$lte = new Date(fechaHasta);
        }
      }

      // Ejecutar consulta
      const entradas = await InventarioProducto.find(query)
        .populate('catalogoProductoId', 'nombre codigoproducto')
        .sort({ [sortBy]: sortOrder })
        .limit(Number(limit))
        .skip(Number(skip));

      // Mapear datos para el frontend con formato mejorado
      const entradasFormateadas = entradas.map(entrada => ({
        _id: entrada._id,
        numeroEntrada: entrada.numeroEntrada,
        fecha: entrada.fechaEntrada,
        productoNombre: entrada.catalogoProductoId?.nombre || 'Sin nombre',
        codigoproducto: entrada.catalogoProductoId?.codigoproducto || 'Sin código',
        cantidad: entrada.cantidad,
        cantidadInicial: entrada.cantidadInicial,
        cantidadDisponible: entrada.cantidadDisponible,
        cantidadUtilizada: entrada.cantidadInicial - entrada.cantidadDisponible,
        precio: entrada.precio,
        costoTotal: entrada.costoTotal,
        lote: entrada.lote,
        observaciones: entrada.observaciones,
        estado: entrada.estado,
        usuario: entrada.usuario,
        usuarioEmail: entrada.usuarioEmail,
        proveedor: entrada.proveedor,
        fechaVencimiento: entrada.fechaVencimiento,
        fechaCreacion: entrada.createdAt,
        fechaActualizacion: entrada.updatedAt
      }));

      // Contar total para paginación
      const total = await InventarioProducto.countDocuments(query);

      return {
        entradas: entradasFormateadas,
        total,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error al listar entradas:', error);
      throw error;
    }
  }

  /**
   * Obtener entrada por ID
   */
  async obtenerEntradaPorId(id) {
    try {
      const entrada = await InventarioProducto.findById(id)
        .populate('catalogoProductoId', 'nombre codigoproducto');
      
      if (!entrada) {
        throw { status: 404, message: 'Entrada no encontrada' };
      }

      return entrada;
    } catch (error) {
      console.error('Error al obtener entrada:', error);
      throw error;
    }
  }

  /**
   * Actualizar entrada de inventario
   */
  async actualizarEntrada(id, data) {
    try {
      const entrada = await InventarioProducto.findById(id);
      if (!entrada) {
        throw { status: 404, message: 'Entrada no encontrada' };
      }

      // Campos que se pueden actualizar
      const camposActualizables = [
        'precio', 'lote', 'observaciones', 'fechaVencimiento', 'proveedor', 'estado'
      ];

      camposActualizables.forEach(campo => {
        if (data[campo] !== undefined) {
          entrada[campo] = data[campo];
        }
      });

      // Recalcular costo total si se actualiza el precio
      if (data.precio) {
        entrada.costoTotal = entrada.cantidadInicial * Number(data.precio);
      }

      const entradaActualizada = await entrada.save();
      await entradaActualizada.populate('catalogoProductoId');

      return entradaActualizada;
    } catch (error) {
      console.error('Error al actualizar entrada:', error);
      throw error;
    }
  }

  /**
   * Eliminar entrada de inventario
   */
  async eliminarEntrada(id) {
    try {
      const entrada = await InventarioProducto.findById(id).populate('catalogoProductoId').populate('productoId');
      if (!entrada) {
        throw { status: 404, message: 'Entrada no encontrada' };
      }

      // Verificar si la entrada ha sido utilizada
      if (entrada.cantidadDisponible < entrada.cantidadInicial) {
        throw { status: 400, message: 'No se puede eliminar una entrada que ya ha sido utilizada' };
      }

      // Actualizar el stock del producto individual específico (restar la cantidad)
      await this.actualizarStockProductoIndividual(entrada.productoId._id, -entrada.cantidadDisponible);

      await InventarioProducto.findByIdAndDelete(id);
      
      // Eliminar movimientos asociados
      await MovimientoInventario.deleteMany({ inventario: id });

      return { 
        message: 'Entrada eliminada correctamente',
        cantidadRestada: entrada.cantidadDisponible
      };
    } catch (error) {
      console.error('Error al eliminar entrada:', error);
      throw error;
    }
  }

  /**
   * Registrar movimiento de inventario
   */
  async registrarMovimiento(inventarioId, tipo, cantidad, usuario, descripcion = '') {
    try {
      const movimiento = new MovimientoInventario({
        inventario: inventarioId,
        tipo,
        cantidad,
        usuario,
        descripcion
      });

      await movimiento.save();
      return movimiento;
    } catch (error) {
      console.error('Error al registrar movimiento:', error);
      throw error;
    }
  }

  /**
   * Obtener resumen de inventario por producto
   */
  async obtenerResumenPorProducto(catalogoProductoId) {
    try {
      const resumen = await InventarioProducto.aggregate([
        {
          $match: { 
            catalogoProductoId: catalogoProductoId,
            estado: { $ne: 'inactivo' }
          }
        },
        {
          $group: {
            _id: '$catalogoProductoId',
            totalEntradas: { $sum: 1 },
            cantidadTotal: { $sum: '$cantidadInicial' },
            cantidadDisponible: { $sum: '$cantidadDisponible' },
            cantidadUtilizada: { $sum: { $subtract: ['$cantidadInicial', '$cantidadDisponible'] } },
            costoTotal: { $sum: '$costoTotal' },
            precioPromedio: { $avg: '$precio' },
            ultimaEntrada: { $max: '$fechaEntrada' }
          }
        }
      ]);

      return resumen[0] || null;
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas generales del inventario
   */
  async obtenerEstadisticas() {
    try {
      const stats = await InventarioProducto.aggregate([
        {
          $group: {
            _id: null,
            totalEntradas: { $sum: 1 },
            entradasActivas: { $sum: { $cond: [{ $eq: ['$estado', 'activo'] }, 1, 0] } },
            entradasAgotadas: { $sum: { $cond: [{ $eq: ['$estado', 'agotado'] }, 1, 0] } },
            cantidadTotal: { $sum: '$cantidadInicial' },
            cantidadDisponible: { $sum: '$cantidadDisponible' },
            valorTotal: { $sum: '$costoTotal' }
          }
        }
      ]);

      return stats[0] || {
        totalEntradas: 0,
        entradasActivas: 0,
        entradasAgotadas: 0,
        cantidadTotal: 0,
        cantidadDisponible: 0,
        valorTotal: 0
      };
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      throw error;
    }
  }

  /**
   * Consumir stock de una entrada específica
   */
  async consumirStock(inventarioId, cantidad, usuario, descripcion = '') {
    try {
      const entrada = await InventarioProducto.findById(inventarioId);
      if (!entrada) {
        throw { status: 404, message: 'Entrada no encontrada' };
      }

      if (!entrada.isDisponible()) {
        throw { status: 400, message: 'La entrada no está disponible' };
      }

      if (entrada.cantidadDisponible < cantidad) {
        throw { status: 400, message: 'Stock insuficiente en esta entrada' };
      }

      // Reducir cantidad disponible
      const reducido = entrada.reducirCantidad(cantidad);
      if (!reducido) {
        throw { status: 400, message: 'No se pudo reducir el stock' };
      }

      await entrada.save();

      // Registrar movimiento
      await this.registrarMovimiento(inventarioId, 'venta', cantidad, usuario, descripcion);

      return entrada;
    } catch (error) {
      console.error('Error al consumir stock:', error);
      throw error;
    }
  }

  /**
   * Actualizar stock del producto individual específico
   */
  async actualizarStockProductoIndividual(productoId, cantidadAAgregar) {
    try {
      // Buscar el producto específico
      const producto = await Producto.findById(productoId);
      if (!producto) {
        console.log('Producto no encontrado:', productoId);
        return;
      }

      // Actualizar la cantidad y cantidad restante solo de este producto específico
      producto.cantidad = Math.max(0, (producto.cantidad || 0) + cantidadAAgregar);
      producto.cantidadRestante = Math.max(0, (producto.cantidadRestante || 0) + cantidadAAgregar);

      await producto.save();
      console.log(`Stock actualizado para ${producto.nombre} (${producto.categoryName}): ${cantidadAAgregar >= 0 ? '+' : ''}${cantidadAAgregar}`);

    } catch (error) {
      console.error('Error al actualizar stock del producto individual:', error);
      throw error;
    }
  }

  /**
   * Actualizar stock del producto principal basado en el catálogo
   */
  async actualizarStockProducto(catalogoProductoId, cantidadAAgregar) {
    try {
      // Buscar el producto en el catálogo
      const catalogoProducto = await CatalogoProducto.findById(catalogoProductoId);
      if (!catalogoProducto) {
        console.log('Producto no encontrado en catálogo');
        return;
      }

      // Buscar el producto principal por nombre
      const producto = await Producto.findOne({ nombre: catalogoProducto.nombre });
      if (!producto) {
        console.log('Producto principal no encontrado:', catalogoProducto.nombre);
        return;
      }

      // Actualizar la cantidad y cantidad restante (no permitir valores negativos)
      producto.cantidad = Math.max(0, (producto.cantidad || 0) + cantidadAAgregar);
      producto.cantidadRestante = Math.max(0, (producto.cantidadRestante || 0) + cantidadAAgregar);
      
      await producto.save();
      console.log(`Stock actualizado para ${producto.nombre}: ${cantidadAAgregar >= 0 ? '+' : ''}${cantidadAAgregar}`);
      
      return producto;
    } catch (error) {
      console.error('Error al actualizar stock del producto:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }
}

module.exports = new InventarioProductoService();

